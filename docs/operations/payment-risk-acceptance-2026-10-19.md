# Payment Risk Review acceptance — 19 October 2026

The feature acceptance criteria for issue #146 passed in local Compose. This is
acceptance of the source-review workflow and report contract, not production
qualification or a claim of complete vulnerability coverage.

## Live result

- Repository: lyrisoft/maiguard-api, main, commit `663420bb1162e8418bd61f6c171df85e2a6f3ba1`.
- Saved assessment: `a5f6dceb-13b4-433d-a42d-a9016b81080f`, `COMPLETED`.
- Profile: `payment-risk-v1`; configured model: DeepSeek Flash.
- Three source-backed findings: two LIKELY (scores 12 and 12), one POTENTIAL (score 8).
- All remain AI-reported and Needs review; none was independently confirmed.
- Recorded source inspection: 13 files, 40 read operations, two specialists.
- Model usage: 63 of 80 calls, 2,529,536 input tokens and 47,593 output tokens.
- Runner receipt confirms sandbox cleanup.

## Acceptance evidence

| Criterion | Verified result |
| --- | --- |
| Run against a repository and produce eight sections | API independently accepted and saved all eight report sections. |
| Each finding has file, function, lines, evidence, scenario, remediation and test | Checked all three normalized findings against their saved source-backed issue, reference ranges, reasoning, impact, remediation and proposed regression case. |
| Validation classification and risk score | All three have LIKELY/POTENTIAL classifications and integer likelihood × impact scores; the API calculates severity. Human Confirmed/False positive decisions require a reason, current repository permissions and an optimistic revision. |
| Six payment scenarios explicitly assessed | All six have a recorded outcome, explanation and source citations. Duplicate webhooks, status manipulation and amount manipulation are reviewed. Concurrent payouts are recorded as not applicable in the inspected source inventory. Provider timeout/retry and partial failure retain explicit follow-up gaps. |
| Readable technical and stakeholder output | The report separates executive summary, inventory, findings, risk register, conceptual scenarios, prioritized remediation, proposed tests and final risk summary. Findings link to source details and highlighted locations. |

Follow-up gaps are retained rather than converted to clean results. Application
security, sensitive-data controls and fraud/abuse coverage remain partial. The
scenarios and proposed regression tests were not executed. No PCI DSS, AML/KYC,
production-readiness or legal-compliance conclusion is established.

## Implementation audit and verification

- Added commit/assessment-bound human classifications and history, separate from
  cross-scan visibility decisions. Original reports and deterministic checks are
  unchanged; list responses carry only compact classification summaries.
- Confirmed and False positive replace the Needs review display after a saved
  human decision. Payment report reads/downloads retain the model classification
  separately from the human decision.
- Corrected the central authorization route mapping; verified current membership,
  repository/organization isolation, stale revisions and unchanged source reports.
- Corrected coordinator/specialist turn allocation and specialist warning limits;
  added bounded related-file reads, observed citation ranges and actionable report
  validation feedback. The overall configured model-call allowance is unchanged.
- Corrected the current repository card's stale child-review selection. Historical
  links retain their original result.
- 29 affected findings/payment API tests and all 51 repository-health integration
  tests passed. The final compact-payload correction also passed its focused set.
- 56 affected browser tests and 33 pinned runner tests passed. API/web type checks,
  affected frontend lint, whitespace checks and release-note preview passed.
- Applied the additive FindingReview migration locally and regenerated Prisma.
  Rebuilt and deployed API, worker and web, recreated the local runner bridges,
  and verified all ten Compose services healthy. No GitHub workflow was dispatched.

Scoped implementation commits: `ba9cc62`, `7fcaed4`, `6394867`.

## Repository results usability follow-up

- One full-width Findings table is the default working view. Assessment history
  stays separate. Removed the competing Assessment details section and tab.
- Payment Risk Review has a separate tab only when a saved payment-risk report
  exists for the selected assessment. Selecting it loads the report directly.
  General AI reviews and repositories without payment reviews do not show it.
- Security, Reliability, Maintainability, Duplication and Test coverage remain
  visible summary cards. Coverage uses verified CI evidence; missing reports
  show a dash and Coverage not received. Updating/failed/earlier-commit coverage
  states and workflow links remain available.
- Overall table counts identify the all-category scope; Security counts remain
  Security only. AI findings use a readable source label.
- Completed-review notifications now link to Findings for the exact repository
  and saved AI review. Failed reviews link to the saved failure details. Model
  configuration alerts retain their AI settings destinations.
- Browser regressions cover preserved filters, non-payment assessments,
  selection fallback, report loading/errors, both themes and 320px layout.
  All 83 affected browser cases passed across the focused suites, including
  summary alignment. Web typecheck, affected lint and Compose web build passed.
  Verified the live notification-to-findings-to-source-details flow and direct
  eight-section payment report. All ten local services remain healthy.
  No new paid scan or GitHub workflow ran for this presentation change.
