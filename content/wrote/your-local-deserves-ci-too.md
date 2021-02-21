+++
title = "Your Local Deserves CI, too"
author = ["Martin Baillie"]
date = 2020-06-06T15:01:00+10:00
tags = ["nix", "github"]
draft = false
tldr = "Build your local Nix environments using free CI."
+++

## Nix {#nix}

Early last year, after teetering on the edge for a while, I finally took the
plunge into the world of [Nix](https://nixos.org). It always seemed to be the logical conclusion to
my declarative over imperative leanings and it has not disappointed.

I would classify myself as a semi-retired OS [bikeshedder](https://en.wiktionary.org/wiki/bikeshedding) these days. I no longer
obsess over [ricing](https://old.reddit.com/r/unixporn/wiki/themeing/dictionary#wiki%5Frice) my prompt nor switch tiling WMs like they're going out of
style. Instead, my prompt is a simple exit code coloured semi-colon and I spend
the majority of time in either Firefox or Emacs (+vterm). On NixOS I am using
the Sway Wayland compositor and on macOS I am usually just running native
fullscreen, ⌘↹ing between the two previously mentioned apps.

All in, this means my recent [dotfiles](https://github.com/martinbaillie/dotfiles) are much less sprawling than they have
been in the past and were therefore easy to convert to Nix expressions.

The expressions are organised into platform-agnostic "modules" that leverage the
likes of the [nixpkgs](https://github.com/nixos/nixpkgs), [home-manager](https://github.com/nix-community/home-manager) and [nix-darwin](https://github.com/LnL7/nix-darwin) channels to fully configure
the OS and userspace from scratch.

On top of basic software provisioning Nix expressions, I've written a simple
theming system that I use to switch various things between light and dark mode,
and a "secrets" attribute set (kept encrypted in a private repository) is used to
wire secrets throughout.

I'm very happy with the result. The expressions work flawlessly between NixOS
and macOS, and I'm able to go from fresh install to _mise en place_ with the
flick of a [`Makefile`](https://github.com/martinbaillie/dotfiles/blob/master/Makefile) target. I might try to find the time to convert my so-called
modules to proper boolean flagged, [nixpkgs-styled options](https://search.nixos.org/options), and the [Flakes RFC](https://github.com/NixOS/rfcs/pull/49)
looks very promising and solves my main criticism of Nix, but otherwise I am
feeling pretty zen about it all with no immediate desire to touch things (for a
change!).

## Continuous Integration {#continuous-integration}

Something I could not find many people doing, publicly at least, was building
their Nix dotfile repositories on push using the popular free CI services.

There are many ways to skin this cat but my approach was to build as native to
the target environment as I can get. Currently this looks like a combination of:

- GitHub Actions (macOS)

GitHub Actions are great and have generous amounts of free macOS minutes on true
Apple hardware-based runners, so this was a no brainer.

- Travis CI (NixOS, by way of QEMU)

Alas, GitHub do not provide access to underlying hardware virtualisation on
their SaaS Actions runners (at least at the time of writing this), and their
Linux runners are exclusively Ubuntu to boot. Since I really want to build a
NixOS VM to truly test every aspect of my expressions this means switching up to
Travis for these builds.

### Building {#building}

My parlour trick for covering all bases is to generate a special CI machine that
imports every one of my modules:

```nix
{ pkgs, lib, ... }:
# For CI, import every module but select a single theme, ultimately testing both
# themes over the course of the NixOS and macOS CI runs. Also filter out any
# system specific modules that are not for the current system.
let
  inherit (builtins) readDir concatLists filter match;
  inherit (lib) mapAttrsToList hasSuffix;
  inherit (lib.systems.elaborate { system = builtins.currentSystem; }) isLinux;
  nixFilesIn = dir:
    let
      children = readDir dir;
      f = path: type:
        let absPath = dir + "/${path}";
        in if type == "directory" then
          nixFilesIn absPath
        else if hasSuffix ".nix" (baseNameOf path) then
          [ absPath ]
        else
          [ ];
    in concatLists (mapAttrsToList f children);
  modules = filter (n:
    match
    ("(.*/themes/.*|.*." + (if isLinux then "darwin" else "linux") + ".nix$)")
    (toString n) == null) (nixFilesIn <modules>);
  theme = (if isLinux then <modules/themes/light> else <modules/themes/dark>);
in { imports = [ ../../. theme ] ++ modules; }
```

Using this pseudo machine, I can derive either a NixOS VM (via QEMU) on Travis
or simply build on a fresh Darwin Actions runner VM (in the case of macOS). Over
the course of both builds combined, all my Nix expressions are exercised.

```make
# CI targets.
# $(GITHUB_ACTIONS) == true
# $(TRAVIS) == true
ci: dep channels update
ifeq ($(SYSTEM),Linux)
	NIX_PATH=$(HOME)/.nix-defexpr/channels$${NIX_PATH:+:}$(NIX_PATH) \
	&& $(NIX_BUILD) '<nixpkgs/nixos>' -A vm -k \
		-I nixos-config=$(WORKDIR)/machines/ci/vm.nix
else
	if test -e /etc/static/bashrc; then . /etc/static/bashrc; fi \
	&& $(MAKE) test HOSTNAME=ci
endif
.PHONY: ci
```

### Caching {#caching}

The resultant binaries are pushed to Cachix and subsequently become available
for any of my other machines thus saving a lot of wasted CPU cycles!
