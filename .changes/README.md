# Change files

Add one small JSON file with each feature, improvement, fix or documentation
change. Review its wording with the code. Release notes are assembled from these
files; promotion PR titles and commit messages are not used as product summaries.

Copy `TEMPLATE.json` to a unique lowercase name, such as
`.changes/clearer-skill-validation.json`, and replace the placeholders:

```json
{
  "type": "improvement",
  "title": "Clearer skill upload errors",
  "description": "Upload errors identify the invalid field and submitted length.",
  "upgrade": "none",
  "migrations": [],
  "configuration": []
}
```

- `type`: `feature`, `improvement`, `fix` or `documentation`.
- `title`: a short plain-text label, up to 120 characters.
- `description`: a finished paragraph explaining the user problem and resulting
  behavior, up to 1,500 characters. Include important limits. Do not claim
  unverified outcomes or use a broad promotion PR title.
- `upgrade`: required actions in one paragraph, up to 2,000 characters. Use the
  exact value `none` when the change needs no additional upgrade steps.
- `migrations` and `configuration`: optional arrays listing the exact changed
  repository-relative files explained by `upgrade`. Use an empty array when none
  apply. References to unchanged files are rejected.

Files are limited to 16 KiB. Unknown fields, empty descriptions and unfinished
placeholders fail validation. Keep prose on one line per JSON string; Markdown
links and inline code are supported in descriptions and upgrade instructions.

## Migration and configuration explanations

The generator detects added, modified and removed migration SQL files under
`apps/api/prisma/migrations/`, example environment files, root Compose files,
deployment YAML/JSON/config files and the configuration catalogue. Every detected
file must be listed in a change file with an explicit upgrade explanation. For
example:

```json
{
  "type": "feature",
  "title": "Saved review history",
  "description": "Review earlier saved decisions from the finding details page.",
  "upgrade": "Back up the database, run the migration service, then recreate the API and worker with REVIEW_HISTORY_ENABLED=true.",
  "migrations": ["apps/api/prisma/migrations/20261020090000_review_history/migration.sql"],
  "configuration": [".env.example", "docker-compose.yaml"]
}
```

This is a format example, not a shipped feature or setting. Detection checks
known file paths; it cannot infer breaking behavior or required actions from
arbitrary application code. Reviewers must describe those changes too. On adopting
this process, backfill change files for any earlier unreleased work that needs to
appear in the next release.

## Preview locally

Use the previous published stable release as the base. Fetch full history first
if the release commit is not available locally.

```bash
node scripts/ci/generate-release-notes.mjs --base=v0.1.10 --version=v0.1.11 --worktree
```

`--worktree` includes uncommitted and untracked changes for local review. Omit it
to preview only the exact checked-out commit. Use `--base=initial` for the first
release. `--output=/tmp/preflyt-notes.md` writes a private new file and refuses to
overwrite an existing one. Previewing does not contact GitHub, build images,
create commits or publish anything.

## What happens when publishing

Publishing remains an explicit manual workflow dispatch on `main`. The planner
uses the newest earlier **published, stable, image-ready release** as its base,
checks the marker against that release's tag, and reads new change files from the
exact build commit. Drafts, prereleases and reserved tags are not baselines.

New features go under **What's new**. Other changes go under **Improvements and
fixes**. Upgrade instructions are deduplicated under **Upgrade notes**. Empty
sections say so explicitly. Image tags, platforms, source commit and full changelog
are added after the images are verified. The prepared notes appear in the workflow
summary; publication recomputes them and checks their hash against the pre-build
plan before changing registry tags or publishing a new release.

Keep change files after release. The next release excludes files already present
at its baseline. Previously released files are immutable: add a new file for a
correction rather than editing, renaming or deleting an old one. Rerunning an
already published release preserves its description, including manual corrections.
Historical curated notes under `docs/releases/notes/` remain available for explicit
notes-only corrections; new releases do not require a version-specific Markdown
file or an automated commit back to the repository.
