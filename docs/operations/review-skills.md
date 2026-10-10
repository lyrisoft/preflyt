# Review skills and advisory assessment reviews

## Current delivery

Open **Intelligence → Skills** (also available as **AI Intelligence → Review skills**). Owner/Admin users create drafts from the built-in Markdown skill library, or enter reviewed instructions. Skills supply review instructions; optionally restrict their repository scope. Review stages are assigned on AI reviews in Engineering Standards. An empty repository selection means all authorized repositories in the organization. Drafts start disabled. Review the instructions, source and license, approve the exact content digest, then enable that version. Editing creates a new draft version; earlier versions remain unchanged. Policy Managers and Security Engineers can approve versions; only Owner/Admin can manage or enable them. Readers see only their organization’s catalogue.

## Markdown editor and SKILL.md

In **Intelligence → Skills**, select **Create skill** for a blank draft, **Upload SKILL.md** to load a file, or **Review → Create new version** to change an existing skill. The wide editor separates metadata and repository scope from instructions. **Write** accepts Markdown; **Preview** renders headings, lists and code blocks without running HTML, opening links or loading images. **Replace from SKILL.md** replaces the open draft contents while retaining the existing skill family and expected version. Uploading does not save, approve, enable or run a skill.

Files must be UTF-8 `.md` documents, at most 32 KiB. Instructions can contain up to 6,000 characters. The YAML header requires `name` and `description`; optional fields are `source`, `license`, `stages` and `repositories`. Duplicate keys, aliases, custom YAML tags and unsupported fields are rejected. Repository IDs must be authorized for the current organization. When source is omitted it defaults to `Uploaded SKILL.md`; when license is omitted the editor requires you to enter it before saving. Record the actual provenance and license rather than assuming third-party material is organization-owned.

```markdown
---
name: Security evidence review
description: Explain failed checks and missing evidence
source: Organization-authored instructions
license: Organization-owned
---

# Review instructions

- Review only the supplied assessment evidence.
- Cite each check used to support a finding.
- Recommend the next evidence to collect.
- Never treat missing evidence as a passing check.
```

The server validates the file as an instruction document. It does not fetch related files, import scripts or install packages. Optional legacy `stages` metadata is retained for exact version/digest round trips; AI Review assignments in Engineering Standards determine where a skill runs.

**Review → Download SKILL.md** exports the selected database version after verifying its content digest and the reader's organization access. Files contain metadata and instructions, not approval status or enablement. Saving an edited file creates a disabled draft requiring review and approval. Policies and assessments keep their existing skill version and digest; a later file change cannot alter those pins. No additional database migration is needed for Markdown support.

These skills contain instructions only. They cannot run commands, load packages, read files, change policy or post to GitHub. No candidate third-party skill is bundled or automatically imported. Do not paste credentials into instructions. Administrators record provenance and license review when approving a version.

In **Repository → Assessments**, open a saved assessment and find **Code Quality · AI Review**. Authorized reviewers select up to three AI reviews from that assessment’s frozen standards, then click **Run review**. Each review uses its pinned approved skill version. Free-form skill selection is not accepted. Results and recent history appear there, with pagination and cancellation. Viewers/Auditors can read results but cannot request reviews. Running a review still requires current repository permissions and GitHub access.

This first runtime reviews the saved assessment’s check identifiers, required/optional status, coverage, freshness and provider result. It sends no source files, PR diff, raw scanner logs or free-text scanner reasons. It is not contextual source-code review. Every suggestion is inferred and advisory, references a known check, and stays separate from deterministic gates. An empty AI response is not a passing check.

## Setup for Docker, Kubernetes and local development

1. Preserve a protected database backup, deploy the additive `20261010008000_review_skills` migration, and regenerate Prisma. Never reset the application database to install this feature.
2. Set `AI_CONFIGURATION_ENABLED=true` and `AI_REVIEWS_ENABLED=true` for both API and existing worker. Defaults are false. Use the same stable, separate `AI_PROVIDER_ENCRYPTION_KEY` in both processes; it is a base64-encoded 32-byte key stored in deployment secrets.
3. Activate a built-in provider with its API model name and key, or add a custom connection. Test and enable it. In **Configure model**, enter current input and output prices in cents per million tokens. Zero is valid for a free local model; unknown prices prevent review admission. Preflyt does not fetch or maintain provider pricing automatically.
4. Enable the **Repository** or **Pull requests** model route, select a tested primary and optional fallback, and set token limits and the daily budget. Evidence-only reviews need no source sharing. PR reviews can include verified changed lines when source sharing is enabled.
5. Approve and enable a skill. In **Engineering Standards → New standard / Edit standard → AI Reviews**, add a named review, select its approved skill version and choose repository and/or PR review stages. Save, adopt that standards version for the repository, and create a new assessment. Policy drafts freeze the same review and skill assignment. Request an assigned review from assessment details, or enable automatic reviews on the Pull requests route. Automatic reviews require a currently published policy and its exact approved skill assignments; saving a model or skill alone does not start inference.

Docker Compose forwards these settings to both services. Kubernetes reads the two flags from `preflyt-config`; supply `AI_PROVIDER_ENCRYPTION_KEY` in both API and worker Secrets. The existing worker owns this durable queue; no separate AI container or Docker/Kubernetes execution authority is required. Hosted providers must pass public-address/DNS validation. Explicit self-hosted connections use the existing private-endpoint validation contract. See [model configuration](ai-configuration.md).

## Limits, costs and recovery

Requests freeze assessment SHA/hash, skill versions/digests, route revision and tested provider revisions. Requests are idempotent for the same requester and frozen configuration. Up to three assigned AI reviews run in one bounded request, with at most one primary attempt and one configured fallback attempt. The organization is limited to 20 admitted reviews per hour.

Before admission, a serializable transaction reserves the estimated maximum primary and fallback cost against the organization/stage UTC daily budget. Input tokens are conservatively estimated from prompt bytes plus an allowance; output is capped by the configured token limit. Rates are administrator supplied. This is admission accounting, not a provider invoice or guaranteed provider-billing ceiling. Reservations are retained after cancellation, failure and fallback; they are not refunded. History separates the reserved estimate from provider-reported input/output tokens and observed latency. Cost derived from reported tokens uses administrator-supplied rates and is labeled an estimate, not an invoice. Missing/invalid counters stay unavailable; cache-specific pricing is unavailable until explicitly supported. Every completed provider response records usage before output validation, including rejected output and fallback attempts. Usage and cost visibility require ai.usage.read. Reservations remain conservative and are not refunded.

A worker processes one job at a time per process. Requests older than ten minutes expire; execution has a shared 60-second deadline. Workers recheck access, approval, route/provider freshness and cancellation while running and before saving. Interrupted running jobs become unavailable after 90 seconds and are not automatically replayed. A failed or cancelled identical request stays in history; a new approved configuration version creates a distinct request.

HTTP bodies are bounded to 64 KiB and responses to 1 MiB. Structured model output is further bounded and validated for snapshot identity, known skill/check references, allowed fields, duplicate suggestions, credential patterns and unsupported authority claims. Prompt wording and filtering reduce risk; they do not prove a model is immune to prompt injection. The authority boundary is enforced by the application: no model tools, code execution or gate mutations. Only the application can publish an explicitly enabled neutral advisory summary.

Model outages, invalid output, changed permissions/configuration, stale tests and cancelled jobs produce no successful AI result. Raw upstream errors and keys are excluded from result/audit payloads. Request, approval, enable/disable, retirement, cancellation and completion events are audited.

## P4 acceptance and runtime limits

Language/framework scope, pinned third-party Markdown imports, opt-in inline GitHub comments, provider-reported usage and optional LiteLLM Docker/Kubernetes deployment are implemented. Live private-repository worker, neutral summary and inline COMMENT publication acceptance passed, including repeated publication recovery and stale-commit rejection. See [acceptance evidence](p4-acceptance.md). Production deployment still requires the configured App to include the repository and have Pull requests: write. Executable third-party scripts remain outside the instruction-only P4 runtime and require their own approved isolated execution contract. AI has no authority over deterministic readiness checks.

## AI review assignment upgrade

AI review definitions live in organization standard JSON; this change needs no new database migration. Existing standards and policies keep their original digests and deterministic behavior. Existing assessments without AI review assignments display an empty review state. Adopt a new standard version and create a new assessment to use an AI review. Retiring or disabling a skill makes its pinned check unavailable; it never silently switches to another version or records a pass. Stored legacy skill stage metadata is retained for immutable version hashes; review stages now control execution.

## Verification

The check assignment and editor follow-up passed 80 focused API tests and 25 browser tests, including frozen policy assignments, rejection of unassigned checks, keyless self-hosted configuration, desktop dialog sizing, pagination and mobile overflow. API and web type checks and production builds passed. Provider responses were fixtures; no live model inference was run.

The product calls these assignments **AI Reviews**. They are advisory reviews of saved evidence and optionally verified PR changes. They can be requested explicitly or dispatched automatically from a published policy. Existing JSON/API fields (`aiChecks`, `checkIds`, `checkId`) remain compatible; this terminology update changes no frozen definition, approval or policy hash.

## Automatic PR reviews and GitHub feedback

Deploy additive migration `20261010011000_automatic_pr_ai_reviews` after a protected backup; regenerate Prisma and restart API and worker. Existing routes retain automatic reviews and summary publication **off**. Do not reset the database. Docker and Kubernetes use the same existing event worker and queue.

In **AI Intelligence → Model routing → Pull requests → Configure**, enable the route and **Run assigned AI Reviews automatically**. Enable source sharing to include changed code; leave it off to review assessment evidence only. Adopt a standard with approved AI Reviews and publish its branch policy. Signed GitHub PR observations are reconciled by the worker, including CI-triggered wakeups and restart catch-up. Reviews are limited to open, non-draft PRs with heads in the same repository. Fork reviews remain unsupported. A missing matching assessment is created through the existing exact-revision assessment service, with current authorization and standards checks.

Requests pin the PR number, head/base commits, published policy digest, review/skill assignments and model-route revision. A database unique key prevents duplicate webhook events or workers from spending twice for those pins. Changed commits or approved configuration produce a new request. A failed identical inference is not automatically replayed. Revoked permissions, changed policies/skills, stale team scope, disabled routes and changed PRs make the review unavailable. Source sharing is rechecked before and during inference.

Source review fetches read-only GitHub PR files, verifying PR identity before and after collection and before/after inference. It performs no checkout or code execution. At most 200 files, 300 changed lines and 24 KiB of line data are admitted. Added/deleted lines have verified file, side and line references; unchanged lines are not citable. Binary/unavailable/truncated patches, `.env`/private-key files and recognized secret-bearing patches are omitted. These filters are best-effort, not a guarantee that all secrets are detected. Raw bounded source is retained in the protected queued job snapshot for execution; API history and results expose references, not raw source. Omitted counts remain visible. Protect database backups and apply the organization's retention policy.

To publish feedback, enable **Publish advisory summary to GitHub**, set `GITHUB_CHECK_PUBLICATION_ENABLED=true` for the worker, and grant the existing assessment App repository-scoped **Checks: write** plus **Pull requests: read**. Preflyt publishes **Preflyt / AI Review** on the reviewed head commit, with a **neutral** conclusion and changed-line citations. The summary switch does not create inline comments; those require the separate inline option below. Neither publication updates Engineering Readiness, approves a policy or alters a ruleset. Keep the deterministic **Preflyt / Engineering Readiness** check as the enforcement check. Publication verifies App identity and read-back content, recovers an existing matching publication and retries transient failures at most five times with one-minute spacing. Current authorization, policy and PR identity are rechecked before each attempt.

Disable the route's automatic review or summary switches to stop new work/publication; disable the deployment review flag to stop all inference. Retain migrations, history and encryption keys when rolling back.

Verification for this increment: disposable-database and provider fixtures exercise duplicate admission, stale PR/policy/route rejection, source controls, budgets, citations and neutral publication read-back. A synthetic changed-code review also passed through the real local Ollama `llama3.2:3b` transport with validated `diff:0` output. Those earlier fixture tests did not establish hosted-provider or live GitHub acceptance; both were subsequently verified in the [P4 acceptance run](p4-acceptance.md).

## Built-in safe defaults

The **Built-in skills** tab supplies 12 editable starters for CI/security evidence, changed-code tests, dependency lockfiles, secret exposure, access/input validation, build/types/lint, resilience, infrastructure, containers, database migrations and API contracts. Each lists its related checks and provides concrete Markdown review steps. Use View, Download SKILL.md or Use skill; organization versions follow the existing disabled-draft, reviewed-approval and version-pinning workflow. No automatic assignment, approval, inference, source sharing or data migration occurs. Readers can preview/download; only existing authorized administrators can save copies. See the [library and Markdown files](../skills/README.md).

Use skill is repeat-safe: the server uses one stable, organization-scoped skill key per built-in and returns its latest saved version. Concurrent requests cannot create two initial versions. It does not overwrite edited instructions or restore disabled/retired skills. Editing continues through the existing new-version workflow. Create separate copy in the preview deliberately makes an independent variant.

When no approved, enabled skill is available, the Engineering Standards AI Reviews editor keeps Add AI Review disabled. The empty state links to Skills in a separate tab, and the refresh icon reloads eligible versions while keeping the unsaved standard draft. Failed refreshes show an inline error rather than discarding the draft.

## Language and framework selection

Skill versions may include optional `languages` and `frameworks` arrays in the editor or SKILL.md header. Empty arrays mean all languages/frameworks. Names normalize to lowercase; values within a dimension are alternatives, while configured language and framework dimensions must both match. Selection uses only the assessment's pinned repository profile for its exact source commit. Missing detection, another commit or a mismatch visibly skips the constrained review. Automatic dispatch filters only the published policy's assigned versions; it never adds unapproved catalogue skills. Changing scope creates a new disabled version and digest; preexisting unscoped skill digests remain unchanged.

## Opt-in inline GitHub feedback

The Pull requests model route has a separate Publish advisory comments on changed lines option. It requires automatic reviews and source sharing; all defaults remain off. The App needs repository Pull requests: write. Only validated findings with a supplied diff reference become line comments; evidence-only findings stay in the assessment or optional summary. Comments are submitted as a COMMENT review, never APPROVE or REQUEST_CHANGES. Exact head/base commits, live authorization, route revision and policy pins are rechecked. A stable marker, App bot identity, bounded history and comment read-back recover ambiguous writes without duplicate reviews. Publication shares the existing bounded worker lease/retry workflow. Changed PRs or revoked configuration prevent further publication. Existing comments remain historical; Preflyt never dismisses other reviews.

## Pinned third-party Markdown imports

Intelligence → Skills → Import from GitHub accepts a public repository, exact 40-character commit, SKILL.md path and license path. The server reads only those two fixed-origin, bounded UTF-8 files with pinned public DNS, no redirects and no ambient credentials. The preview shows the license text and skill checksum. An administrator acknowledges the license and records its name before opening a draft. Source records contain repository/commit/path/checksum; editing requires a new approval. Private upstream documents can still be uploaded manually with reviewed provenance. Import creates no database record or model request until explicitly saved. Unknown executable/tool metadata is rejected; companion scripts and archives are never fetched or executed.

See [optional LiteLLM deployment](../deployment/ai-gateway/README.md).
