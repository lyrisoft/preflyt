# AI review findings and shared review experience

AI PR issues now appear in the default Findings list alongside CI and repository Health findings. Source filters retain the ability to focus on one source. AI findings preserve their original assessment, reviewed timestamp, PR number and assessed commit. They use the existing finding details, redacted source editor, inline problem/solution and audited human triage controls.

New inference requires evidence-bound severity and a concrete potential impact. Historical unrated results show a dash. Severity remains advisory. Findings counts and charts include advisory findings, but neither triage nor AI severity changes deterministic check outcomes or readiness. The shared palette uses dark red for Critical, lighter red for High and green for Low.

The assessment AI tab displays a compact suggestion table, review count and date. Details links open the same finding pages. New-review controls and technical metadata are collapsed when a saved review exists. Related history appears only for the same PR number and complete head/base revision, and links to the original assessment.

## Local acceptance

- Focused API regressions cover snapshot/assessment integrity, exact evidence references, tenant/repository boundaries, revoked access, related PR revisions, triage, deduplication, severity/impact validation, safe PR comments, commit-bound source and left-side diff redaction.
- Browser regressions cover the unified Findings table, shared details route/code guidance, original-assessment links, collapsed controls, retained source-sharing choice, numeric URL filters and the shared severity palette.
- API and web type checks pass; changed frontend files pass ESLint. Full database integration and production builds were not rerun for this change.
- Authenticated local browser verification shows five real PR #101 suggestions on commit `c7a3f90c4e4c`, including their original review date. The newer assessment `cmv70qz1u0039u66n7o6itcm3` displays the related review and direct Details links.
- Inline problem/solution was verified on `pipeline-processing.service.ts:472` at the original assessed commit.
- Unified Findings was verified at desktop and 390px phone width. Long chart labels were contained to remove page overflow; phone document width equals viewport width.

Local screenshot evidence:

- `/tmp/preflyt-unified-findings.png`
- `/tmp/preflyt-ai-review-simple.png`
- `/tmp/preflyt-ai-finding-details.png`

No GitHub Actions run, push, PR update, or merge was initiated for this work. The user requested local audit and commit only.
