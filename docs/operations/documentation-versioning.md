# Documentation versioning

The default documentation follows the newest published stable application release, currently **v0.1.6**. Older published versions remain available in the selector at their own paths. Editable, unreleased documentation stays at `/next`, labelled **Next**.

- `apps/docs/versions.json` lists frozen snapshots. v0.1.2 through v0.1.6 are retained.
- `apps/docs/versioned_docs/` and `versioned_sidebars/` preserve the documentation and navigation from each application release's Git tag.
- `apps/docs/static/downloads/<version>/` holds matching Compose, Kubernetes, environment and helper downloads. New snapshots include a `source.json` recording the release source SHA.
- `apps/docs/docs/` remains editable Next content. Normal generation only updates Next snippets and downloads.
- `release.json` selects the default stable version and an explicitly published SHA image tag for Next examples. Neither is inferred from an unreleased documentation commit.

Selecting a version changes the documentation badge, installation examples and download URLs together. Stable instructions use `PREFLYT_VERSION=v<selected version>`. Old snapshots are never renamed to the latest version.

## Release promotion

Both main application publication workflows call the reusable documentation workflow **after** creating a ready application release. The docs workflow uses a full tag checkout and runs:

```bash
DOCS_RELEASE_TAG=v0.1.6 node apps/docs/scripts/sync-releases.mjs
```

The synchronizer reads published GitHub release metadata, excludes drafts/prereleases and releases without the image-readiness marker, and verifies every release marker against its exact Git tag commit. It creates missing snapshots up to the requested release using that commit's docs, sidebars and deployment files. Existing frozen snapshots/downloads are retained; partial or conflicting snapshots fail instead of being overwritten. Next content is never replaced while generating a stable snapshot.

The newest included stable version becomes the root documentation. For example, v0.1.6 uses `/self-hosting/community-edition`; v0.1.4 remains at `/0.1.4/self-hosting/community-edition`. A normal main docs dispatch with no `release_tag` includes the newest ready published release. Development-branch docs builds use committed snapshots and do not promote releases.

Generated snapshots in CI belong to that deployment artifact; the workflow does not commit or push generated files. To retain the same snapshots in source, run the synchronizer locally with GitHub CLI read access and all release tags fetched, review the generated files, and commit them. Add a `.gitignore` exception for each new frozen download directory.

## Local build

```bash
pnpm --filter @preflyt/docs typecheck
pnpm --filter @preflyt/docs build
```

The documentation build validates selected-version labels, the Next banner, copyable settings, version-specific download URLs, frozen Kubernetes image tags and broken links. A documentation-only update does not require an application image rebuild.
