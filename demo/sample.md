# Release notes — v0.1.0

`dsh-artifacts` turns raw agent output into something you actually want to
share. One command, zero dependencies, no design skills required.

## What changed

- **Four templates** — document, card, dashboard, gallery.
- **Five themes** — light, dark, paper, terminal, brand.
- **Self-contained HTML** — no external fonts, CSS, or JavaScript.
- **In-harness tool** — `artifact_render` for the agent itself.

## How it works

> Everything is inlined into a single file. Open it from disk, attach it to an
> email, or drop it on any static host.

```sh
dsh-artifacts notes.md --title "Release notes" --theme dark
```

## Get started

1. `pnpm add -g dsh-artifacts`
2. `dsh-artifacts notes.md --serve 8080`
3. Edit `notes.md`, refresh the browser.
