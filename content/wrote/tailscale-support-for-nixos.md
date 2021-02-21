+++
title = "Tailscale Support for NixOS"
author = ["Martin Baillie"]
date = 2020-03-20T18:24:00+11:00
tags = ["nix", "tailscale", "wireguard", "security"]
draft = false
tldr = "Learn how to configure Tailscale on NixOS."
+++

I have been [continuing](/wrote/tailscale-support-for-openbsd) to run with Tailscale instead of hand-cranked WireGuard
on various devices, including my daily driver ThinkPad which runs my _other_
favourite OS—[NixOS](https://nixos.org/)!

However, until now the configuration was not particularly idiomatic due to there
being no upstream Tailscale Nix expressions in [nixpkgs](https://github.com/NixOS/nixpkgs).

As it transpired, Dan Anderson of Tailscale is also a NixOS user and with his
support I was able to shepherd in a [quick PR](https://github.com/NixOS/nixpkgs/pull/82537) to introduce a Tailscale [module](https://search.nixos.org/options?query=tailscale). I
actually think NixOS ended up being their first Linux flavoured package!

Like the previous OpenBSD post, the rest of this post will walk you through how
to set up Tailscale on NixOS.

## Installing Tailscale on NixOS {#installing-tailscale-on-nixos}

It's simple!

```nix
services.tailscale.enable = true;

# Optional (default: 41641):
services.tailscale.port = 12345;
```

You can choose to make it easier for Tailscale by opening up the UDP port.

```nix
networking.firewall.allowedUDPPorts = [ ${services.tailscale.port} ];
```

Depending on your setup, you may need to make the `tailscale` CLI available to
all users.

```nix
environment.systemPackages = with pkgs; [ tailscale ];
```

That's the configuration out of the way. If you perform a `rebuild-switch`, you
should find a Tailscale daemon running.

```shell
; systemctl status tailscale
```

Finally, perform an initial authentication for this machine and you're done.

```shell
; tailscale up
```

You should be able to see a successfully plumbed device, and Tailscale logs
scrolling.

```shell
; ip link show tailscale0
; journalctl -fu tailscale
```
