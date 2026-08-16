# Contributing

PRs welcome. The renderer is zero-runtime-dependency and split into three files:

- `src/render.ts` — Markdown → HTML plus templates/themes.
- `src/vault.ts` — folder export (one page per note + linked index).
- `src/index.ts` — the DSH plugin and `artifact_render` tool.

Before submitting:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

Keep templates and themes dependency-free and add a test for any new behavior.
