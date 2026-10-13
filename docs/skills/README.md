# Built-in skills

## Workflow editing

[GitHub Actions workflow](workflow/github-actions/SKILL.md) is a bundled editing skill used automatically by **Policies → CI jobs → Rewrite workflow**. Preview or download it in **Skills → Built-in skills**; no adoption, approval or extra setup is needed. It preserves existing workflows, reuses current checks, adds the Preflyt Action and explains unresolved report or trigger gaps. The output is a YAML draft that the user reviews before creating a setup PR.

The API uses the same versioned instructions for every rewrite and records the skill ID, version and content digest in rewrite audit events. Existing repository permissions, source sharing, model routes and deterministic YAML validation still apply. This skill is separate from advisory assessment review templates and cannot be adopted as an organization review skill. Update both its runtime manifest in `github-actions-workflow-skill.ts` and Markdown file together; the parity regression covers that contract.

## Assessment review

Open **Intelligence → Skills → Built-in skills**. The library includes 12 first-party Markdown starters linked to every check in the current engineering standards catalogue. Search by skill or check, preview instructions, download `SKILL.md`, or **Use skill**. The library opens first when the organization has no saved skills; both libraries support filtering and pagination.

| Skill | Related engineering checks |
| --- | --- |
| [Security evidence](builtin/security-evidence/SKILL.md) | Secret scanning, static application security, dependency vulnerability scan |
| [CI evidence](builtin/ci-evidence/SKILL.md) | CI configuration, required tests, build validation |
| [Changed-code tests](builtin/test-coverage/SKILL.md) | Required tests, component test coverage |
| [Dependency and lockfile hygiene](builtin/dependency-hygiene/SKILL.md) | Lockfiles, dependency vulnerability scan |
| [Secret exposure](builtin/secret-exposure/SKILL.md) | Secret scanning |
| [Input and access control](builtin/code-security/SKILL.md) | Static application security |
| [Build, types and lint](builtin/build-quality/SKILL.md) | Build, type checking, lint |
| [Timeouts and retries](builtin/service-resilience/SKILL.md) | Timeout and retry controls |
| [Infrastructure exposure](builtin/infrastructure-security/SKILL.md) | Infrastructure policy, unsafe exposures |
| [Container builds](builtin/container-security/SKILL.md) | Container vulnerability scan |
| [Database migrations](builtin/migration-safety/SKILL.md) | Build and required tests; advisory migration safety |
| [API contracts](builtin/api-contract/SKILL.md) | Required tests and types; advisory compatibility review |

Each skill gives concrete review steps, evidence requirements, useful next actions and safety limits. The related checks help administrators choose a review; they do not convert AI inference into a scanner result or passing check. Code-specific concerns require supplied changed lines. Missing or omitted context must remain a limitation, not an invented finding. The database skill explicitly forbids resetting, truncating or dropping the application database as a migration fix.

**Safe defaults:** Use skill creates one organization lineage per built-in and reopens its latest version on subsequent clicks, including after edits. It never duplicates that lineage, overwrites edits, approves, enables or changes policy assignments. The preview offers Create separate copy only when an administrator deliberately needs an independent variant. Downloading creates no organization record. Owners/Admins use a built-in as a disabled editable organization draft, review and approve the exact version, then enable it. Assign that approved version to an AI Review in Engineering Standards and adopt it. Existing policies keep their pinned versions and digests. Editing a saved skill creates a new disabled draft version. Built-in updates never rewrite organization copies. Repository scope is restricted to authorized repositories, and source sharing, automatic dispatch, model routes retain their existing controls. Readers can preview and download without editing or enabling skills.

No migration or data reset is required. The shipped catalogue is compiled with the API; parity tests validate each Markdown document against its runtime template, and check coverage against the current standards catalogue. These are instruction-only review guides, not executable packages or replacements for deterministic engineering checks. See [review skill setup](../operations/review-skills.md).
