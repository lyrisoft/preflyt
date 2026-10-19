# Payment Risk Review v1

Payment Risk Review is an opt-in, source-only profile of the existing beta AI security review. In a repository, open **Assessment options**, check **Payment Risk Review** (and **General security review** when wanted), then **Reassess**. The choice also applies to **Run security** when offered in the security report. It uses the connected security-review model, the existing request/token limits, and the same authorized source snapshot as standard checks. Selecting the profile does not start a scan by itself.

Production installs use the same `ai-security` Compose profile and versioned Strix runner/sandbox images as General Security Review; no separate payment runner is required. See [production setup](strix-production-compose.md).

## Saved report

The versioned `payment-risk-v1` contract requires:

1. Executive summary.
2. Source-backed system inventory and architecture relationships.
3. Findings linked to shared Findings, with service/function, evidence, attack scenario, risk matrix and source analysis.
4. Seven-area payment risk register plus eight-domain scope records.
5. All six conceptual attack scenarios, each with a recorded outcome.
6. Immediate, 7-day, 30-day and long-term remediation actions.
7. One proposed regression case for every saved issue.
8. Final summary and up to ten priority issues, ordered by calculated score.

Every domain, register area and scenario must be explicitly reviewed, need follow-up, or be not applicable with a reason. Reviewed and not-applicable records require citations to actual source reads. Unreviewed areas may have no citations, but must remain explicit follow-up gaps. Recording a scenario does not mean it was executed.

Likelihood and impact are each integers from 1 to 5. Preflyt calculates their product: 20–25 critical, 12–19 high, 6–11 medium, 1–5 low. These remain advisory assessments, not measured financial losses. Imported issue severity follows that matrix; AI findings do not change deterministic checks or merge decisions.

## Architecture and evidence boundaries

The request DTO accepts `reviewProfile: general | payment-risk-v1 | general-and-payment-risk-v1`. The assessment plan pins the profile for both standalone and combined reviews; request-key reuse with another profile is rejected. Payment selection requires a runner advertising the profile. Standard assessment remains available when the optional model/runner is unavailable.

Selecting both uses one coordinated AI job, the same source snapshot and a shared source-issue ledger; it does not queue a second AI scan. Identical source concerns are reused by ID, and the importer retains one finding per fingerprint. Different concerns at the same location remain separate. The combined review includes broad application security as well as payment-specific analysis.

The runner exposes a coordinator-only structured report tool, validates all required sections and IDs, and checks each reference against machine-observed specialist reads. Payment specialists use `report_source_issue`, ensuring every report issue has complete source analysis. The coordinator cannot finish until its report accounts for the current saved issues. No new execution, shell, network or source-modification permission is granted.

The runner returns the bounded JSON with its existing authenticated, revision-bound receipt. The API independently validates structure, source paths/ranges, issue references and scores, then replaces model issue IDs with stable Findings fingerprints. It stores the report in the existing assessment JSON; no schema migration is needed. Full report bodies are removed from health summaries. `GET /github/repositories/:repositoryId/health/:id/payment-risk-report` checks current repository read access before and after reading the scoped record. The UI fetches this body only when the report is opened and offers a JSON download containing the assessment, branch, commit and report.

## Classification and qualification

Source-generated issues may be LIKELY or POTENTIAL and remain **Needs review**. A source model cannot self-assign CONFIRMED. Counterevidence and contradicted hypotheses belong in scope records and finding counterevidence; they are not promoted to active Findings as false positives. Independent confirmation/disposition remains a separate review activity. Potential compliance gaps are observations, not PCI DSS or AML/KYC compliance determinations.

A structurally complete report can still have limited security coverage. It remains PARTIAL advisory evidence. Missing/invalid structured output fails the payment review rather than reporting success. Previously saved general reviews are unchanged and are not retroactively relabeled as payment reports.

## Acceptance evidence

Automated coverage includes report shape/scoring, missing scenarios/sections, invented IDs and paths, unread-source rejection, finish-scan gating, late issue detection, profile request isolation, repository access, compact summaries, saved report/finding linkage and on-demand UI loading/error recovery. Fixtures are synthetic and tests do not call an external model.

A saved paid-model acceptance run is recorded in [the 19 October acceptance evidence](payment-risk-acceptance-2026-10-19.md). Production packaging checks do not replace provider-specific or deployment-specific qualification. Live exploitation, regulatory certification and automatic independent confirmation are outside this source-only profile. Issue closure must follow its agreed acceptance evidence, not container health alone.

## Human validation

Open a finding and use **Finding review** to record **Potential**, **Likely**,
**Confirmed**, or **False positive**, with evidence and reasoning. Confirmed means
an independent reviewer verified the issue; it is not awarded by the model.
False positive means the reviewer ruled the issue out. The decision and its
history apply only to that assessment and commit. Findings shows the decision
alongside the workflow status. Payment report reads/downloads include the latest
human decision and retain `modelClassification` separately. Saved assessment JSON
is not edited, and no gate or PR readiness decision is changed.

**Hide or reopen matching findings** is a separate, optional visibility action.
It can suppress matching future occurrences; classification alone never hides a
finding. Missing check results and missing evidence cannot be classified as
vulnerabilities. Writes require current repository permission to manage findings,
a reason, and an expected revision to prevent overwriting a concurrent review.
