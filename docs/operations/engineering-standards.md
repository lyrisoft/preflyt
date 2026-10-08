# Engineering Standards Library (P0.4a)

## User workflow

Open a selected repository's existing profile page. The **Engineering standards** panel lists five first-party version 1.0.0 packs: Baseline Engineering, Application Security, Backend Services, Frontend Applications and Infrastructure as Code. Expand a pack to inspect its rules, stages, capability labels and SHA-256. The current navigation, theme and shell are unchanged.

Owners, Admins and Super Admins can choose Default, Recommended or Strict, select exact pack versions and save. Viewers/developers may inspect saved selections and configuration gaps. A saved selection applies to this repository, all branches and the self-hosted deployment organization. Its mode is always **observe**. Strict changes which controls are required in the preview; it does not enable blocking, alter GitHub branch protections or run repository code.

Default marks core CI, tests and secrets requirements. Recommended adds the broader selected-pack requirements. Strict adds backend resilience requirements. Pack details expose each rule's required profiles. Selecting a profile does not automatically select additional packs. Recommendations propose Baseline and Application Security for every repository; detected NestJS/Express/Fastify adds Backend, detected frontend frameworks add Frontend, and detected IaC/container hints add Infrastructure. Unknown stack signals never invent a detected framework. Recommendations are suggestions, not automatic adoption.

Before saving, controls preview the recommended versions. After saving, controls represent the adopted versions/profile. Configuration hints are not executed checks: missing known configuration shows MISSING, absent/incomplete discovery shows UNKNOWN, and observed hints show HINT_DETECTED with path/blob evidence from the current pinned profile. Every assessment result and quality gate is null. `available` currently means configuration-posture inspection only; `import_only` means a raw report format is supported but trusted rule evidence is not mapped; `planned` means the adapter is not implemented. None imply compliance or PASS. Native scans, missing-evidence policy decisions and imported-result mapping are subsequent phases.

## Contracts and governance

Authenticated `GET /standards/catalogue` returns immutable definitions and profile options. Authenticated `GET /github/repositories/:repositoryId/standards` returns catalogue, recommendations, current adopted selection, current profile snapshot, control posture and explicit scope. Repository reads require current local selection and an active verified installation record; the surrounding profile retains its live GitHub access verification. No new GitHub requests or model calls are introduced by the catalogue route.

Owner/Admin/Super Admin `POST .../standards` requires the configured browser origin and accepts only:

```json
{
  "profile": "RECOMMENDED",
  "packs": [{ "id": "baseline-engineering", "version": "1.0.0" }],
  "expectedSelectionId": null
}
```

Use null for the first assignment and the current selection ID thereafter. One to five unique pack IDs with supported exact versions are required. The server derives digests; callers cannot supply them or request enforcement/overrides. Unknown fields, unsupported profiles/versions and duplicates are rejected. Installation/repository locking serializes revocation and edits. A stale concurrency token returns 409; reload, review and save explicitly. Saved selections are append-only with increasing per-repository revision, exact pack digests, actor, time, and the adoption-time profile ID/SHA when available. Selection and audit commit together; audit failure rolls back the assignment.

Current posture can use a newer discovered profile while the adopted record retains its original profile reference. Discovery and code updates never automatically adopt pack versions. A future pack change must add a new immutable version, retain old definitions, and obtain explicit administrator selection. Pinned digest tests protect the published initial definitions. Conflicting same-ID definitions are rejected rather than silently weakened. If an adopted digest/version is unavailable or mismatched, selectionIntegrity is false, controls are withheld and the UI requires review; it never substitutes a current definition silently. Organization inheritance, repository overrides, exceptions, stage/branch scope editing and version-upgrade impact previews are not implemented in P0.

## Deploy, verify and rollback

Apply additive migration `20261009000000_repository_standards`, regenerate the Prisma client, and run the current API/web source or build the existing Docker Compose images. The standard migration service applies it on deployment. No new service, model, worker, scanner permission or environment variable is needed. The same API/web Dockerfiles include the new modules and screen. Published image/clean-deployment acceptance remains a release activity; this task does not mark the whole P0 release complete.

Only a new table/index/foreign key is created; existing profiles, CI evidence and identities are preserved. Existing PostgreSQL backup procedures include selections and audit. Repository deletion cascades its selections; preserve audit/retention together. A compatible previous API may run with the added table retained; do not reset/drop the database for rollback.

Focused tests cover catalogue immutability, stack recommendations, profile differences, configuration uncertainty, composition, permissions/origin, invalid inputs, repository revocation, concurrent edits, immutable history, digest mismatches and audit rollback. Frontend verification uses types, touched-file lint and formatting. Browser tests are intentionally skipped per the development workflow. Operator demonstration: choose a discovered Node backend, inspect Backend recommendation/reason and unsupported checks, save a profile/pack selection, reload and inspect its persisted revision; verify a Viewer cannot save and absent required CI never shows PASS.
