+++
title = "Emacs Evil Motion Training"
author = ["Martin Baillie"]
date = 2020-06-28T10:33:00+10:00
tags = ["emacs", "release"]
draft = false
tldr = "Punish yourself for poorly chosen evil motions in Emacs."
+++

I made the switch to Emacs last year after having been a resolute vim user ever
since I dual booted Slackware on my family's first computer as an early teen.

Needless to say the power of the Emacs pseudo [lisp machine](https://en.wikipedia.org/wiki/Lisp%5Fmachine) quickly opened my
eyes. I immediately lunged into consolidating practically all my text use cases
sans browsing into Emacs: programming, note taking, RSS, mail, `git` porcelain,
GitHub PRs and issues, IRC/Slack. I even entirely replaced my use of a separate
terminal emulator. My browser has since clawed back the mail, Slack and _some_
GitHub use cases from Emacs' grasp, but if it weren't for me staunchly trying to
stick to Wayland I am quite sure I'd be writing this from inside [EXWM](https://github.com/ch11ng/exwm) by now.

However, the old adage goes:

> "Emacs is a great operating system missing a great editor."

And it was true for me, but fixable.

## Evil Mode {#evil-mode}

I tried Emacs native key chords for all of a day or two before giving up and
enabling [evil mode](https://github.com/emacs-evil/evil). It could be that I'm too far gone, but I simply could not
live without modal editing and the intuitive verb-object `vi` key bindings that I
had become accustomed to.

For me, having [proficiency](#proficiency) at moving around a buffer and manipulating text in
this manner means anything else feels like a bit of a regression. What's more,
I've always used `vi` styled bindings anywhere I can, be it in terminal readline
mode, my tiling window manager [du jour](https://swaywm.org/), or Firefox ([Tridactyl](https://github.com/tridactyl/tridactyl) is my pick of the
post-[XUL era](https://en.wikipedia.org/wiki/XUL) bunch). Even back in my enterprise Java days, when forced to dip into
the heavyweight IDE world with the likes of Eclipse and IntelliJ IDEA, I'd still
reach for a plugin.

---

I think with evil mode and Emacs you're truly getting the best of both worlds.
Emacs can be the great editor (neo)vi(m) is. It can be just as snappy (see
[native-comp](https://www.emacswiki.org/emacs/GccEmacs)), start just as fast (see [emacsclient](https://www.emacswiki.org/emacs/EmacsClient) / [Doom](https://github.com/hlissner/doom-emacs)'s optimisations), and
has all the modern trimmings you would expect in an editor (e.g. [LSP](https://github.com/emacs-lsp/lsp-mode), [ligatures](https://lists.gnu.org/archive/html/emacs-devel/2019-06/msg00123.html),
[pgtk](https://github.com/masm11/emacs)).

It is, however, the famed Emacs extensibility that sets it apart from the crowd
for me. Vimscript, Neovim's Lua extensions, even VSCode's extensions API are—to
butcher [Greenspun's aphorism](https://en.wikipedia.org/wiki/Greenspun%27s%5Ftenth%5Frule)—just _ad hoc, informally-specified, bug-ridden,
slow implementations of half of_ ~~Common Lisp~~ _Elisp_.

With Elisp packages, Emacs can become a cybernetic extension of your arm. Though
package authors are not really writing an extension, they're just writing more
Emacs. That, I think, is the crux of it.

Speaking of packages, there are of course all the usual big hitter packages that
you'll find on any list, like [Magit](https://magit.vc/), [Org](https://orgmode.org/), [TRAMP](https://www.emacswiki.org/emacs/TrampMode), [Projectile](https://github.com/bbatsov/projectile), [Ivy](https://github.com/abo-abo/swiper) and [Dired](https://www.emacswiki.org/emacs/DiredMode) to
name a few. However, today I'm showcasing a small package to improve proficiency
in evil motions.

## Proficiency {#proficiency}

Not long before my switch to Emacs I had started trying to kick some bad habits
with vim. Let's call them lazy motions. I _knew_ better ways of moving the
cursor from a to b, but the cognitive overhead, or lack of muscle memory
perhaps, was too much to overcome. If you're also a vim user then there's a
chance you know what I mean: `hhhhhhhhhhhhjjjjjjjjkkkkkllllhjk`. That is,
favouring a single character/line oriented movement over a more esoteric (but
known to you!) and undeniably precise movement.

The word-wise motions (e.g. `wW`, `bB`, `eE`, `ge`), character searches (e.g.
`fF`, `tT`, `,`, `;`) and line jumps (e.g. `10j` `5k`) will almost always get
you where you want to be with less keystrokes.

I was slowly beginning to fix this through a somewhat Pavlovian vim plugin
called [`vim-hardtime`](https://github.com/takac/vim-hardtime) which would tase me when I repeatedly used these keys in
succession. Unfortunately I lost this with the switch to Emacs and the return to
familiar modal surroundings in evil mode, and sure enough the bad habits came
back.

To my dismay I could not find a directly equivalent Emacs package so today I'm
releasing the [`evil-motion-trainer`](https://github.com/martinbaillie/evil-motion-trainer) on GitHub.

## Evil Motion Trainer {#evil-motion-trainer}

Just like the vim plugin, entering `evil-motion-trainer-mode` means Emacs will
drop lazily repeated hjkl-based motions after a configurable threshold, forcing
you to think about a more efficient motion:

{{< figure src="/ox-hugo/evil_motion_trainer.gif" >}}

### Configuration {#configuration}

Enable in a buffer with:

```elisp
(evil-motion-trainer-mode)
```

Turn on for all buffers:

```elisp
(global-evil-motion-trainer-mode 1)
```

Configure the number of permitted repeated key presses:

```elisp
(setq evil-motion-trainer-threshold 6)
```

Enable a super annoying mode that pops a warning in a buffer:

```elisp
(setq evil-motion-trainer-super-annoying-mode t)
```

Add to the suggested alternatives for a key:

```emacs-lisp
(emt-add-suggestion 'evil-next-line 'evil-avy-goto-char-timer)
;; See also: (emt-add-suggestions)
```
