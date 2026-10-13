# Preflyt frontend source baseline

This directory contains the pinned Shadcn Admin application imported under ADR-0005. Its demo screens, data, and authentication remain upstream development content pending P0 adaptation. It is not a usable Preflyt release.

See `../../docs/vendor/shadcn-admin.md` for provenance and validation. Run commands from the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:browser:install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm audit
```

`pnpm dev` starts the imported dashboard locally. Preserve `LICENSE` and `README.upstream.md` when modifying or distributing the source.
