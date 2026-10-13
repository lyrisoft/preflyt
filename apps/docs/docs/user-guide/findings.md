---
id: findings
title: Findings
sidebar_label: Findings
description: See and triage issues reported by your checks across all repositories.
---

# Findings

**Findings** collects issues from **CI** and **repository Health assessments**, across every repository you can assess. Open it from **Workspace → Findings**.

## What is listed

Findings come from saved reports. Each one belongs to a repository and an **exact commit**:

- **Reported issues**: CI check failures, issues inside attached JUnit and SARIF reports, and retained analyzer findings from saved Health reports.
- **Missing or unverified results**: checks that have no usable result yet.

Passing CI reports do not create reported issues. Review their results and assessed commit under **Repositories → Checks** or **Assessments**. Security findings appear under **CI** only when the workflow submits a scanner report; repository Health findings appear under **Repository health**. Missing-result counts can include older assessed commits, even when the latest CI run passed.

Open the finding title or **Details** to navigate to its own page. Each page has a stable link to the saved finding and assessment. **Back to findings** restores the list filters and page.

Each source uses its **latest saved report for each commit**. A Health metric card opens Findings filtered to that exact saved Health report. Choose another source or repository to leave that saved-report scope. Findings from older commits stay visible but are not labelled "open" or "resolved" for the current branch.

## Find what matters

Use the filters at the top:

- **Source**: All sources, CI or Repository health,
- **Finding type**: Security, Reliability, Maintainability, Duplication, Security hotspots, Test coverage, Test failures or Failed checks,
- **All repositories** to narrow to one repository,
- the severity chart: select a severity to filter by it,
- **All issue statuses** to filter by status,
- **Search findings** to search by text.

Each result shows its type and source. The summary and charts use all matching results before pagination, with the same source, type, repository, severity, status and text filters.

## Read the affected code

The details page places **Affected code** beside repository context and review controls. The read-only code editor preserves indentation and highlights syntax for supported languages. It shows numbered source lines fetched from the **exact assessed commit**, with the reported line or block highlighted. **Open on GitHub** links to that revision and location.

SARIF findings can supply a line range. JUnit failures can supply explicit file/line attributes or a Python/pytest traceback location. Preflyt extracts only unambiguous repository-relative locations, then verifies the file and line range against the assessed commit before displaying code. Traceback-derived locations identify the failed test, which may differ from the underlying application defect. Existing finding links and review history remain stable; raw failure logs are not displayed. A file without line coordinates shows an excerpt without highlighting. Failed-check summaries and evidence gaps may have no source location; the page explains this and retains the assessment evidence. Invalid coordinates, unavailable files or revoked access do not produce invented code. Source excerpts are bounded, sensitive context lines are redacted, and secret findings hide their code entirely.

Verified, redacted excerpts are saved in Preflyt separately from the original assessment. New assessments queue capture in the background. Existing findings without a saved excerpt fetch and save it on first open; subsequent visits read the saved excerpt without fetching the file from GitHub. Repository access is checked on every visit. Source capture failures remain retryable and do not change the assessment result.

The source file is verified separately from the report. A highlighted location does not independently prove that the reported defect exists. The page keeps **Report source verification** visible.

## Triage a finding

For CI findings, open a finding to see its details, then set:

- **Status**: **Reported**, **In review** or **Resolved**,
- **Assignee**: who is looking at it,
- **Resolution or review note**: explain the review or how it was resolved.

Choose **Save changes**. Health findings retain their saved analyzer outcome and exact source location. Generic CI triage does not alter Health findings; optional hotspot review is available on hotspot details.

:::note Triage does not change results
Your changes apply to that finding at that commit. The report's evidence and the merge review result stay exactly as they were saved. Marking something resolved here does not make a failed check pass.
:::

## What to know

- Pipeline reports arrive through the Action. Older manually imported or unverified evidence is not independent proof that a tool ran.
- A suppression written in the source report does not waive a policy.
- Credential-looking text in report messages is left out.
- For large report collections, result limits appear in the list footer. Narrow the repository or source filter to review more results.
- If the list is empty, create a report from a repository first. Configure [pull request checks](pull-request-checks.md) or create a CI assessment from the repository’s Assessments tab. Health analyzer findings appear in this same list; open [Health reports](repository-health.md) for the recorded analysis scope and completeness. Inspection-only reports do not create findings, and missing coverage does not create an invented code issue.


### Rule explanations

Hover over highlighted code to see a **Problem** and **Suggested solution** tooltip. You can also tap the line or focus it with Tab and press Enter/Space. Escape dismisses the tooltip. It uses the same saved guidance as the inline panel, and stays within the screen in either theme. Source loading uses a code-shaped skeleton with reduced-motion support.

**Problem and solution** sits inside the affected-code card, directly below the excerpt. It is expanded by default; click its heading or use Enter/Space to collapse and reopen it. When an approved AI provider and source-sharing route are configured, Preflyt asks it for a short problem, likely effect and suggested fix based on the finding and redacted code from the exact assessed commit. The result is saved for that finding, commit and AI configuration, so later visits reuse it. It is labeled **AI guidance** and remains a suggestion alongside the original analyzer evidence. A reported test location may establish only which assertion failed; AI guidance should say when the application cause is not visible in the excerpt.

Until AI guidance is saved, and whenever AI is unavailable or not configured, the current Preflyt rule or analyzer guidance appears. New test failures and older saved ones use the same layout. If a test report supplies no specific fix, the panel offers general troubleshooting steps and explains that the root cause has not been established. New Health reports save Preflyt guidance for its packaged rules. Imported CI SARIF reports can supply their own plain-text rule descriptions and help; this is labeled analyzer-provided advice, with the report's original verification state preserved. Text is bounded and credential-like content is omitted. HTML and Markdown are not rendered, and external help links are not fetched. Unknown rules without supplied text show an explicit unavailable explanation. Guidance does not change the saved assessment or merge result.
