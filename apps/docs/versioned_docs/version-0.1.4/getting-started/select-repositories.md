---
id: select-repositories
title: Select repositories
sidebar_label: Select repositories
description: Choose explicit repository scope and start a background Health assessment.
---

# Select repositories

The admin connection flow imports and enables the repositories selected during GitHub App installation. You do not need to select them again in Preflyt. Later selection controls refine that scope; older installations retain their existing explicit selections. Existing installations are not automatically rescanned during upgrade.

## Choose repositories

1. Open **Repositories**. The Health summary shows reports across repositories you can access.
2. Find the **Repository inventory** below the GitHub connection information. Search by repository, account or branch, and use the selection and visibility filters.
3. Repositories imported by the admin connection flow are already selected. An Owner or Admin can deselect them or enable additional available repositories later. Manually enabling a repository queues its initial Health assessment.
4. Open a repository's Health page. If no assessment exists yet, choose **Reassess**. To use another branch, choose **Assessment branch**, then **Reassess**.

Connection imports repository access; it does not wait for scans or run repository code. Manually selecting or reassessing queues work in the background. The built-in scanner runs applicable static analyzers in isolated containers. No additional repository or runtime approval is required. If source access or the scanner service is unavailable, Health shows a failure reason and what to do next; missing analysis is never shown as a clean scan.

## What selection changes

- Preflyt can inspect the selected repository and record GitHub events within your installation's access scope.
- The initial Health report uses fixed static analysis defaults. It does not execute project scripts, run tests, install dependencies or build images.
- Existing standards, published policies, AI routing and merge protection remain as configured.
- Selection does not grant other users access. Roles and repository assignments still control visibility and actions.
- Deselecting prevents new source retrieval and execution. In-flight work is stopped through the runtime's cleanup process.

## Missing repositories or lost access

Use **Refresh inventory** to synchronize available repositories. Check that the GitHub App is installed on the intended organization and has access to those repositories. A Super Admin configures App credentials in Settings; manifest registration saves them automatically without a routine restart. If GitHub reports lost access, reconnect the App or restore its selected repository access.

[Follow your first report](first-assessment.md).
