# SAST compatibility and independent check results

The previous default Semgrep scan at run 38377880336 retained 30 alerts and 18
parser diagnostics. These alerts are static matches, not proven vulnerabilities.

## Original alert triage

| Alerts | Locations | Decision |
| --- | --- | --- |
| 3 | GitHub token, configuration and AI credential decryption | All already reject tags other than 16 bytes. Add explicit `authTagLength: 16` to preserve and harden the intended AES-GCM contract. |
| 4 | `escapeMarkup` in the public build | Audit warnings, not a demonstrated XSS defect: the original encoder covered its quoted HTML attribute context. Use a single entity encoding pass for clarity and retain injection tests. |
| 4 | `.npmrc` and `pnpm-workspace.yaml` | Upgrade pnpm to 10.26.2, then enforce a 1440-minute release delay, no trust downgrade and no exotic transitive sources. Preserve frozen lockfile installation and disabled dependency lifecycle scripts. |
| 18 | Child locations in `deploy/nginx.conf` | False positives: child cache/robots headers reset inherited headers. Explicit content-type and referrer headers restore protection. Preserve them; do not delete security headers to silence the scanner. |
| 1 | Public-build negative XSS assertion | False positive: deliberately malicious text is asserted absent from generated HTML; it is not executed. Preserve the injection regression. |

## Owned scanner contract

The Action pins the Semgrep container by digest and the Preflyt SAST v1 rules by
SHA-256. The rules are MIT-licensed Preflyt source, delivered with the immutable
Action commit; no registry rules or source code leave the scanner. Scanning has
no network access, a read-only source mount, bounded CPU/memory and no credentials
or Docker socket in the container. Strict mode and partial-report retention remain.

V1 contains 18 review-oriented checks covering JavaScript/TypeScript dynamic code
execution, disabled TLS, AES-GCM tag length, security-token randomness, credential
URLs, SQL concatenation, HTML writes and child-process shell calls; Python dynamic
execution, pickle, unsafe YAML, disabled TLS, shell execution and interpolated SQL;
and generic shell download-and-execute pipelines. It is not equivalent to the
1074-rule default registry pack, an exhaustive security audit, or interfile taint
analysis. A licensed scanner can be configured with a custom SARIF command.

Two rule-specific test-file exceptions are visible in the owned rules: canonical
origin rejection tests contain dummy URL credentials; homepage hydration tests
copy trusted locally generated SSR markup. No production files or broad test
directories are excluded. Vulnerable/safe fixtures cover every rule.

Valid source constructs that the pinned parser rejected are expressed with named
type imports, equivalent `RegExp` constructors and a JSX expression for the font
URL. Type checking, existing parser/AI feedback tests and browser tests verify the
unchanged behavior. Shell scripts are covered by the generic shell rule, not
misparsed as embedded Bash by the removed registry rules.

## Result attribution

Check mode fails for missing execution output or transport errors, but completes
after submitting genuine positive, negative or partial reports. The required
**Preflyt final gate** remains the policy enforcement point. Successful report
collection is not policy approval.

The API verifies the actual completed job and exact run/attempt/commit/policy.
Each report is independently bound by its digest and rule ID. A complete failed
report becomes Failed; a partial report remains Incomplete; an independently
verified passing report remains Passed. Manual, unapproved, stale, ambiguous,
tampered or unmatched evidence cannot become Passed. Evaluator version 3 makes
the changed failed-report semantics explicit; historical snapshots are unchanged.

An old failed collection job is not retroactively relabeled. A new Action run is
required to create independently verified reports and a current assessment.

## Local verification

The real Semgrep 1.179.0 production scan completed with zero findings and zero
parser diagnostics under the documented 18-rule scope. Every rule's positive and
safe fixture passed through the actual container. All four real scanner smoke
tests passed. The API/docs/web root build passed; focused API checks passed 149
cases, browser checks passed 55 cases, and public build checks passed 14 cases.
API and web types and changed frontend-file lint passed. The browser runner logged
a ResizeObserver warning while reporting all 55 cases passed.

Action v2.1.0 was published to Marketplace on 13 October 2026 at immutable commit
`ffd33c5e44efb2f4d69d07aea3e471505046a05f`. Hosted Action CI runs 38387939605 and
38387934749 passed. Both application workflow modes and generated snippets pin
that commit; publication preceded the companion application's push.
