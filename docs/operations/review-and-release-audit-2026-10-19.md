# Review and release delivery audit — 19 October 2026

## Scope

- Beta labeling for source-only AI security reviews.
- General and Payment Risk Review selection, including a combined scan using one source snapshot and shared issue IDs.
- Structured payment reports, source-backed findings and on-demand report access.
- Automatic PR scheduling bound to PR head commits instead of model configuration.
- Reviewed change files, release-note planning/publication checks, in-app presentation and configuration-reference documentation.

## Findings and corrections

Payment report cache identity did not include the active user and organization. The report now receives the existing workspace scope, uses it in its query key, periodically revalidates and hides cached data after an access error. Regression coverage checks user-scope changes and denied refreshes. This hardens client-side isolation in addition to the existing server repository authorization checks.

The working branch originally predated the published release's merge commit. Delivery preserves the beta-label change and is based on current main, so the release generator can validate the published baseline. New change files describe Payment Risk Review and the PR scheduling correction rather than omitting them from generated notes. All delivery commits carry DCO sign-offs.

No blocking findings remain in the inspected changes after these corrections. This is a code and regression review, not independent penetration testing or production certification.

## Verification

- 149 API tests passed across review configuration/admission/publication, verified dispatch, PR feedback, pipeline wake-up, Strix lifecycle, report validation and workflow contracts.
- 85 affected browser tests passed across repository health, review options, payment report access and release-note presentation. The cache correction was followed by 62 focused browser tests, including the new isolation regression; overlapping runs are not counted twice.
- 30 pinned Python runner tests passed.
- 59 Node release/deployment tests passed on macOS. Two GNU-tar-dependent scanner packaging tests failed on macOS and passed in the existing Linux image: 61 unique Node tests verified across the appropriate environments.
- API and web type checks, affected frontend lint, whitespace checks and the 53-variable configuration-reference check passed.
- Release-note preview generated from the published v0.1.10 baseline without publishing a release or starting a workflow.
- Changed and new files were scanned for common credential patterns; no matches were found.
- Local Compose validation confirmed all ten services healthy. After the PR scheduling fix, the deployed worker polled unchanged acceptance PRs #5 and #7 without increasing their review or publication counts.

## Remaining qualification

Payment Risk Review remains beta and source-only. No new live model acceptance run was started for the new payment profile. Its eight report sections and six scenario records can contain explicit coverage gaps; they do not establish executed exploits, passing regression tests, compliance certification or independently confirmed vulnerabilities. Issue #146 remains open pending agreed live acceptance and any remaining classification/verification requirements.

Publication workflows remain manual-only. Creating and merging the delivery PRs does not dispatch them. Initial repository selection continues to start standard health assessment without automatically opting into AI review.
