+++
title = "Controlling Client SNI with Hyper"
author = ["Martin Baillie"]
date = 2020-09-27T19:09:00+10:00
tags = ["rust", "hyper", "security"]
draft = false
tldr = "There is at least one way to take control of client SNI in Rust."
+++

I recently revisited Rust after a few years hiatus and in one project I found
myself needing to provide a different Server Name Indicator (SNI) when
initiating a TLS connection to a remote host.

In Go this is as simple as setting the `ServerName` field on the standard
library's TLS configuration struct.

```go
(&http.Client{
    Transport: &http.Transport{
        TLSClientConfig: &tls.Config{
            ServerName: "somewhere.com",
        },
    },
}).Get("https://somewhere-else.com")
```

And is also what you can achieve with the `openssl` and `curl` CLIs for example.

```shell
; openssl s_client -connect somewhere-else.com:443 -servername somewhere.com
; curl --resolve somewhere.com:443:<somewhere-else.com IP> https://somewhere.com
```

However, to my surprise, getting the equivalent in Rust was quite awkward. My
search for copypasta-able prior art failed to uncover anything usable and so I
thought I would document at least _one_ way of doing it, with [Hyper](https://github.com/hyperium/hyper), in case it
helps a future weary traveler.

> My project actually started out higher up the abstraction stack with [Reqwest](https://github.com/seanmonstar/reqwest) but
> at this level there's little in the way of control provided over the underlying
> TLS settings. This forces dipping into the likes of Hyper.

## But why? {#but-why}

In my experience passing a different SNI is a somewhat typical requirement for
proxies doing virtual hosting or gateways doing [domain fronting](https://en.wikipedia.org/wiki/Domain%5Ffronting).

In my particular case, I needed to send an HTTPS request to an [AWS PrivateLink](https://docs.aws.amazon.com/whitepapers/latest/aws-vpc-connectivity-options/aws-privatelink.html)
address but present a different SNI such that the application layer load
balancer on the other side of the link knew which certificate to present and how
to route the requests. I should note that I did not have the environmental
permissions to create a private DNS zone to CNAME or Alias the true hostname to
the PrivateLink one.

## Hyper {#hyper}

You can achieve this feat with Hyper (and by extension Tokio) **but** I found I
needed to switch from the default TLS implementation to the Rust's native
OpenSSL bindings so I could link against `SSL_set_tlsext_host_name` in the FFI
of the build system's OpenSSL install.

In the [rust-openssl](https://docs.rs/crate/openssl/0.10.30) bindings library this corresponds to
[`openssl::ssl:SslRef::set_hostname()`](https://docs.rs/openssl/0.10.30/openssl/ssl/struct.SslRef.html#method.set%5Fhostname).

In addition to the bindings, you will also need to switch Hyper to use
[`hyper-openssl`](https://docs.rs/hyper-openssl/0.8.1/hyper%5Fopenssl/) crate.

In your `Cargo.toml` this looks something like:

```toml
[dependencies]
hyper = "0.13.8"
hyper-openssl = "0.8.0"
openssl = "0.10.30"
```

Then take control of the connector and set a callback as you construct your
Hyper client:

```rust
let mut conn = HttpsConnector::new()?;
conn.set_callback(move |c, _| {
    // Prevent native TLS lib from inferring and verifying a default SNI.
    c.set_use_server_name_indication(false);
    c.set_verify_hostname(false);

    // And set a custom SNI instead.
    c.set_hostname("somewhere.com")
});
Client::builder()
    .build::<_, Body>(conn)
    .request(Request::get("somewhere-else.com").body(())?)
    .await?;
```

That's it! If you capture the TLS `ClientHello` packet you can confirm the SNI
has changed:

{{< figure src="/ox-hugo/client_hello_wireshark.png" alt="WireShark TLS ClientHello" >}}

## Cross-platform builds {#cross-platform-builds}

Using native OpenSSL is not without its pitfalls. YMMV with this but with my
attempts at statically linking for each target platform, even when I could get
the right incantations of the `OPENSSL_STATIC`, `OPENSSL_LIB_DIR` and
`OPENSSL_INCLUDE_DIR` variables to produce a true static binary from a `ldd`
perspective, I still found the bindings reaching for a system-provided OpenSSL
at runtime and subsequently segfaulting on Linux/amd64.

I eventually gave up with glibc and opted to use the musl libc counterparts.
However compiling musl versions of OpenSSL, zlib and friends is itself a rabbit
hole I did not have time for. Fortunately someone did and I can highly recommend
[`clux/muslrust`](https://github.com/clux/muslrust) container image for getting this task done.

I also had some issues with the binary being unable to find the CA certificates
on the host system. Solving this was easy thanks to the handy [`openssl-probe`](https://docs.rs/openssl-probe/0.1.2/openssl%5Fprobe/)
crate.
