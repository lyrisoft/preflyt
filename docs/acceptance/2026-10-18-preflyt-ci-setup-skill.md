# Preflyt CI setup skill — 18 October 2026

## Delivered

One built-in **Preflyt CI setup** skill supports creating a standalone PR workflow and preserving an existing workflow during updates. The old `github-actions` download/API identity remains a compatibility alias; Skills lists one workflow skill. Runtime instructions, the downloadable Markdown and versioned audit identity are checked together.

The creation endpoint reads repository setup at the published policy branch's verified commit. It provides bounded package/workspace/script/lockfile evidence and safe existing verification setups. AI selects a supplied setup identifier; deterministic rendering owns the complete YAML, supported Action version, exact PR-head checkout, PR-only conditions, minimal permissions, policy runner and terminal gate. Invented choices and arbitrary model YAML are rejected. Missing prerequisites remain review notes. This does not infer unknown databases or author unsupported setup commands.

Generation requires current repository AI/policy permissions, enabled model routing and source sharing. It shares the existing organization request limit, records skill/model/commit/digests without prompts or raw provider responses, and rechecks access, configuration, policy and branch state before returning a proposal. Potential credentials are excluded from creation context; provider credential leakage in model output is rejected. The configured model receives repository setup under the existing source-sharing settings.

The UI offers **Generate workflow with AI** without mandatory instructions, explains unavailable AI, retains manual editing, displays a comparison and setup notes, and requires explicit application and review before the separate setup PR action. Generation neither executes repository code nor writes to GitHub. Included prerequisites add standalone `.github/workflows/preflyt.yml` setup; existing CI/deployment files are preserved.

## Verification

- 54 focused API tests: setup evidence, unified skill/download identity, inference lifecycle, permissions, source sharing, request limits, stale branches, invented/unsafe responses, provider reads/writes and workflow preservation.
- 35 Chromium tests: generation, proposal review, unavailable/read-only states, narrow layout, skill catalogue, workflow copying and request-error recovery.
- API and web TypeScript checks, frontend lint and `git diff --check` passed.
- Documentation build, asset/link validation and documentation version checks passed.
- A separate staged-file snapshot verifies the commit without the unrelated working-tree cache/coordination changes.

Model responses were mocked for deterministic inference/validation tests. No live provider inference, GitHub setup PR, remote workflow, push or merge was performed. Live model and GitHub runner acceptance remain separate from these local checks.
