# Documentation versioning

The default documentation is the latest supported stable release, currently **v0.1.2**. Working documentation lives at `/next`, labelled **Next**, with Docusaurus's unreleased banner. The navbar selector switches versions while preserving the page when available.

- `apps/docs/versions.json` lists released snapshots.
- `apps/docs/versioned_docs/version-0.1.2/` and `versioned_sidebars/` preserve the release guides and navigation.
- `apps/docs/static/downloads/0.1.2/` contains the frozen release Compose, Kubernetes, environment and helper downloads. These deployment inputs were generated from release commit `69bd9318d4bfb57059d1ad1b92a5527a3830443f`.
- `apps/docs/docs/` remains the editable Next content. Normal generation changes only Next snippets and `/downloads/next/`.
- The root `release.json` owns the stable label and the explicitly selected, already published development image tag used by Next. Never infer a published image from the documentation build's commit SHA.

Stable installation examples use `PREFLYT_VERSION=v0.1.2`. Next examples use the configured published development SHA and explain that later unreleased changes may not be available in those images. Neither version silently downloads the other version's files.

## Local verification

From the repository root:

```bash
pnpm --filter @preflyt/docs typecheck
pnpm --filter @preflyt/docs build
```

The build checks version labels, the Next banner, copyable settings, versioned download URLs and image tags inside both Kubernetes bundles. Docusaurus also rejects broken links. Validate the downloaded Compose with `docker compose --env-file preflyt.env.example -f compose.yaml config --images`; this renders configuration without starting services or using an application database.

## Adding a future stable version

1. Confirm the application release and all supported architecture image tags exist. Review the release guides against that exact source commit.
2. Run the generator from `apps/docs` with `--version=X.Y.Z --source-ref=<release-commit>` to create a **new** frozen download directory. It refuses to overwrite existing release downloads.
3. With the generated release snippets still in `docs/`, run `pnpm exec docusaurus docs:version X.Y.Z`. Review and commit the snapshot and sidebar. Keep previously released snapshots and downloads.
4. Set `latestStable` in the root `release.json` to `X.Y.Z`. Add an ignore exception for the new frozen download directory beside the existing v0.1.2 exception. Older versions retain their own URLs and can receive explicitly reviewed documentation corrections.
5. Update `nextImageTag` only after a corresponding development image set is published and verified. Run normal generation again to restore Next snippets.
6. Run local type checking and the production build; exercise the selector and both versions' installation/download links in a browser. Publish docs through the existing documentation workflow when authorized.

Shared presentation components must derive stable identity from the selected Docusaurus version. Never replace all release badges or install examples with GitHub's latest release. Keep substantive release instructions in versioned content; review shared component changes against every retained version.
