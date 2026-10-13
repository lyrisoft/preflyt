# Public Preflyt Action

The Action source is maintained only in [lyrisoft/preflyt-action](https://github.com/lyrisoft/preflyt-action)
and distributed through [GitHub Marketplace](https://github.com/marketplace/actions/preflyt-policy-check).
Version v2.1.0 pins commit ffd33c5e44efb2f4d69d07aea3e471505046a05f. MIT applies to the public Action only;
the Preflyt application remains separately licensed. No runtime copy is bundled
with the application or API Docker image.

Generated snippets contain check and terminal gate jobs in one PR workflow.
The gate depends on all check jobs, waits for GitHub job verification, configured
AI review and PR publication, and fails for missing/failed execution or publication.
No workflow_run workflow or default-branch setup is needed. Documentation stays
separate. A setup PR changes the reviewed workflow on the selected branch and
removes that branch's old preflyt-gate.yml if present. Custom commands, genuine
reports and optional signatures remain supported; AI findings remain advisory.

## v2.0.0 policy runner

Published to GitHub Marketplace on 12 October 2026 after hosted unit and real scanner CI passed (run 38313820497). The API exports execution version 1 from the approved immutable policy. The workflow has no explicit checks/report mappings; remove the former `checks` input when upgrading. New checks apply after publishing a new branch-policy revision.

Built-in Semgrep, Gitleaks and Trivy recipes provision reviewed images, with read-only source, no OIDC/GitHub credentials or Docker socket, and bounded actual SARIF. Project dependencies remain in the workflow; custom commands and reports are configured in Standards. Missing execution remains incomplete. Both check and gate jobs use the same immutable Action pin.

Local validation passed for clean/failing/missing-command policies, unsafe paths, credential stripping, genuine scanner output and the actual API manifest executed in the separate Action checkout. Release tag v2.0.0 and existing tags remain immutable. The Action source PR is [#1](https://github.com/lyrisoft/preflyt-action/pull/1); publication does not merge it into the default branch. Marketplace currently renders the default-branch README, so that description updates when the reviewed source change reaches main.

## v2.0.1 scanner evidence correction

The patch compacts valid SARIF even when a scanner reports partial execution. It retains findings, used rule metadata and diagnostics, marks unsuccessful execution, and keeps that control incomplete. It also adds actionable CI summary details for missing commands, failed commands and unavailable reports. Hosted Action unit and pinned-scanner jobs passed at the release commit.

A real Preflyt SAST reproduction retained 30 findings and 18 diagnostics in a 52,362-byte report; incomplete analysis remains blocked. The consumer build passes `DATABASE_URL` through only the Turbo build/typecheck tasks. Secret-scanner exceptions retain built-in detectors and match only reviewed synthetic values in exact fixture/example paths; a different token-shaped value in the same fixture still produces a finding.

The secret-scanner exception also covers compiled copies of the required password placeholder in the docs download, JavaScript assets and search index, including its exact normalized index token. The compiled-docs scan passed with zero findings; different synthetic credentials in the native fixture and compiled download both remained detectable. Development policy v5 adopts standard v1.0.5 with the tested frontend JUnit command and preserves all five required controls plus advisory AI review.

## v2.1.0 owned SAST and independent results

Published to Marketplace on 13 October 2026 after hosted Action CI passed at the
release commit (runs 38387939605 and 38387934749). Built-in SAST now runs the
18 MIT-licensed Preflyt SAST v1 rules offline through pinned Semgrep 1.179.0.
The rules have a checked SHA-256 digest and real vulnerable/safe fixtures. This
is explicit pattern coverage, not the full registry pack or exhaustive analysis.

Check mode completes after genuine reports are submitted; it does not approve
the policy. The required Preflyt final gate remains the enforcement point.
Verified reports preserve independent pass/fail/incomplete results, including
after the terminal gate fails. Newer attempts, cancellation, invalid reports,
missing execution and failed collection remain unverified or incomplete.
Old failed collection jobs are not retroactively changed; run the new Action.

The companion fixes triage all 30 original alerts, enforce supported pnpm
supply-chain settings and remove the parser incompatibilities without excluding
production files. Local production scanning completed with zero findings and
zero diagnostics under the owned rules. See
[the acceptance record](../acceptance/2026-10-13-sast-and-check-attribution.md)
for exact scope, exceptions, tests and attribution behavior.

## Release procedure

1. Develop and test only in the public Action repository; do not copy private app source or history.
2. Run Python tests and the public repository CI before publishing an immutable version tag.
3. Publish the version through the GitHub Marketplace release editor. Never move a released tag.
4. Update pipeline-action.ts and product workflow pins to that published commit. Update the bundled
   workflow editing skill and increment its version when instructions change.
5. Test check/gate modes in one PR workflow with automatic results and the configured AI model.

## v1.0.0 live verification

Published on 2026-10-11 after authorized organization agreement acceptance. The release commit and tag are unchanged. On `lyrisoft/preflyt-p2-acceptance`, clean PR #7 ran the public Action successfully (run 38141976443, attempt 2), automatically published a passing policy check and PR summary, and received automatic AI PR feedback. Its public publication gate passed (run 38143100157) without checking out repository code.

Defect PR #5 failed actual tests and security checks through the public Action (run 38142617949, attempt 2). Preflyt automatically published 0 passed, 2 failed, 0 incomplete; public gate 38143236876 failed as required. Setup-only PR #9 migrated the default-branch gate; existing repository and inherited organization protections were verified active after the approved temporary test ruleset disable and restoration. Test PRs #5 and #7 remain unmerged.

The live test uses the authorized local ngrok API connection. This verifies the integration against the local deployment, not a permanent production deployment.
