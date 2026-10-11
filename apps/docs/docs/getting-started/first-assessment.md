---
id: first-assessment
title: Your first report
sidebar_label: First report
description: Create your first repository report, then review its checks, standards and evidence.
---

# Your first report

A **report** (an assessment of one commit) shows which checks your repository meets, which fail and which still lack results. You need to be an **Owner or Admin** and to have [selected a repository](select-repositories.md).

## The quick way: Create first report

1. Open **Overview**.
2. Under **Get your first repository report**, choose a repository with **Select a repository**.
3. Choose **Create first report**.

Preflyt then does three things, showing progress as it goes:

1. **Inspects the repository** if it has not been inspected yet: languages, frameworks and existing CI configuration.
2. **Saves the recommended standards** for the detected stack, unless you have already chosen your own.
3. **Creates the report** for the inspected commit.

When it finishes you see "Your first report is ready". Missing check results stay visible as missing. Merge blocking and AI source-sharing settings stay as they were.

## The step-by-step way

Use this when you want to choose the standards yourself first.

### 1. Inspect the repository

1. Open **Repositories** and open a selected repository.
2. Choose **Discover profile**.

Preflyt reads the default branch through the GitHub App and records what it finds at that commit. Nothing is built or run.

The **Overview** tab then shows:

- a summary of **Selected checks**, **Configuration hints**, **Recent CI results** and **Recent assessments**,
- **Repository checks**, filtered by **All**, **Needs review** or **Files found**,
- the detected **Stack**, **Tooling** and **Snapshot** (branch, commit and capture time).

**Related files found** means a supported file exists for that check, for example a workflow that mentions a scanner. It is information, not a pass: whether the check actually ran is shown in the report. Open the **evidence** button on a row to see the files, linked to GitHub at that commit.

:::info Partial inspection
If Preflyt could not read some files, the header shows **Partial inspection**. Select it to see why. Checks that depend on unread files show **Unknown**, not missing.
:::

Choose **Refresh profile** to inspect the latest commit again.

### 2. Choose standards

1. Open the **Standards** tab and choose **Choose standards**.
2. Pick a **Requirement level**: **Core** (baseline requirements), **Recommended** (adds broader checks) or **Strict** (also requires resilience checks).
3. Choose up to five standards. Standards that match the detected stack are marked **Recommended**.
4. Review the changes Preflyt shows, then choose **Save standards**.

Saving standards does not turn on GitHub merge protection, and existing branch policies keep their approved version until you publish a new revision.

### 3. Create the report

1. Open the **Assessments** tab and choose **New assessment**.
2. The commit is filled with the inspected commit. You can enter another full 40-character SHA that Preflyt has a profile or CI result for.
3. Under **CI result per control**, leave **Use the approved CI source if available** unless you need to link a specific result by hand.
4. Choose **Create assessment**.

:::caution Manual links are your claim
A CI result you link by hand is recorded as unverified. It never turns into a pass on its own. See [Evidence and trust](../concepts/evidence-and-trust.md).
:::

## Reading the report

Open a row in **Saved assessments** to see the report:

- The **Merge review result** at the top: **Required checks passed**, **Required checks failed**, **Required results incomplete** or **Optional checks need attention**.
- A **Next step** telling you what to do.
- Failed and incomplete required checks first. Passing and optional checks are available through the filter.
- **Source and verification details** for the digests of everything the report saved.

Reports are historical: each one describes a single commit. If your GitHub App receives pull request events, Preflyt also creates reports automatically for pull request commits in repositories with saved standards.

## What next

- Read [How Preflyt works](../concepts/how-preflyt-works.md) and [Status labels](../concepts/status-labels.md).
- Set up [webhooks](../self-hosting/github-app.md#3-subscribe-to-events) to collect CI results automatically.
- Invite your team from **Access Control**.
