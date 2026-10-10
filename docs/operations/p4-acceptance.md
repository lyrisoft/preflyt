# P4 AI review acceptance — 2026-10-10

The requested P4 implementation and isolated live review acceptance are complete. Production release qualification is separate; this record does not certify Kubernetes deployment or completion of the P2/P3 production gates.

## Delivered behavior

- Published policy assignments select approved immutable skills; optional language/framework scope requires an exact-commit repository profile.
- Automatic PR admission, bounded changed-line context and read-only inference reuse the existing assessment, route and worker contracts.
- Explicitly enabled neutral GitHub summaries and inline COMMENT reviews remain advisory. They cannot approve or block a merge, waive a check or change deterministic readiness.
- Provider-reported input/output tokens, fallback attempts and administrator-rate estimates have restricted usage visibility. Missing counters or unsupported cache pricing remain unavailable; estimates are not invoices. Gemini output counts include reported reasoning tokens.
- Public GitHub SKILL.md imports require an exact commit, checksum and reviewed license. Imports create drafts; scripts, archives and executable tooling are not imported or run.
- Optional pinned LiteLLM deployment supports Docker Compose and Kubernetes. Direct provider connections remain supported without a gateway.

## Live evidence

Tests used synthetic source text and a UUID disposable database. The application database was not reset or used as the acceptance fixture. A protected application snapshot was saved before the three additive migrations and Prisma regeneration.

| Check | Verified result |
| --- | --- |
| Direct hosted DeepSeek, `deepseek-flash` | Structured findings and changed-line citations validated; provider token usage recorded. |
| Pinned hardened LiteLLM container → local Ollama `qwen2.5:7b` | Structured review completed through the gateway with reported tokens. |
| Automatic worker, private same-repository PR | Duplicate dispatch admitted one review; inference succeeded; feedback was published. |
| Advisory summary | [Neutral Preflyt / AI Review check](https://github.com/lyrisoft/preflyt-p2-acceptance/runs/114089092403). |
| Inline feedback | [COMMENT review](https://github.com/lyrisoft/preflyt-p2-acceptance/pull/1#pullrequestreview-5476690360), verified through authoritative comment receipts. |
| Retry recovery | Repeated publication reused the same summary/review URLs. |
| Changed PR | After advancing the PR head, an attempt for old SHA `5f8a032974e14e8f402b98dc3a22cfe24e89a3eb` was rejected before publication. Earlier feedback remains historical. |
| Gate independence | Gate result before and after inference/publication was identical. |
| Kubernetes gateway | Offline manifest validation only; no live cluster deployment claimed. |

The private [acceptance PR](https://github.com/lyrisoft/preflyt-p2-acceptance/pull/1) contains a generated SQL change, not an application workflow or connected-repository execution. An initial publication attempt exposed GitHub's legacy review-comment listing format; receipt verification now reads each bounded comment's authoritative line/side, and the corrected full worker run passed.

## Regression verification

Focused API tests cover authorization and organization isolation, exact-commit skill selection, digest compatibility, automatic admission, revoked configuration, source controls, provider outages, cancellation, bounded retries, ambiguous GitHub writes, malformed/injected output, token accounting and unchanged gates. Chromium tests cover provider configuration, Markdown/import flows, skill selection and compact responsive standard editing. Final verification passed: 97 API tests across nine files, 49 Chromium tests across five files, API/web production builds, web lint, scoped formatting, Compose overlay validation and git diff checks. The standard editor was visually checked in the running app; browser regressions verify custom dropdown mouse/keyboard selection, aligned controls, mobile overflow and visible actions.

## Deployment limits

Publish versioned Preflyt images and complete the deployment release checklist before claiming production readiness. Verify repository App access, Checks write and Pull requests write before enabling feedback. Summary and inline switches, automatic review and source sharing remain separate explicit choices; existing routes keep new switches off.

A shared production LiteLLM gateway needs organization-scoped keys/model restrictions rather than sharing its administrator master key. Protect API/worker and gateway secrets separately. Kubernetes network controls must be enforced by the deployment CNI. No executable third-party runtime or invoice reconciliation is claimed.

See [review setup](review-skills.md), [model configuration](ai-configuration.md) and [optional gateway](../deployment/ai-gateway/README.md).
