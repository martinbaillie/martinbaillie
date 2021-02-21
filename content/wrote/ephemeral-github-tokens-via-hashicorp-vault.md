+++
title = "Ephemeral GitHub Tokens via HashiCorp Vault"
author = ["Martin Baillie"]
date = 2020-01-06T08:39:00+11:00
tags = ["vault", "github", "security", "release"]
draft = false
tldr = "Improve your GitHub security posture with a Vault plugin."
+++

## GitHub {#github}

I have found that performing automation against GitHub APIs often necessitates
the creation of [OAuth Tokens](https://help.github.com/en/github/extending-github/git-automation-with-oauth-tokens) (nb. GitHub refers to these as Personal Access
Tokens or PATs). These tokens are tied to a user account, have _very_
coarsely-scoped permissions and do not expire.

The more automation-savvy users in an organisation will likely have created many
such tokens with powerful permissions which are being neither rotated nor
deleted.

The organisation will also commonly have wasted at least one of their GitHub
seats on a [robot/machine user](https://help.github.com/en/github/getting-started-with-github/types-of-github-accounts#personal-user-accounts) for CI/CD purposes. These users share similar
access token and SSH key fates as the human users do but additionally need their
credentials managed and rotated on their behalf (a feat that is arguably made
even more awkward when federating GitHub access through an third party IdP).

---

[GitHub Apps](https://developer.github.com/apps/building-github-apps/) offer a better approach to this automation problem:

1.  They do not consume a seat (license) nor need credential management.
2.  They have _much_ finer-grained [permissions](https://developer.github.com/v3/apps/permissions/) available to the access tokens.
3.  The tokens they issue expire after an hour.

However, and this is the tricky part, GitHub Apps require the management of at
least one private key used to mint the JWTs used for the [App installation
authentication](https://developer.github.com/apps/building-github-apps/authenticating-with-github-apps/#authenticating-as-an-installation) token request flow.

## Vault {#vault}

I am a big fan of HashiCorp's [Vault](https://www.vaultproject.io/) product. I think it is a versatile security
tool for an organisation to have in their armoury and I have been intimately
involved with getting it deployed on my last two contracts.

Sure, over the years I've seen some of its feature set being tackled by the
major clouds as one might expect, and as a platform guy I'm always weighing up
managed services in a perpetual quest to run less non-differentiating
infrastructure. However, in my opinion Vault is still very much worth it if you
have a range of security requirements needing solved. Nothing comes close to its
range nor flexibility. It is also not inconceivable for HashiCorp to eventually
offer it as a managed service themselves (ala. Terraform Cloud) or otherwise
partner with the major clouds on doing so.

Anyhow, it's that flexibility that really shines here. An organisation's Vault
deployment is (or at least **should** be) one of the most secure systems in their
landscape and storing secrets is its bread and butter. What a perfect home for
that GitHub App private key from earlier!

But then, if a private key exists in the woods, can anyone ~~hear it~~ use it to
sign a JWT?

Let's take a gander at some other useful security aspects of that organisation's
Vault deployment:

- Auth backends

The organisation's preferred authZ/N backends are presumably already
configured. Vault supports a multitude of these, including but not exclusive
to: any OIDC compliant IdP, all major cloud IAM, LDAP, Kubernetes, TLS and
even GitHub (for those chicken-and-egg vibes).

- Secret backends

A pluggable secrets backend construct with CRUD-mapped RESTful semantics
fronted by the same highly available API protected by those auth backends.
There's even the concept of secret leases.

- RBAC

Strong declarative identity and unified ACL concept permeated throughout
all actions in the API surface.

## Vault<>GitHub plugin {#vault-github-plugin}

So, if you have clocked on to my thinly veiled setup, it logically follows that
someone might try to marry these Vault security strengths with a GitHub App to
plug the perceived GitHub PAT weakness, and that is exactly what I've done with
[`vault-plugin-secrets-github`](https://github.com/martinbaillie/vault-plugin-secrets-github).

Using this plugin you can broker requests to a GitHub App through Vault:

{{< figure src="/ox-hugo/vault_github_plugin.png" alt="Vault GitHub Plugin" >}}

Here the user authenticates with Vault and makes a request to the plugin's
configured mount point. This is a projected request that can include any manner
of GitHub [permissions](https://docs.github.com/en/free-pro-team@latest/rest/reference/permissions-required-for-github-apps) or repository IDs.

The plugin then mints a JWT from the securely stashed private key and uses it to
ask the installed GitHub App for a token constrained by those same permissions and/or repository IDs.

Presuming the App is configured with the superset of the requested permissions,
an access token is granted by GitHub and is valid for 1 hour. It can be used for
GitHub API and remote authenticated `git` operations, and the plugin can work
with either GitHub SaaS or Enterprise editions.

> Full installation instructions and API spec are kept up-to-date in the [README](https://github.com/martinbaillie/vault-plugin-secrets-github).

### Permissions {#permissions}

For now, unless you mount the plugin many times each for a different use case
(i.e. many GitHub Apps), you will need to give your primary GitHub App the
superset of all anticipated permissions needed by your users. This is _still_
better than those users being allowed to create their own PATs because the
plugin issued tokens only last for an hour.

In any case, you now arguably have a much stronger RBAC system at your disposal:
Vault's.

It is possible to craft tight Vault policies to constrain user capabilities on
the GitHub plugin (and by extension GitHub), and then map that to your Vault
user/role structure however you see fit.

---

As an example, imagine I have deployed the plugin to my Vault and I have
configured the associated GitHub App to have access to all repositories as well
as full write permissions on GitHub's `administration`, `contents`, `issues` and
`pull_requests` APIs.

Since Vault is deny by default, no authenticated user can access the
`/github/token` plugin endpoint until permissive policy is attached.

Suppose I then wanted to allow a user to have GitHub API access, but only to
create pull requests on the repository ID `69857131`. I would first craft a
policy that encapsulates this use case.

```shell
; vault policy write github-only-prs - <<EOF
path "github/token" {
  capabilities = ["update"]
  required_parameters = ["permissions","repository_ids"]
  allowed_parameters = {
    "repository_ids" = ["69857131"]
    "permissions"= ["pull_requests=write"]
  }
}
EOF
```

My policy mandates that both `permissions` and `repository_ids` parameters are
present and that they have certain fixed values.

I would then attach the policy to a user or group construct in my Vault setup.

```shell
; vault auth enable userpass
; vault write auth/userpass/users/martin password=baillie policies="github-only-prs"
```

This contrived user would then only be able to send that exact stipulated
request to Vault.

```shell
# Login.
; vault login -method=userpass username=martin password=baillie
# Successfully create a token.
; vault write /github/token repository_ids=69857131 permissions=pull_requests=write
# Permission denied:
; vault write -f /github/token
; vault write /github/token permissions=pull_requests=write
; vault write /github/token repository_ids=69857131 permissions=administration=read
; vault write /github/token repository_ids=123 permissions=pull_requests=write
; vault write /github/token repository_ids=69857131
```

### Metrics {#metrics}

David Wheeler's age-old aphorism, aka. the _["fundamental theorem of software
engineering"](https://en.wikipedia.org/wiki/Fundamental%5Ftheorem%5Fof%5Fsoftware%5Fengineering)_ goes:

> "All problems in computer science can be solved by another level of indirection."

And here we are once again proxying network requests for profit. At least we can
use it to our advantage by gleaning better insight into how the organisation is
utilising GitHub automation through metrics—something else that GitHub's audit
log falls short on.

Notwithstanding Vault's own audit log which enumerates all API access in detail
(_and you do have this streaming to some kind of SIEM product, right?_), the
GitHub plugin also offers up an additional metrics endpoint in the
Prometheus/OpenMetrics exposition format. Details are in the [README](https://github.com/martinbaillie/vault-plugin-secrets-github#metrics) and a sample
Grafana [dashboard](https://github.com/martinbaillie/vault-plugin-secrets-github/blob/master/dashboard.json) is provided.

{{< figure src="/ox-hugo/vault_github_plugin_dashboard.png" alt="Vault GitHub Plugin Dashboard" >}}
