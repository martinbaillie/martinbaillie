+++
title = "Stream, Mutate and Sign Images with AWS Lambda and ECR"
author = ["Martin Baillie"]
date = 2021-10-28T21:59:00+11:00
tags = ["aws", "supplychain"]
draft = false
tldr = "You can probably do better than that heavyweight Docker pull/build/push pipeline you've been using since 2015"
+++

## Image promotion {#image-promotion}

In my experience, an organisation working with container images in any form will
typically have a runtime supply chain that first takes an image from an
"untrusted" origin (e.g. a public upstream or the organisation's own permissive
development registry), then scans its contents for attributes classified
non-compliant to the organisation's security posture, before finally _promoting_
it to a "trusted" registry (oftentimes after having mutated it to have mandatory
annotations and/or a verifiable signature).

It follows that the trusted registry is the only approved origin for at least
the subsequent production runtime. In AWS that runtime might be Kubernetes
(EKS), ECS, Lambda or any of the other [seventeen (**17!**) ways to run a
container](https://www.lastweekinaws.com/blog/the-17-ways-to-run-containers-on-aws). Taking Kubernetes as an example, an admission controller can be
utilised to deny any image not originating from that trusted registry, or whose
signature cannot be verified to have passed through the compliance check
gauntlet.

Since the compliance check portion of this typical supply chain is subjective to
each organisation, I wanted to focus this fieldnote<sup>[(?)](/wrote/fieldnotes)</sup> on the image promotion process that I reckon everyone ends up having to solve themselves despite its
non-differentiating qualities.

It's true that some other providers have fancy [server-side promotion](https://github.com/kubernetes-sigs/promo-tools#server-side-operations) options
when your images are within their walled garden but today I'm writing about
promoting images where the source could be any registry and the destination is
AWS ECR.

In AWS you might performing this promotion from the likes of a CodeBuild job, a
VPC-based 3rd party CI/CD agent or even a GitHub Action SaaS runner (using the
eagerly anticipated OIDC<=>STS `AssumeRoleWithWebIdentity` [support](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) of course!).

In this context it would be _naive but forgivable_ to reach for familiar Docker
tooling to accomplish the task. Something like:

```shell
# Pull all source layers into local disk storage
; docker pull busybox:latest

# Mutate the image to add some labels and tag for destination repository
; echo -e "FROM busybox:latest\nLABEL owner martin\nLABEL team foo" | \
    docker build -t 111111111111.dkr.ecr.ap-southeast-2.amazonaws.com/busybox:1.0.0 -

# Push all layers to destination repository
; docker push 111111111111.dkr.ecr.ap-southeast-2.amazonaws.com/busybox:1.0.0
```


## Heavyweight {#heavyweight}

Let's talk briefly about what's going on above before getting into why friends
don't let friends do things this way in the year of 2021.

Firstly, despite only dealing with moving and mutating blobs from A to B, we've
got a highly privileged Docker daemon in the mix. This might not matter to you
so much (security-wise) if you're performing this task on ephemeral SaaS CI/CD
agents, but if not, you're presumably running more traditional shared CI/CD
infrastructure and it therefore merits consideration. In any case, why are we
pulling all image layers into local storage to assemble a complete image—we're
not going to actually <span class="underline">run</span> it? This is wasteful in terms of storage and this
Docker daemon is basically a glorified `wget` with the SUID bit set.

Moving on. To add layers to this image, we've essentially had to create a
dynamic `Dockerfile` to build and tag a derivative using the daemon.

Finally, we've pushed all blobs to the destination registry with no regard to
what was already there. AWS ECR is [OCI distribution](https://github.com/opencontainers/distribution-spec/)-compliant
(_enough_[^fn:1]<sup>, </sup>[^fn:2]) such that it can be queried by blob digest and even told
to cross-mount a blob from another image the consumer has permission to access,
saving the need to upload at all.

> Incidentally, AWS ECR is also somewhat [OCI artifact](https://github.com/opencontainers/artifacts/blob/main/artifact-authors.md)-compliant and supports a
> range of custom OCI [artifacts](https://aws.amazon.com/blogs/containers/oci-artifact-support-in-amazon-ecr/) like WASM modules, Helm charts, OPA bundles or
> **image signatures** as I'll touch on next.


## Registry-oriented tooling {#registry-oriented-tooling}

You can take advantage of these new (well they're not really <span class="underline">that new</span>)
registry features by using more appropriate tooling. For efficiently moving and
mutating images, my personal favourite is [crane](https://github.com/google/go-containerregistry/blob/main/cmd/crane/doc/crane.md) coming out of Google. It has a
large feature set of advanced commands beyond basic copy operations. There's
also [skopeo](https://github.com/containers/skopeo) under the containers project that came from ~~RedHat~~ IBM
originally I believe, and may make sense especially if you're in that OpenShift /
Podman ecosystem.

These tools know how to negotiate uploads intelligently with registries,
streaming only the missing blobs, layer-by-layer in memory from source to
destination, and can even add or mutate layers on the fly. So that's: no Docker daemon;
no local storage.

For registry image signing there's a few options but the Linux Foundation's
[Sigstore](https://www.sigstore.dev/) project and its tangential relation to the [SLSA](https://slsa.dev/) framework and the
nascent supply chain security space has my interest because of the potential to
use it wider than just the container image portion of things. Sigstore has a
tool called [cosign](https://github.com/sigstore/cosign) that makes simple work of container image signing,
verification and storage in an OCI artifact-compliant registry like ECR. Its use
of PKI is pluggable with many popular KMS implementations, including AWS KMS.

So if you're not already using something like `crane` to move and mutate your
images, or otherwise thinking about firming up your supply chain code provenance
with something like `cosign` then definitely check them out!

>  `crane` especially has the potential to shave many minutes off your "Mean Lead
> Time for Changes" [DORA metric](https://cloud.google.com/blog/products/devops-sre/using-the-four-keys-to-measure-your-devops-performance) through the smart copy techniques mentioned above,
> but also the [append](https://github.com/google/go-containerregistry/blob/main/cmd/crane/doc/crane%5Fappend.md) operation that provides the ability add a new layer (e.g.
> your workload binary) to an existing remote base image, creating a new
> derivative image.

Anyway, it so happened that I made mention on a recent Twitter thread that I was
using the libraries backing these registry-oriented tools to efficiently stream,
mutate and sign images into AWS ECR as described above, but perhaps novelly,
from a Lambda context. There was some interest in seeing how it all hung
together so I made note to write this up and extract some code to show.

The result can be found on my GitHub as [ocistow](https://github.com/martinbaillie/ocistow).


## Introducing `ocistow` {#introducing-ocistow}

The `ocistow` (OCI Stow) codebase houses an example Lambda (and bonus CLI) that
can efficiently stream and mutate upstream container image layers into an ECR
destination and subsequently sign them with KMS.

{{< figure src="/ox-hugo/ocistow.png" alt="Stream, Mutate, Sign" >}}

That is, given an invoke payload of:

1.  A source image reference (any public container registry / private ECR)
2.  A destination image reference (private ECR)
3.  Some annotations to add

It will:

1.  Stream only the missing image layers from source registry to destination ECR whilst handling ECR authentication
2.  Do so in memory (with Lambda's meagre 512mb filesystem remaining unused)
3.  Optionally mutate the image during this process to have user provided OCI
    annotations and legacy Docker image labels (mimicking the sort of mandatory
    tagging policy an organisation might have)
4.  And finally sign the image digests in AWS ECR using a KMS signing key for
    later assertion of provenance at runtime (e.g. using a Kubernetes admission
    controller like [cosigned](https://github.com/dlorenc/cosigned)).

Performance gains can be had by throwing more memory at the Lambda as this
results in more allocated CPU and critically, network (at AWS' discretion).
Empirically (though not very scientifically), I saw the following with the
massive **3+ gigabyte** TensorFlow images from [gcr.io](https://gcr.io).

-   Test 1 (vanilla Lambda settings 128mb memory): 8.06 minutes
-   Test 2 (maxed out Lambda settings 10240mb memory): **1.35 minutes**

No shared layers existed in my destination ECR between tests—all blobs were
streamed from source to destination.

> NOTE: This would be interesting to give a run through the [AWS Lambda Power Tuner](https://github.com/alexcasalboni/aws-lambda-power-tuning).


## Try it yourself {#try-it-yourself}

I can’t imagine anyone using the `ocistow` Lambda (nor CLI) verbatim in their
workflow unless it happened to solve an exact gap (let me know if you do!).
However, the codebase may be a useful reference for informing your own build. It
ships with a working Lambda and a basic CDK stack if you wanted to kick the
tyres in your own account. The CLI uses the same codepaths sans Lambda, should
you wish to try it locally instead.

I think I'll stop this note here now and add more information in the [README](https://github.com/martinbaillie/ocistow%20).

[^fn:1]: [ECR Conformance to OCI Distribution (Push)](https://oci-conformance.s3.amazonaws.com/distribution-spec/ecr/push/report.html)
[^fn:2]: [ECR Conformance to OCI Distribution (Pull)](https://oci-conformance.s3.amazonaws.com/distribution-spec/ecr/pull/report.html)
