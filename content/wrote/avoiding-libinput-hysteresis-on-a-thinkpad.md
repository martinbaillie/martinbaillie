+++
title = "Avoiding Libinput Hysteresis on a ThinkPad"
author = ["Martin Baillie"]
date = 2020-12-20T16:21:00+11:00
tags = ["nix"]
draft = false
tldr = "Avoid triggering hysteresis with this one dirty trick."
+++

Making a touchpad work on Linux as well as it does on macOS/Windows. It's a
problem as old as time itself, or at least as old as the _"year of Linux on the
desktop"_ meme.

The days of calibrating obscure values that I don't fully understand on the old
X11 `synaptics` driver were supposed to be a thing of the past with `libinput`,
and to be fair they have been, _for the most part_. Things are definitely more
in tune with what you've come to expect from other OSes out of the box.

Unfortunately I seem to have landed myself a ThinkPad with a touchpad (clickpad)
revision that triggers a hysteresis in `libinput` unnecessarily, making it
difficult to conduct precise, narrow gestures (like carefully circling a small
number of pixels for example).

This is a core issue being [tracked](https://gitlab.freedesktop.org/libinput/libinput/-/issues/286) by the `libinput` developers that is
prevalent in various ThinkPad revisions but not yet resolved. The gist seems to
be yet unexplained heuristics causing wobbling detection to trigger a hysteresis
instantly. This is probably a hard thing to fix and way beyond me. However,
turning off wobbling detection altogether is not. And while a quick, temporary
and dirty fix, it _does_ seem to help!

## Disable wobbling detection {#disable-wobbling-detection}

To do so requires a _very_ simple patch.

```diff
--- a/src/evdev-mt-touchpad.c 2020-12-20 12:16:11.039665884 +1100
+++ b/src/evdev-mt-touchpad.c 2020-12-20 12:16:02.846795394 +1100
@@ -1754,7 +1754,7 @@

 		tp_thumb_update_touch(tp, t, time);
 		tp_palm_detect(tp, t, time);
-		tp_detect_wobbling(tp, t, time);
+		// tp_detect_wobbling(tp, t, time);
 		tp_motion_hysteresis(tp, t);
 		tp_motion_history_push(t);
```

With this in place I no longer have hysteresis issues and haven't noticed any
negative effects of disabled wobbling protection.

Apply the above patch to a recent `libinput` source and compile then install in
a way that suits your OS.

### Nix {#nix}

Below is an excerpt from how I do both in my NixOS package overlays.

```nix
nixpkgs.overlays = [
    (self: super: {
        libinput = super.libinput.overrideAttrs
            (o: { patches = o.patches ++ [ libinput.patch ]; });
    })
];
```

This means any Nix expression in my system making use of `libinput` gets my
patched version.

## A note on Synaptics RMI4 over SMBus {#a-note-on-synaptics-rmi4-over-smbus}

As I was digging into this problem I realised that my ThinkPad's Synaptics
clickpad runs their RMI4 protocol. This is a native protocol that has had Linux
kernel support as of 4.6 and means you can ditch the HID/PS2 emulation
(`psmouse` module).

This should have been automatic for me but it seems my device's PnP ID is not in
the current kernel's [list](https://git.kernel.org/pub/scm/linux/kernel/git/dtor/input.git/tree/drivers/input/mouse/synaptics.c#n164). I can force it with the kernel parameter
`psmouse.synaptics_intertouch=1` but then it seems I then hit another [issue](https://gitlab.freedesktop.org/libinput/libinput/-/issues/402) in
`libinput` that causes my clickpad buttons to not get discovered by the probing
code.

Alas, the situation is still good enough that I don't need to reach for the
`synaptics` driver, and there is better [support](https://www.phoronix.com/scan.php?page=news%5Fitem&px=Linux-5.10-Synaptics-RMI4-F3A) landing in the 5.10 kernels so
I'm happy to hold out for now.
