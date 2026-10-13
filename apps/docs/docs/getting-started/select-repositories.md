---
id: select-repositories
title: Select repositories
sidebar_label: Select repositories
description: Choose explicit repository scope and start a background Health assessment.
---

# Select repositories

Installing the GitHub App makes repositories **available**. Selecting a repository in Preflyt enables tracking and queues its initial **Health assessment**. Existing installations are not automatically rescanned during upgrade.

## Choose repositories

1. Open **Repositories**. The Health summary shows reports across repositories you can access.
2. Find the **Repository inventory** below the GitHub connection information. Search by repository, account or branch, and use the selection and visibility filters.
3. An Owner or Admin can select the repository using its selection control. The queue confirmation links the next step to **Health**.
4. Open the repository to see its default-branch assessment. To use another branch, choose **Assessment branch**, then **Reassess**.

Selecting queues work in the background. It does not wait for a scan in your browser. Qualified analyzers run only in the approved isolated runtime; if unavailable, the report clearly identifies inspection-only results and missing analysis.

## What selection changes

- Preflyt can inspect the selected repository and record GitHub events within your installation's access scope.
- The initial Health report uses fixed static analysis defaults. It does not execute project scripts, run tests, install dependencies or build images.
- Existing standards, published policies, AI routing and merge protection remain as configured.
- Selection does not grant other users access. Roles and repository assignments still control visibility and actions.
- Deselecting prevents new source retrieval and execution. In-flight work is stopped through the runtime's cleanup process.

## Missing repositories or lost access

Use **Refresh inventory** to synchronize available repositories. Check that the GitHub App is installed on the intended organization and has access to those repositories. A Super Admin configures App credentials in Settings; manifest registration saves them automatically without a routine restart. If GitHub reports lost access, reconnect the App or restore its selected repository access.

[Follow your first report](first-assessment.md).
