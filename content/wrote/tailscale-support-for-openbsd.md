+++
title = "Tailscale Support for OpenBSD"
author = ["Martin Baillie"]
date = 2020-02-05T20:29:00+11:00
tags = ["openbsd", "tailscale", "go", "wireguard", "security"]
draft = false
tldr = "Learn how to configure Tailscale on OpenBSD."
+++

## Tailscale {#tailscale}

A service called [Tailscale](https://tailscale.com) launched at the beginning of the month and promises
to be the _"easiest, most secure way to use WireGuard and 2FA"_.

As an early beta tester of [WireGuard](https://www.wireguard.com/) and someone who has been carefully tracking
its progress towards mainline Linux (currently in `net-next`, [scheduled for
5.6](https://www.phoronix.com/scan.php?page=news%5Fitem&px=WireGuard-Net-Next-Lands)!), I am especially excited to see people much smarter than me start to build
next generation VPN businesses centred around it.

WireGuard will allow the Tailscale folks to eschew traditional hub-and-spoke VPN
models and have their customers construct their own private meshed (P2P)
networks. This is similar in a sense to the features offered up by [ZeroTier](https://www.zerotier.com/) or
what you might be able to presumably cobble together with the likes of Slack's
recently announced [Nebula](https://slack.engineering/introducing-nebula-the-open-source-global-overlay-network-from-slack/), though neither are based on WireGuard.

If Tailscale is executed well it could bring WireGuard to the masses and
hopefully even usher in a bit of a paradigm shift for cloud networking:
decentralised [BeyondCorp-styled](https://beyondcorp.com/) zero trust networking for the rest of us. That
is, looking past perimeter-based security and not just for the usual case of
privileged staff access. Why continue to build our backend SOAs out of all these
layered VPCs with their NACLs, security groups and reverse proxying load
balancers when some smart DNS and meshed WireGuard tunnels will suffice?

Anyway, idealist gushing aside, they do have their work cut out. The hard part
in all of this is not the WireGuard data plane, but the control plane that
manages it. I had a small side project going at work last year to allow temporal
privileged access to cloud resources for our platform engineers using WireGuard,
and solving the keypair distribution/rotation and tunnel auto-configuration for
multiple OSes was _not_ trivial! For Tailscale there's also the issue of IAM /
2FA, DNS support and not least the tedious NAT traversal tricks that will be
required for them to become a universally useful end-user SaaS. Good luck to
them!

## Support for OpenBSD {#support-for-openbsd}

I've been using [OpenBSD](https://www.openbsd.org/) on and off since I was a teenager. It is without a doubt
my favourite OS, and while I don't use it as my daily driver anymore, it has
remained steadfast at the helm of my [homebrew router](https://github.com/martinbaillie/homebrew-openbsd-pcengines-router) for many years.

I've also been using WireGuard to interconnect all of my machines for a while,
but after switching them over to Tailscale last week my OpenBSD router was a
_notable omission_.

---

Fret not! Thankfully Tailscale's core is open source and on [GitHub](https://github.com/tailscale/tailscale). It happened
to utilise the same [`wireguard-go`](https://git.zx2c4.com/wireguard-go/about/) userspace library I was already familiar with
from my work side project. Happily, they accepted my [pull request](https://github.com/tailscale/tailscale/pull/36) and now
Tailscale knows OpenBSD!

{{< figure src="/ox-hugo/tailscale_openbsd.png" alt="OpenBSD support for Tailscale" width="50%" >}}

Fair warning, it does not take advantage of OpenBSD's standout [`pledge(2)`](https://man.openbsd.org/pledge.2) /
[`unveil(2)`](https://man.openbsd.org/unveil) security features yet but it should be able to given Go has the
requisite syscall support ([pledge](https://github.com/golang/sys/blob/master/unix/pledge%5Fopenbsd.go), [unveil](https://github.com/golang/sys/blob/master/unix/unveil%5Fopenbsd.go)).

The rest of this post will go into how you can get yourself hooked upto
Tailscale from an OpenBSD userspace.

## Installing Tailscale on OpenBSD {#installing-tailscale-on-openbsd}

There is no native WireGuard in the OpenBSD kernel yet, and anyway Tailscale
runs off a temporary fork of the [`wireguard-go`](https://github.com/tailscale/wireguard-go) implementation for now (which,
incidentally, also means you cannot use the upstream version from OpenBSD's
ports).

> 20200621 UPDATE: WireGuard has since landed natively in OpenBSD-CURRENT as
> [`wg(4)`](https://man.openbsd.org/wg.4)! I have yet to have a play but it will be in 6.8-STABLE.

So, and accepting the arguably negligible hit for crossing the kernel<>userspace
border for each packet, the first thing you'll want to do is grab the latest
Tailscale source code for local compilation.

```shell
; git clone --depth 1 https://github.com/tailscale/tailscale.git
```

You will also need a sufficiently modern Go toolchain (but do not necessarily
need to be on an OpenBSD host).

> 20201012 UPDATE: As I rebuilt to latest Tailscale for my own router I noticed
> their repository has changed slightly. I've updated the following instructions
> to match the current structure as of this date.

Build OpenBSD compatible Tailscale binaries and move them to your target machine
(presuming you're not already on it):

```shell
; cd tailscale
; GOOS=openbsd go build ./cmd/tailscale
; GOOS=openbsd go build ./cmd/tailscaled
; scp tailscale{,d} root@openbsd:/usr/local/bin
```

On OpenBSD, `tailscaled` will correctly use `/var/db/tailscale` as its state
directory and `/var/run/tailscale/tailscale.sock` for its UNIX socket.

This is the rc script I use (`/etc/rc.d/tailscaled`). Don't forget to make it
executable!

```shell
#!/bin/ksh
daemon="/usr/local/bin/tailscaled"

. /etc/rc.d/rc.subr

rc_start() {
    ${rcexec} "${daemon} ${daemon_flags} 2>&1 | logger -t tailscaled &"
}

rc_cmd $1
```

Pair this with an entry in `/etc/rc.conf.local`, optionally passing any
Tailscale daemon flags (or use `rcctl enable tailscaled`):

```shell
tailscaled_flags=""
```

Start the daemon to make sure it is working:

```shell
; doas rcctl start tailscaled
# tailscaled(ok)
```

And that's it! You should have Tailscale logs streaming in `/var/log/messages`
and have a plumbed `tunX` device by now.

I've had my Tailscale state db configured for a while, but if you see
authentication errors in the logs then you may need to run an initial:

```shell
; tailscale up
```
