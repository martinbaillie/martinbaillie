+++
title = "Emacs TRAMP over AWS SSM APIs"
author = ["Martin Baillie"]
date = 2021-02-07T15:18:00+11:00
tags = ["emacs", "aws"]
draft = false
tldr = "Securely preside over your EC2 darlings with TRAMP mode."
+++

## Cattle not pets {#cattle-not-pets}

The majority of AWS EC2 I need to operate these days are members of Kubernetes
clusters. For remote access to them I'm more commonly authenticating to the Kube
API to spawn a privileged ephemeral debugger pod rather than accessing the host
directly. I have little need for host access even for the remaining minority of
ancillary EC2 services I'm responsible for because all the observability pillars
are pulled or pushed somewhere else, and if something is misbehaving or needing
replaced I'm more likely to shoot it than debug or patch it.

To be clear, I think this is a good thing. It is a testament to the efficacy of
the immutable infrastructure pattern, infrastructure as code and modern platform
tooling.

So the preface here is I rarely need to pop a shell on an EC2 instance, and
**very** rarely need to extract a file from one.

However, one of these very rare occurrences presented itself last week and
prompted my writing of this quick [fieldnote](/wrote/fieldnotes), if for no one else but myself!

## AWS SSM {#aws-ssm}

For a good wee while now, AWS SSM (or AWS Systems Manager as I see they are
calling it nowadays) has arguably been the most secure way to permit controlled
and audited access to an EC2 instance.

> NOTE: You can also run the SSM agent on other cloud or on-premises VMs. I have
> used to the latter in a hybrid context to good effect at a previous client. For
> the former, most other clouds have their own solutions and those are probably
> the smarter choice.

If you _are_ in AWS then some features to like about the SSM approach over
traditional SSH are:

- No direct network path required. There is no need to punch holes in your
  VPC layers and chain bastions.
- Instance authentication controlled through IAM and by extension whichever IdP
  you may be federating human access with.
- Initial access and every userspace command audited and logged. To create
  break-glass alerts or "taint" instances that have been accessed is a breeze.

When compared to an SSH session there is no notable performance difference when
accessing an instance over the SSM APIs either. I do recall some lag in the
early days of the service but that seems fixed if you're doing run-of-the-mill
sysadmin things. Just don't go pasting many megabytes of junk into the pty from
your clipboard!

The only downside I feel is the need for an opaque client-side binary called the
[`ssm-session-manager-plugin`](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) which is paired with the `aws` CLI (presuming you
want to use your terminal rather than a window in the AWS console).

> NOTE: I packaged the plugin binary for Nix/NixOS a while back. It's currently
> in [stable](https://search.nixos.org/packages?channel=unstable&show=ssm-session-manager-plugin&from=0&size=50&sort=relevance&query=ssm-session-manager-plugin).

## SSH {#ssh}

Perhaps more interesting, though, is that for the last couple of years AWS has
supported tunneling the SSH protocol over their SSM APIs if you use the SSM
"document" called `AWS-StartSSHSession`.

They do this by proxying the SSH data arriving at the `amazon-ssm-agent` on the
target host laterally to the `sshd` on the same host over loopback. So while
this means you need to run an SSH daemon again, you only need to bind it on a
local interface.

As above, there's not much to be gained for an interactive SSH session (that I'm
aware of) since the SSM sessions are good enough performance wise. Plus, you
actually lose a fair amount of the benefits listed above and you have the hassle
of getting your public key into the target host user's `authorized_keys` if it's
not already baked in.

What it _does_ do, however, is open up `scp`! You can now copy files to and fro
that target host which is something you couldn't do before with a pure SSM
session.

### How? {#how}

Presuming your public key is already trusted by the target user on the host, all
you need to do is to modify your local SSH config (normally `~/.ssh/config`) to
tell it to proxy all session requests headed towards AWS instance names via the
AWS CLI.

```sh
host i-* mi-*
ProxyCommand sh -c "aws ssm start-session \
    --target %h \
    --document-name AWS-StartSSHSession \
    --parameters 'portNumber=%p'"
```

With that done, and with an IAM session in tow, you can `ssh user@i-00deadbeef` or `scp user@i-00deadbeef`.

> NOTE: It's not the scope of this post, but you could conceivably configure SSH
> tunnels here as well. There's also a `AWS-StartPortForwardingSession` document
> that uses pure SSM to similar effect, and is probably more optimised.

## Emacs TRAMP {#emacs-tramp}

My work scenario from mid-week had me copying files to and from different
locations on an EC2 instance. Fortunately I tried good old TRAMP mode on a whim
and learned that it works flawlessly using SSH proxied over SSM (I am not sure
why I was surprised by that).

In a stock Emacs, `C-x C-f /ssh:user@i-00deadbeef:path` can be used to pop a
remote Dired directory buffer or edit a target file in whatever major mode is
appropriate.

{{< figure src="/ox-hugo/tramp_dired.png" alt="TRAMP Dired" >}}

You can also move around the remote filesystem as if it were local, and the
likes of `M-x dired-do-copy` and friends can be used to transparently copy files
between local and remote.

{{< figure src="/ox-hugo/tramp_minibuffer.png" alt="TRAMP Minibuffer" >}}
