# P6 Developer Experience: CLI and IDE Extension

**Status:** Design and acceptance specification, not implemented.
**Phase:** P6 (formerly P5; scope unchanged after the approved Repository Health insertion)
**Related:** [SDLC capabilities](sdlc-capabilities.md), [RBAC](rbac-and-authorization.md), [Roadmap](../roadmap/incremental-delivery.md)

## Decision

Build **one shared TypeScript local assessment engine** used by a Preflyt CLI and VS Code extension. Both consume the same versioned rules, evidence schema, finding fingerprints and result states. The IDE is a presentation and invocation client, **not a separate policy engine or coding agent**. Local results are advisory and cannot satisfy authoritative GitHub quality gates.

## Independently usable increments

| Increment | User-visible deliverable | Completion demonstration |
| --- | --- | --- |
| **P6.1 — Local engine + CLI** | Install CLI, detect Git working tree, run approved fast checks, display file/line findings and machine-readable results | Seeded secret or lint violation detected; offline local check works |
| **P6.2 — Organization integration** | Authenticated browser login (GitHub-first target under ADR-0007; OIDC compatibility during migration), repository linking, authorized policy download/cache and offline freshness display | Authorized repo sync works; revoked membership denies new sync; offline cached policy visibly aged |
| **P6.3 — VS Code extension** | Install VSIX, run shared checks on demand/save, render Diagnostics/Problems and status bar | Real finding appears at correct file/line; workspace trust blocks unsafe execution |
| **P6.4 — Intelligent developer feedback** | Extension sidebar, evidence-linked AI explanation using organization SDLC model routing, central PR gate status | Findings and current PR status display with SHA/freshness; no provider key stored in extension |
| **P6.5 — Developer automation** | Explicit opt-in pre-commit/pre-push hooks, bounded incremental scheduling, compatibility testing for Cursor/Windsurf | Hook detects seeded issue; uninstall restores hooks; supported editors pass compatibility suite |

Each increment must be **packaged, installable, tested and usable without waiting for the next**. Keep prior CLI and extension functionality operational as features are added.

## Packages and responsibilities

- `packages/local-engine`: TypeScript check contracts, applicability, deterministic local policy evaluator, tool adapters, cancellation and normalized findings. No UI or provider secrets.
- `apps/cli`: commands `preflyt check [--changed|--staged|--all]`, `login`, `init`, `status`, `explain` and `hooks install/remove` as each increment ships. Publish a versioned package and reproducible binaries where supported.
- `apps/vscode-extension`: VS Code extension API commands, `DiagnosticCollection`, Problems, TreeView/sidebar, status bar, SecretStorage, workspace-trust handling and optional webview. Never duplicate check logic.
- `apps/api`: server-managed sessions (GitHub-first target; current OIDC retained during migration), scoped policy synchronization, read-only finding explanations, stage-specific AI routing and revision-bound GitHub status lookup.

### Local execution trust

Local checks run **with explicit user consent under workstation permissions**, not in the server's hardened sandbox. In untrusted workspaces, disable potentially executable tasks; never silently install tools, run package scripts, start containers or execute commands from AI output. Prefer non-executing scanners on save. Use short debounces, cancellation, per-tool timeout/CPU limits where supported, and clear opt-in for expensive checks.

No provider API keys or GitHub App credentials are distributed to CLI/extension. Browser-based login uses short-lived scoped credentials and OS/editor secure storage where supported. Never upload source by default; apply organization data-egress policy before sending snippets, findings or logs for AI explanations.

### Result and policy contracts

Every local finding includes repository/worktree identity, file URI and range, rule/check ID, severity, evidence, tool/version, timestamp, policy version and source `local_untrusted`. Distinguish staged vs unstaged and dirty-tree context. Cached policy must display sync age, expiration and unsupported checks; missing mandatory evidence is INCOMPLETE, never PASS.

The central PR check remains authoritative: the extension shows the exact PR head SHA and freshness, not an inferred local green. Model explanations are advisory and must cite evidence and label hypotheses.

### Extension workflow

1. Open trusted repository in VS Code; detect language/framework and linked Preflyt organization.
2. User triggers **Preflyt: Run Assessment**, or enables lightweight on-save checks.
3. Shared local engine selects applicable rules and runs approved local tools.
4. Findings populate Diagnostics/Problems with exact source ranges, sidebar and status bar.
5. Selecting a finding shows evidence, policy rationale and optional AI explanation.
6. Extension can show central PR readiness and link to Preflyt dashboard; no direct merge or policy waiver action.

### Acceptance and security tests

- [ ] P6.1 CLI detects a seeded issue and reports valid structured findings offline.
- [ ] P6.2 authorized policy sync, revoked identity, expired cache and denied repository are tested.
- [ ] P6.3 extension diagnostics update and clear after fix, without editor freezes or leaking stale findings.
- [ ] Workspace Trust disables unapproved code execution and source transmission.
- [ ] P6.4 AI provider outage leaves local checks functional; model output cannot change local deterministic outcomes.
- [ ] Central PR status shown in extension is bound to exact commit and does not inherit stale green.
- [ ] P6.5 hooks are opt-in, documented and cleanly removable; GitHub server gates remain mandatory.
- [ ] All artifacts are versioned, signed or integrity-verifiable where feasible, with tested installation/upgrade/uninstall.
- [ ] Each increment includes release instructions, telemetry with redaction, success/failure tests and rollback.

**Implementation status:** No CLI/extension source is introduced by this document.

Authentication for organization synchronization follows [ADR-0007](../architecture/ADR-0007-github-first-identity-and-organizations.md). GitHub-first login, verified organization linking and member grants are implemented behind `GITHUB_LOGIN_ENABLED=true`; legacy identity merging and provider reconciliation remain pending. The CLI/IDE itself remains unimplemented. Its future organization synchronization must preserve server session and repository authorization boundaries rather than treating App installation credentials as user credentials.
