# Skill-Based AI Engineering Review

**Status:** Instruction-only catalogue, saved-assessment evidence review, bounded exact-commit PR diff review, automatic published-policy dispatch and opt-in neutral GitHub summaries implemented.
**Scope:** Read-only pull-request analysis. Not a general coding agent.
**Related:** [Code Quality Review](code-quality-review.md), [AI routing](../architecture/ADR-0004-shift-left-assessment-governance.md), [RBAC](rbac-and-authorization.md).

## Implemented first increment

Intelligence → Skills supports organization-scoped drafts, immutable integer versions and content digests, reviewed approval, enable/disable/retire, repository scope and pagination. Repository assessment details expose explicit AI evidence review using approved model routing, cancellation and validated inferred suggestions. The [12 built-in Markdown skills](../skills/README.md) provide concrete review guides linked to every current engineering check; instruction-only SKILL.md uploads open editable drafts and downloads export the selected immutable database version. Candidate third-party packages and scripts are not bundled or executed. PR reviews can include bounded verified changed lines under an enabled source-sharing route. See [setup, permissions and exact limits](../operations/review-skills.md). Language/framework selection and opt-in inline comments are implemented. Administrator-reviewed public GitHub SKILL.md imports pin upstream commits and checksums. Executable-package manifests and script execution remain outside this instruction-only runtime.

## Markdown file contract

The implemented editor supports Markdown Write/Preview tabs and UTF-8 `SKILL.md` upload/download, with an explicit YAML header for name and description. Uploads never imply approval or execution. File changes create a new draft; approved versions and policy digests remain pinned. This instruction-only file format differs from the proposed executable-package manifest below. See [file format, limits and approval workflow](../operations/review-skills.md#markdown-editor-and-skillmd).

## Check-to-skill assignment

Each advisory AI review in an organization engineering standard has a name, review stages and a pinned approved skill ID/version/digest. Skill instructions explain how to perform that check; SDLC stages decide when it is applicable. Standard adoption freezes the assignment, policies include it in their reviewed definition, and assessments run only those saved assignments. A missing, disabled or revoked skill produces an unavailable review, not passing evidence. The catalogue stays reusable; skill versions do not independently schedule checks.

## Decision

Preflyt agents may apply **versioned, approved review skills** that encode specialized review rubrics. Examples requested for evaluation include **Ponytail** (simplicity/overengineering) and **Thermo-Nuclear Code Quality Review** (strict maintainability). These are **candidate third-party skills**, not pre-installed, license-approved or verified compatible by this document. Before integration, verify each upstream repository, precise skill identity, contents, license, provenance and permitted redistribution; do not assume an external skill is safe or executable.

Preflyt owns orchestration, policy scope, model routing, tool permissions, evidence collection, structured output, audit and deterministic quality gates. A skill supplies bounded **review instructions**, not authority to run shell commands, edit files, post to GitHub or change policy.

## Proposed review pipeline

Signed PR webhook → pinned diff/context → deterministic evidence ingestion → organization policy and skill selection → constrained model routing → parallel or sequential read-only skill analysis → structured finding validation → deduplication/correlation → assessment UI → approved GitHub summary/inline feedback → independent deterministic quality gate.

Selection may depend on language, framework, changed paths, risk class, applicable policy and organization-approved skill set. Enforce per-PR time and request limits and bounded context. Prefer deterministic scanner results as evidence; label model-only claims as hypotheses.

## Skill manifest contract

Each installed skill must have: immutable ID, display name, semantic version, pinned upstream commit/digest, origin and license review, checksum, supported languages/stages, review domains, required context, allowed **read-only** tools, required data classification, model capability requirements, input/output schema version, execution timeouts and approval state.

Example **proposed** metadata (not an imported third-party skill):

~~~yaml
schema_version: 1
id: preflyt.maintainability-review
version: 0.1.0
source:
  kind: local-reviewed
  digest: sha256:<reviewed-package-digest>
stages: [pull_request]
domains: [maintainability, complexity]
execution:
  mode: instructions_only
  tools: [read_diff, read_allowed_context, read_scan_evidence]
  write_access: false
outputs:
  schema: preflyt.review-finding.v1
~~~

A finding includes PR/head SHA, file and changed-line mapping, rule/skill/version, severity, confidence, evidence references, observed-vs-inferred flag, concise rationale and recommended next action. Reject invalid/unsupported line references and unsupported certainty claims.

## Security and supply chain

- Import via administrator-controlled review, explicit pin/digest and allowlist. Never fetch `latest` at assessment time or execute arbitrary SKILL.md instructions as commands.
- Third-party skill files and repository content are **untrusted instructions/data**; apply prompt-injection boundaries and restrict agent tools independently of prompt text.
- No untrusted skill may request secrets, unrestricted network, GitHub write tokens, Docker socket, host shell or model-provider credentials.
- Use tenant-scoped source egress controls, redaction, repository RBAC, audit logs, quotas and cancellation.
- The first runtime supports **instruction-only skills**. Script-based skills require a separate security-approved isolated executor and explicit opt-in, not implied by importing the package.
- Review model output before GitHub publication; do not permit autonomous code edits, merges or policy waivers.

## Administration and UI

**Intelligence → Skills** (when usable): list installed/available reviewed skills, provenance, pinned version, license/security status, supported repositories/languages, enablement, assigned stages, selected model route, last review outcome and audit. Organization admins can propose/import; authorized policy/security approvers activate. Repository-level overrides cannot bypass organization restrictions.

Assessment → **Code Quality → AI Review**: show which skills ran/skipped/failed, exact versions, duration, reported usage, findings and source references. GitHub summary feedback is default; inline comments require separate authorization and deduplication.

## Phases without renumbering

- **P1:** bounded, read-only CI/PR explanation; optionally execute a single reviewed instruction-only skill with approved model/egress and structured output.
- **P2:** versioned skill catalogue/enablement and advisory review policies, without giving AI gate authority.
- **P3:** correlate with verified scanner evidence; skill instructions cannot bypass sandbox rules.
- **P4:** multiple skills per PR, routing, correlation, validation, GitHub summary and opt-in inline feedback.
- **P6:** reuse approved skills in CLI/IDE via server authorization and local policy.

## Acceptance

- [ ] Administrator can inspect provenance and enable only a pinned, reviewed skill.
- [ ] A PR triggers only eligible skills and logs version/model/context/usage.
- [ ] A malicious skill asking for secrets, shell, network or policy bypass cannot obtain those capabilities.
- [ ] Invalid/unverified AI findings cannot block a PR.
- [ ] Failed/timeout/provider-unavailable skill yields visible unavailable state; deterministic gate continues.
- [ ] Findings deduplicate across repeated webhooks and new revisions.
- [ ] Imported third-party skills are not described as bundled until licensing and compatibility tests pass.
