# Review skills and advisory assessment reviews

## Current delivery

Open **Intelligence → Skills** (also available as **AI Intelligence → Review skills**). Owner/Admin users create drafts from the first-party Security evidence review or CI evidence review template, or enter reviewed instructions. Choose repository and PR stages and optionally restrict repositories. An empty repository selection means all authorized repositories in the organization. Drafts start disabled. Review the instructions, source and license, approve the exact content digest, then enable that version. Editing creates a new draft version; earlier versions remain unchanged. Policy Managers and Security Engineers can approve versions; only Owner/Admin can manage or enable them. Readers see only their organization’s catalogue.

These skills contain instructions only. They cannot run commands, load packages, read files, change policy or post to GitHub. No candidate third-party skill is bundled or automatically imported. Do not paste credentials into instructions. Administrators record provenance and license review when approving a version.

In **Repository → Assessments**, open a saved assessment and find **Code Quality · AI Review**. Authorized reviewers select up to three approved, enabled skills assigned to that repository and assessment stage, then click **Run review**. Results and recent history appear there, with pagination and cancellation. Viewers/Auditors can read results but cannot request reviews. Running a review still requires current repository permissions and GitHub access.

This first runtime reviews the saved assessment’s check identifiers, required/optional status, coverage, freshness and provider result. It sends no source files, PR diff, raw scanner logs or free-text scanner reasons. It is not contextual source-code review. Every suggestion is inferred and advisory, references a known check, and stays separate from deterministic gates. An empty AI response is not a passing check.

## Setup for Docker, Kubernetes and local development

1. Preserve a protected database backup, deploy the additive `20261010008000_review_skills` migration, and regenerate Prisma. Never reset the application database to install this feature.
2. Set `AI_CONFIGURATION_ENABLED=true` and `AI_REVIEWS_ENABLED=true` for both API and existing worker. Defaults are false. Use the same stable, separate `AI_PROVIDER_ENCRYPTION_KEY` in both processes; it is a base64-encoded 32-byte key stored in deployment secrets.
3. Activate a built-in provider with its API model name and key, or add a custom connection. Test and enable it. In **Configure model**, enter current input and output prices in cents per million tokens. Zero is valid for a free local model; unknown prices prevent review admission. Preflyt does not fetch or maintain provider pricing automatically.
4. Enable the **Repository** or **Pull requests** model route, select a tested primary and optional fallback, and set token limits and the daily budget. Saved-assessment reviews use no source code, so enabling source sharing is unnecessary.
5. Approve and enable an assigned skill, then explicitly request a review. Saving a model, route, skill or assessment never automatically sends an inference request.

Docker Compose forwards these settings to both services. Kubernetes reads the two flags from `preflyt-config`; supply `AI_PROVIDER_ENCRYPTION_KEY` in both API and worker Secrets. The existing worker owns this durable queue; no separate AI container or Docker/Kubernetes execution authority is required. Hosted providers must pass public-address/DNS validation. Explicit self-hosted connections use the existing private-endpoint validation contract. See [model configuration](ai-configuration.md).

## Limits, costs and recovery

Requests freeze assessment SHA/hash, skill versions/digests, route revision and tested provider revisions. Requests are idempotent for the same requester and frozen configuration. Up to three skills run in one bounded request, with at most one primary attempt and one configured fallback attempt. The organization is limited to 20 admitted reviews per hour.

Before admission, a serializable transaction reserves the estimated maximum primary and fallback cost against the organization/stage UTC daily budget. Input tokens are conservatively estimated from prompt bytes plus an allowance; output is capped by the configured token limit. Rates are administrator supplied. This is admission accounting, not a provider invoice or guaranteed provider-billing ceiling. Reservations are retained after cancellation, failure and fallback; they are not refunded. History shows the reserved estimate and observed latency, not actual billed usage.

A worker processes one job at a time per process. Requests older than ten minutes expire; execution has a shared 60-second deadline. Workers recheck access, approval, route/provider freshness and cancellation while running and before saving. Interrupted running jobs become unavailable after 90 seconds and are not automatically replayed. A failed or cancelled identical request stays in history; a new approved configuration version creates a distinct request.

HTTP bodies are bounded to 64 KiB and responses to 1 MiB. Structured model output is further bounded and validated for snapshot identity, known skill/check references, allowed fields, duplicate suggestions, credential patterns and unsupported authority claims. Prompt wording and filtering reduce risk; they do not prove a model is immune to prompt injection. The authority boundary is enforced by the application: no model tools, code execution, gate mutations or GitHub writes.

Model outages, invalid output, changed permissions/configuration, stale tests and cancelled jobs produce no successful AI result. Raw upstream errors and keys are excluded from result/audit payloads. Request, approval, enable/disable, retirement, cancellation and completion events are audited.

## Remaining P4 work

Pinned PR diffs and changed-line references, language/framework-based skill selection, third-party package import/review, automatic PR dispatch, explicit GitHub feedback, actual provider usage accounting and LiteLLM deployment remain separate work. This delivery does not complete P4 or grant AI authority over deterministic readiness checks.
