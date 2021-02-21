+++
title = "Envoy WASM Filters in Rust"
author = ["Martin Baillie"]
date = 2020-08-17T08:01:00+10:00
tags = ["rust", "wasm", "envoy", "istio", "kubernetes", "release"]
draft = false
tldr = "Example filter for conditionally adding HTTP headers on-the-fly."
+++

## WASM {#wasm}

I have had a renewed interest in WASM ever since I read the Mozilla WASI
[announcement](https://hacks.mozilla.org/2019/03/standardizing-wasi-a-webassembly-system-interface/) and some of its supporting literature. A few things clicked for me
after that, most prominently the potential for use beyond the browser. The
compile once, run anywhere aspects echo the Linux container revolution of the
last decade, but with true sandboxing, faster starts and without the baggage of
a Linux userspace.

The poster child of that revolution was of course Docker. It arguably ushered in
a new paradigm for packaging and deploying software to cloud and enterprise
computing landscapes that was both efficient and cost-effective. Sure, the
backing company is an omnishambles, but its tech concepts live on in various
forms.

Docker achieved all of this despite not being the first to utilise the Linux
kernel's `cgroups(7)` and `namespaces(7)` features in a cohesive manner, nor Linux even
being the first to offer such virtualised isolation at all. Other OSes have
famously had similar offerings since the early noughties, notably FreeBSD's
[Jails](https://www.freebsd.org/doc/handbook/jails.html) and Solaris' [Zones](https://en.wikipedia.org/wiki/Solaris%5FContainers) (which hold a special place in my heart from my time
interning at Sun).

So why, then, did Docker beat the others? The answer I often see touted
elsewhere and that I personally believe is **_developer experience_**. It
democratised those Linux container primitives through an abstraction, provided a
simplistic product engineer focused CLI workflow, and defined an immutable image
format solving for the _"works on my machine"_ problem. Those product engineers
could now build, ship and run their workloads on any server with a Docker
daemon.

WASI implementers will face this same hurdle to become successful on the server,
but can benefit from being more integrated to tooling and platforms. This can
already be seen with the burgeoning support for compile targets in the
toolchains of languages like Rust, C++, Go and AssemblyScript (a TypeScript
subset), as well as edge compute platforms like Fastly's Lucet and Cloudflare's
Workers, Ethereum through [eWasm](https://ewasm.readthedocs.io/en/mkdocs/) and even good ol' Kubernetes through [Krustlet](https://github.com/deislabs/krustlet).

> Incidentally, Krustlet now supports multiple providers ([Wasmtime](https://wasmtime.dev/), [waSCC](https://wascc.dev/)) but
> I view this (in keeping with the container metaphor) as being less analogous
> to the orchestration system wars of Kubernetes/Mesos/Rancher/Swarm/Nomad and
> more to container runtime e.g. Docker/runc/CRI-O/Rocket. Wasmtime aims for
> strict adherence to WASI, and waSCC is an interesting approach based on the
> Actor model, though I'm not clear on its relationship to the WASI spec.

## Envoy {#envoy}

Envoy has supported WASM extensions for a while now (even predating WASI, but
there are plans afoot to re-align). It does this by implementing the
`proxy-wasm` [spec](https://github.com/proxy-wasm/spec), an open standard ABI for interoperability between WASM VMs
and a host proxy. The idea being that in the future if a great extension exists
for say HAProxy, then it would also be usable in Envoy, Nginx and any other
proxy also implementing this spec. An ambitious venture for sure.

Anyway, Envoy is leading the charge on this by a long shot at the moment and
this is useful for me because it is fast becoming the universal data plane for
services meshes, including the one we operate at my current gig as our platform
SOA backbone: Istio.

Being early adopters of Istio we now have a few hundred services in our
platform's mesh. We built the platform atop Kubernetes and have found the pod a
useful axiom for offering cross-cutting functionality to our users through the
sidecar pattern. For example: injecting secrets, pub/sub over CloudEvents or
rotating DB credentials.

Taking care of common technological concerns like these allow our users to have
increased focus on building differentiating product features.

---

Now, to automatically bolt-on these functional building blocks we invariably
utilise Kubernetes controllers or mutating webhooks to inject _**additional**_
containers alongside the "primary" container during admission. To make that
concrete to the more Kubernetes-initiated reader, `6/6 Running` is not an
uncommon sight in a `kubectl get pods` output from our platform.

Despite the overwhelming majority of the sidecars we write (or reuse from the
community) being in Go, and even after careful attention being paid to ensuring
low and stable resource requirements, they do still add up. This is especially
true when you have large clusters full of workloads utilising them (a curse of
success I suppose).

However, since we are using Istio there is another avenue that avoids additional
containers (for bolting on network related functionality at least) and that is
the _**Envoy filter**_.

### Envoy Filters {#envoy-filters}

In an Istio-enabled pod there is a necessary Envoy sidecar container (so if
you're following, that's `2/2 Running` on our platform by default!). It acts as
the gatekeeper to the pod's network thanks to a Kubernetes CNI plugin
manipulating the pod `iptables`. So all pod packets ingress and egress route
through that Envoy, and Envoy filters can be used manipulate them as they
traverse the proxy's internal network and application protocol processing stack.

It is worth mentioning that Envoy has a strong catalogue of native [filters](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http%5Ffilters/http%5Ffilters)
available and Istio in turn has facilities for enabling them through the
[`EnvoyFilter`](https://istio.io/latest/docs/reference/config/networking/envoy-filter/) CRD. So that should always be your first port of call. But what do
you do if you have a use case that is not covered in a native filter?

You have two options:

1.  Write a new filter into Envoy's source and compile a custom version.

    This is tried and true, but requires you to maintain a custom supply chain
    for Envoy and keep it rebased. You are also limited to C++ in terms of
    languages (unless you get creative) given that is what Envoy is written in.

2.  Write a new filter and dynamically load it at runtime using a WASM VM.

    This is why I'm writing this fieldnote today. Doing this is becoming
    increasingly accessible to your average Joe like me. Through the `proxy-wasm`
    spec implementation, Envoy is allowing embedded but securely isolated binary
    extension without the need to hack up the source. You can do this right now
    with SDKs in [Rust](https://github.com/proxy-wasm/proxy-wasm-rust-sdk) [C++](https://github.com/proxy-wasm/proxy-wasm-cpp-sdk), [AssemblyScript](https://github.com/yskopets/envoy-wasm-assemblyscript-sdk) and even early [Go](https://github.com/tetratelabs/proxy-wasm-go-sdk) support.

## Example: Writing a HTTP Header Augmenting Filter {#example-writing-a-http-header-augmenting-filter}

Earlier I was talking about functional building blocks offered to our platform
users. One such example is an injected sidecar that refreshes tokens from an IdP
and supplies them to the primary container, either via a UNIX file descriptor or
by POST'ing to a local HTTP endpoint. The primary container can subsequently use
the token in RPCs to upstream integrations without concerning itself with
token lifecycle.

{{< figure src="/ox-hugo/sidecar_full.png" alt="Sidecar use case" >}}

> NOTE: There's absolutely no need to do this for inter-mesh RPCs of course.
> Istio ([SPIFFE](https://spiffe.io/)) workload identity is state-of-the-art. The use case here is to
> federate workload identity beyond the mesh itself across multiple network hops
> e.g. to legacy on-premises services.

Now I should start by saying this _ain't broke_ and I'm not paid to fix things
that _ain't broke_ at work. We wrote it quickly and it does its thing.

On the other hand, it is objectively sub-optimal. For one, it is yet another
sidecar container. Worse than that, though, it puts the onus of responsibility
back on the product engineers to write code that either polls or uses
`inotify(7)` on that token file, or otherwise uses a dedicated HTTP handler to
receive the tokens.

---

I had been revisiting Rust recently and so last weekend I wanted to see if I
could improve on this use case with an Envoy filter, using the nascent Rust
`proxy-wasm` SDK.

As it transpired, it is entirely possible to get rid of that additional sidecar
container and instead utilise the one sidecar container that cannot be gotten
rid of (Envoy) to procure, refresh and conditionally add the IdP token to
outbound HTTP headers.

So that's no additional platform sidecar overhead, no additional coding for
product engineers:

{{< figure src="/ox-hugo/sidecar_less.png" alt="Sidecar-less use case" >}}

To prove the concept I implemented a generic HTTP filter that can augment
requests with additional headers automatically discovered from a 3rd party
endpoint at regular intervals. The full example is on [GitHub](https://github.com/martinbaillie/envoy-wasm-header-augmenting-filter) but I'll talk
through some key parts below.

> NOTE: the header-providing 3rd party service can be any configured Envoy
> cluster. So in an Istio context, this could be another sidecar available over
> loopback in the same pod, or some external centralised service perhaps in the
> greater mesh authorising based on SPIFFE identity, or even outside of the mesh
> authorising on Kubernetes service account token or cloud IAM for example, all
> the while benefiting from circuit breakers, retries, load balancing and other
> usual Istio-Envoy goodness.

### Getting booted {#getting-booted}

I found the documentation sparse but the [traits](https://github.com/proxy-wasm/proxy-wasm-rust-sdk/blob/master/src/traits.rs) easy enough to decipher. The key
thing to know is there's seemingly 3 "Contexts" available:

1.  Root
2.  HTTP
3.  Stream

Root is a singleton that should be initialised as the WASM VM boots. It is the
right place to setup shared data and timers. HTTP and Stream are called during
HTTP and TCP filter chains respectively, though I suspect the latter is more
nuanced than that. I only made use of the Root and HTTP contexts in my example.

To register context implementations there's the special `_start()` function called by the Envoy host when initialising.

```rust
pub fn _start() {
    proxy_wasm::set_log_level(LogLevel::Trace);
    proxy_wasm::set_root_context(|context_id| -> Box<dyn RootContext> {
        CONFIGS.with(|configs| {
            configs
                .borrow_mut()
                .insert(context_id, FilterConfig::default());
        });

        Box::new(RootHandler { context_id })
    });
    proxy_wasm::set_http_context(|_context_id, _root_context_id| -> Box<dyn HttpContext> {
        Box::new(HttpHandler {})
    })
}
```

This is also seemed to be the most fitting place for me to set the log level.

### Configuring the filter {#configuring-the-filter}

For my configuration I created a [Serde](https://github.com/serde-rs/json) type to deserialise from JSON because JSON works best with how the host Envoy wants to do configuration.

```rust
#[derive(Deserialize, Debug)]
#[serde(default)]
struct FilterConfig {
    /// The Envoy cluster name housing a HTTP service that will provide headers
    /// to add to requests.
    header_providing_service_cluster: String,

    /// The path to call on the HTTP service providing headers.
    header_providing_service_path: String,

    /// The authority to set when calling the HTTP service providing headers.
    header_providing_service_authority: String,

    /// The length of time to keep headers cached.
    #[serde(with = "serde_humanize_rs")]
    header_cache_expiry: Duration,
}
```

To get some configuration values into the filter there's an `on_configure()`
hook method called on the `RootContext` as the WASM VM boots, and this can be
married with the `get_configuration()` method for actually getting the configuration bytes.

### Populating the token {#populating-the-token}

Another useful method on the `RootContext` is `on_tick()` which is a ticker
controlled by `set_tick_period()`. I use it to dispatch calls to the header
providing endpoint (e.g. the IdP) on an interval.

```rust
fn on_tick(&mut self) {
        // Log the action that is about to be taken.
        match self.get_shared_data(CACHE_KEY) {
            (None, _) => debug!("initialising cached headers"),
            (Some(_), _) => debug!("refreshing cached headers"),
        }

        CONFIGS.with(|configs| {
            configs.borrow().get(&self.context_id).map(|config| {
                ...
                // Dispatch an async HTTP call to the configured cluster.
                self.dispatch_http_call(
                    &config.header_providing_service_cluster,
                    vec![
                        (":method", "GET"),
                        (":path", &config.header_providing_service_path),
                        (":authority", &config.header_providing_service_authority),
                    ],
                    None,
                    vec![],
                    Duration::from_secs(5),
                )
                .map_err(|e| {
                    ...
                })
            })
        });
    }
```

However this is not your typical RPC. It is async from the caller's perspective and you have to play ball with Envoy's internal processing stack. The other side can be grabbed when the `on_http_call_response()` hook method triggers.

```rust
fn on_http_call_response(
        &mut self,
        _token_id: u32,
        _num_headers: usize,
        body_size: usize,
        _num_trailers: usize,
    ) {
        // Gather the response body of previously dispatched async HTTP call.
        let body = match self.get_http_call_response_body(0, body_size) {
            Some(body) => body,
            None => {
                ...
            }
        };

        // Store the body in the shared cache.
        match self.set_shared_data(CACHE_KEY, Some(&body), None) {
            ...
        }
    }
}
```

### Using shared data {#using-shared-data}

The snippets above make passing reference to "shared data". There are facilities
in the `proxy-wasm` ABI for storing and retrieving data in a safe manner. In
this example I refresh the headers to be added to outbound requests on a
recurring tick, and cache them in shared data in the `RootContext`, out-of-band
from the HTTP filter chains.

The final piece of the puzzle is to retrieve the currently cached, to-be-inserted
headers during the hot path of an outbound request, and insert them into the
payload.

This is done on the `HttpContext`, when the `on_http_request_headers()` hook method triggers on the outbound request.

```rust
impl HttpContext for HttpHandler {
    fn on_http_request_headers(&mut self, _num_headers: usize) -> Action {
        match self.get_shared_data(CACHE_KEY) {
            (Some(cache), _) => {
                debug!(
                    "using existing header cache: {}",
                    String::from_utf8(cache.clone()).unwrap()
                );

                match self.parse_headers(&cache) {
                    Ok(headers) => {
                        for (name, value) in headers {
                            self.set_http_request_header(&name, value.as_str())
                        }
                    }
                    ...
                }

                Action::Continue
            }
            ...
```

### Deploying it {#deploying-it}

In the [hack directory](https://github.com/martinbaillie/envoy-wasm-header-augmenting-filter/tree/master/hack) I have a Docker compose stack complete with source,
destination and header providing containers, and an Envoy container configured
with the currently compiled filter. It mimics the Kubernetes/Istio pod network
setup and I found it useful for locally developing the filter.

Testing the real deal was a little trickier. Manually distributing the Envoy
filter binary to a test Kubernetes cluster such that it could be utilised by an
Istio `EnvoyFilter` resource necessitated jumping through a few hoops, but only
because I like making things difficult it seems. For the record there are
promising tools like Solo.io's [`wasme`](https://docs.solo.io/web-assembly-hub/latest/reference/cli/wasme/) suite and [AssemblyHub](https://webassemblyhub.io/) solving the filter
distribution problem. Additionally, with OCI registries like AWS's ECR starting
to support [OCI artifact types](https://github.com/opencontainers/artifacts/blob/master/artifact-authors.md), there is nothing stopping use of them as a WASM
module registry in addition to your typical OCI images.

Anyway, my approach was simply to use a `ConfigMap` to hold the WASM binary. The
`binaryData` field is esoteric but has actually existed since Kubernetes 1.10.
Doing it this way went a bit sideways when I realised the `ConfigMap` resource
has a size limit of 1mb, presumably hamstrung by `etcd` value limits, and my
un-optimised Rust compiler was producing WASM binaries in excess of that. What
followed was a few rounds of optimisation:

1.  2.1mb --> 1.7mb after reducing macro usage in the code.
2.  1.7mb --> 372kb when compiled with `lto=true` and `opt-level=s`.
3.  372kb --> 131kb when compiled through [`wasm-pack`](https://github.com/rustwasm/wasm-pack).

Nice. That was more than enough for Kubernetes to accept my WASM binary as a
`ConfigMap`. I made use of Kustomize's [files feature](https://github.com/martinbaillie/envoy-wasm-header-augmenting-filter/blob/master/hack/kustomization.yaml#L15-L17) to do the serialisation on the fly.

---

So now that the binary was in a binary `ConfigMap` in my cluster, I needed to
get it loaded into the target pod's Envoy. This is not as simple as editing a
`Deployment` spec's mounts because that Envoy is itself injected by Istio.

Fortunately there's a handy mount annotation that can be put on the `Deployment`
spec.

```yaml
template:
  metadata:
    annotations:
      sidecar.istio.io/userVolumeMount: >
        '{ "filter":{"mountPath":"/etc/filter.wasm","subPath":"filter.wasm"} }'
```

This reflects in the injected Envoy container stanza. Then all you need is to mount the `ConfigMap` to the pod.

```yaml
volumes:
  - name: filter
    configMap:
      name: filter
```

With that done, the Envoy container has the custom filter available to its
userspace at `/etc/filter.wasm`. The final piece is to tell the Envoy process to
use it, and this is done by selecting it with an `EnvoyFilter` CRD loaded with
our custom configuration.

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: sourceworkload
spec:
  configPatches:
    - applyTo: HTTP_FILTER
      match:
        context: SIDECAR_OUTBOUND
        listener:
          filterChain:
            filter:
              name: envoy.http_connection_manager
              subFilter:
                name: envoy.router
      patch:
        operation: INSERT_BEFORE
        value:
          config:
            config:
              configuration: |
                {
                  "header_providing_service_cluster": "inbound|8081|mgmt-8081|mgmtCluster",
                  "header_providing_service_authority": "localhost"
                }
              name: header_augmenting_filter
              rootId: header_augmenting_filter
              vmConfig:
                code:
                  local:
                    filename: /etc/filter.wasm
                runtime: envoy.wasm.runtime.v8
                allow_precompiled: true
          name: envoy.filters.http.wasm
  workloadSelector:
    labels:
      app: sourceworkload
```

In this example I am sliding the filter into the HTTP outbound chain and using
the existing `mgmt` cluster to call the header providing container over
loopback. As mentioned at the start of this section, there are many ways to skin
that cat.
