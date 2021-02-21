+++
title = "Git Signature Operations via HashiCorp Vault"
author = ["Martin Baillie"]
date = 2020-10-04T12:59:00+11:00
tags = ["vault", "git", "security", "release"]
draft = false
tldr = "Vaultsign is a helper tool for performing Git signature operations using Vault."
+++

The typical modern software supply chain starts with an input changeset of
source commits triggering a whole raft of manual and automated code checks in a
CI environment: peer reviews; full testing pyramid; dependency vetting;
automated static analysis and so on.

The outputs of this step are invariably deployable artefacts such as binaries,
container images, interpreted/byte code archives or [IaC](https://en.wikipedia.org/wiki/Infrastructure%5Fas%5Fcode) that subsequently need
to progress their way through a delivery pipeline comprising at least a
pre-production/staging environment (again, typically) before landing in
production.

To achieve that last part necessitates putting the production-bound artefacts on
_ice_ (object store, OCI registry, SCM repository tag etc.) whilst instances of
it are validated in the N pre-production environments in the delivery pipeline.
This is fine for most organisations, but an additional code provenance strategy
is sometimes required in regulated and other high security environments.

## Code Provenance {#code-provenance}

My definition of code provenance here is the proof that those artefacts
deployed to production have been through all prior CI and pre-production steps,
and have additionally retained authenticity and integrity whilst in cold storage
between environments. Sort of like a software _[chain of custody](https://en.wikipedia.org/wiki/Chain%5Fof%5Fcustody)_.

The tried and tested approach is to manually sign a checksum of the artefacts
and verify at each stage. This is a concise way to check integrity and
authenticity in one shot, but starts to fall down in modern automated contexts
because of the key distribution and identity problem. That is, an organisation's
engineers can still sign individual commits with their own keys, but it is
ultimately the identity of the automated CI environment that is collating and
producing the deployable artefacts.

So with identified engineers landing commits, the next link in that chain of
custody is the CI system. It needs to prove it was _responsible_ for producing
those deployable artefacts, and the following runtime stages needing to verify
that fact.

---

There are many options in this space but generally speaking it involves the CI
system following the same approach as would have been followed by a human:
produce and sign a checksum of the deployable artefacts. This time, however,
there is the added complexity of the CI system needing to securely identify
itself (machine-to-machine) to some signing service, or otherwise storage
service in order to access the asymmetric key material needed for signing.

Checksumming strategies can further benefit from reproducible (aka.
deterministic) builds which are within reach these days with the right choice of
language and build system. Then there are specifications like [The Update
Framework (TUF)](https://github.com/theupdateframework/specification/blob/master/tuf-spec.md#the-update-framework-specification) laying foundations for securely tracking origin authenticity,
with tools like [Vault](https://www.vaultproject.io/), [Notary](https://docs.docker.com/notary/getting%5Fstarted/), [OPA](https://www.openpolicyagent.org/)/[Gatekeeper](https://github.com/open-policy-agent/gatekeeper), and cloud services like [GCP
Binary Authorization](https://cloud.google.com/binary-authorization), and [AWS Signer](https://docs.aws.amazon.com/signer/latest/api/Welcome.html) all able to help in this regard.

## Vault {#vault}

This post is about using HashiCorp's Vault in the previously outlined context of
code provenance.

With a Vault deployment there are numerous machine authentication options that a
CI system's agents can leverage to securely identify themselves, including but
not exclusive to: all major cloud IAM; Kubernetes SAs; AppRole; JWT/OIDC; or TLS
certificates.

Once authenticated, the agents can utilise Vault's "encryption as a service"
related backends and plugins ([`transit`](https://www.vaultproject.io/docs/secrets/transit), [`gpg`](https://github.com/LeSuisse/vault-gpg-plugin)) to sign checksums or raw data.

This constitutes as quite a strong code provenance strategy especially given
Vault's additional RBAC and audit features, provided the subsequent steps in the
software supply chain (... _of custody_) have the requisite network access to
the non-sensitive verify endpoints (or otherwise cached public key).

---

While the process outlined works well for deployable artefacts like binaries,
things get more awkward when some or all of the deployment collateral is say,
interpreted IaC files (Terraform, Pulumi etc.). In my experience, these are
commonly located on and directly deployed from a branch or tag, both of which
are of course _**mutable**_.

A solution here is to tarball all the IaC files and sign/store/verify them like
the other artefacts, or even just sign/store/verify the branch head commit or
tag SHA.

Another is to make use of a tool I am releasing today called [`vaultsign`](https://github.com/martinbaillie/vaultsign)!

## Vaultsign {#vaultsign}

`vaultsign` is a small CLI that can be used as a Git helper to sign (and verify)
commits and tags using HashiCorp’s Vault.

It does so by implementing just enough of the GPG CLI interface and status
protocol to proxy the Git originating sign and verify requests onwards to your
specified Vault endpoint, and works with both the previously mentioned [transit
backend](https://www.vaultproject.io/docs/secrets/transit) and [GPG plugins](https://github.com/LeSuisse/vault-gpg-plugin) you may already be using for other code provenance
purposes.

With it, the CI system can sign a commit or, more commonly, a release tag at the
same time and using the same role and key material as the other deployable
artefacts in the release. Then they can then all be verified together during the
subsequent runtime steps in the chain. All the usual signature related Git
porcelain continues to function and you can even have forges like GitHub verify
and show the coveted green tick if you take the Vault GPG plugin option.

### Example Usage {#example-usage}

```sh
# Login to vault.
; export VAULT_ADDR=https://production.vault.acme.corp
; vault login

# Tell git to use vaultsign.
; git config --local gpg.program /path/to/vaultsign

# Sign a commit and tag.
; export VAULT_SIGN_PATH=transit/sign/test/sha2-256
; git commit -m "test signed commit" -S
; git tag -m "test signed tag" -s test

# Verify the same commit and tag.
; export VAULT_VERIFY_PATH=transit/verify/test
; git verify-commit HEAD
; git log -1 --show-signature
; git verify-tag test
```
