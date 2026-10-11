# Public Preflyt Action

The Action source is maintained only in [lyrisoft/preflyt-action](https://github.com/lyrisoft/preflyt-action)
and distributed through [GitHub Marketplace](https://github.com/marketplace/actions/preflyt-policy-check).
Version v1.1.0 pins commit 49019a3e7febf942b937628bc831818e4a1b295f. MIT applies to the public Action only;
the Preflyt application remains separately licensed. No runtime copy is bundled
with the application or API Docker image.

Generated snippets contain check and terminal gate jobs in one PR workflow.
The gate depends on all check jobs, waits for GitHub job verification, configured
AI review and PR publication, and fails for missing/failed execution or publication.
No workflow_run workflow or default-branch setup is needed. Documentation stays
separate. A setup PR changes the reviewed workflow on the selected branch and
removes that branch's old preflyt-gate.yml if present. Custom commands, genuine
reports and optional signatures remain supported; AI findings remain advisory.

## Release procedure

1. Develop and test only in the public Action repository; do not copy private app source or history.
2. Run Python tests and the public repository CI before publishing an immutable version tag.
3. Update pipeline-action.ts and product workflow pins to that commit. Update the bundled
   workflow editing skill and increment its version when instructions change.
4. Test check/gate modes in one PR workflow with automatic results and the configured AI model.
5. Publish the version through the GitHub Marketplace release editor. Never move a released tag.

## v1.0.0 live verification

Published on 2026-10-11 after authorized organization agreement acceptance. The release commit and tag are unchanged. On `lyrisoft/preflyt-p2-acceptance`, clean PR #7 ran the public Action successfully (run 38141976443, attempt 2), automatically published a passing policy check and PR summary, and received automatic AI PR feedback. Its public publication gate passed (run 38143100157) without checking out repository code.

Defect PR #5 failed actual tests and security checks through the public Action (run 38142617949, attempt 2). Preflyt automatically published 0 passed, 2 failed, 0 incomplete; public gate 38143236876 failed as required. Setup-only PR #9 migrated the default-branch gate; existing repository and inherited organization protections were verified active after the approved temporary test ruleset disable and restoration. Test PRs #5 and #7 remain unmerged.

The live test uses the authorized local ngrok API connection. This verifies the integration against the local deployment, not a permanent production deployment.
