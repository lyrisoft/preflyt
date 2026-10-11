---
id: findings
title: Findings
sidebar_label: Findings
description: See and triage issues reported by your checks across all repositories.
---

# Findings

**Findings** collects the problems your checks reported, across every repository you can see. Open it from **Workspace → Findings**.

## What is listed

Findings come from saved reports. Each one belongs to a repository and an **exact commit**:

- **Reported issues**: failed checks, plus issues found inside the JUnit and SARIF reports attached to a report.
- **Missing or unverified results**: checks that have no usable result yet.

Each item links to the report it came from.

The list is built from the **latest report for each commit**. Findings from older commits stay visible but are not labelled "open" or "resolved" for the current branch.

## Find what matters

Use the filters at the top:

- **All repositories** to narrow to one repository,
- the severity chart: select a severity to filter by it,
- **All issue statuses** to filter by status,
- **Search findings** to search by text.

The summary shows reported issues, affected repositories, critical and high issues, and evidence gaps.

## Triage a finding

Open a finding to see its details, then set:

- **Status**: **Reported**, **In review** or **Resolved**,
- **Assignee**: who is looking at it,
- **Resolution or review note**: explain the review or how it was resolved.

Choose **Save changes**.

:::note Triage does not change results
Your changes apply to that finding at that commit. The report's evidence and the merge review result stay exactly as they were saved. Marking something resolved here does not make a failed check pass.
:::

## What to know

- Pipeline reports arrive through the Action. Older manually imported or unverified evidence is not independent proof that a tool ran.
- A suppression written in the source report does not waive a policy.
- Credential-looking text in report messages is left out.
- If a very large number of reports exist, you see a **partial results** notice. Narrow the repository filter to see more.
- If the list is empty, create a report from a repository first. See [Your first report](../getting-started/first-assessment.md).
