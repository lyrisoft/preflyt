---
id: contributors
title: Contributors
sidebar_label: Contributors
description: See who works on which repositories, from pull request and commit activity.
---

# Contributors

**Contributors** shows who is working on your repositories, using activity GitHub reports to Preflyt. Open **Workspace → Contributors**.

When a repository is selected, Preflyt automatically queues a background sync of its recent pull requests, reviews and commits from GitHub. You do not need to click Import or keep this page open. The worker must be running; the documented Compose deployment includes it.

After that, GitHub webhook events keep it current, so the App should be subscribed to **Pull request**, **Pull request review** and **Push** events. See [GitHub App](../self-hosting/github-app.md#3-subscribe-to-events). Without webhooks the page shows only that recent sample.

## Sync progress

The page shows how many repositories have finished syncing, the latest successful sync time, and any repositories waiting to retry. Results appear as repositories complete. Empty metrics show a dash while data is still loading or a sync has failed.

GitHub rate limits and temporary failures retry automatically. Jobs survive worker restarts, and deselected or unavailable repositories are not imported. After repeated failures, an administrator can check the GitHub connection and use **Sync now** to try again.

**Sync now** queues another background sync for repositories you can manage, with a five-minute cooldown. Users without repository management permission can use **Refresh** to reload saved results. Changing a filter reads saved activity; it does not import more history.

Each history sync reads at most 30 recent pull requests, 30 reviews for each of the first 10 pull requests, and 30 recent commits. The page indicates when this limit was reached. This is a recent sample, not a complete historical import; webhooks record subsequent activity.

<figure className="pf-guide-screenshot">
  <a href="/img/guides/contributors.jpg" target="_blank" rel="noreferrer">
    <img src="/img/guides/contributors.jpg" alt="Contributors before activity has been imported, with period, repository and identity filters." width="1728" height="906" loading="lazy" />
  </a>
  <figcaption>Contributors before activity has been imported, with period, repository and identity filters. Select the image to view it full size.</figcaption>
</figure>

## Filter

The filters, which are saved in the page address so you can share a link:

- **Repository**, or all of them,
- **Period**: 7, 30, 90 or 180 days,
- **Kind**: human, bot or unknown,
- **Relationship**: pull request author, reviewer, commit author, committer or merge actor,
- **Search** by GitHub login.

## The directory

The list shows each contributor with their repositories, pull requests, merges, reviews and commits, and when they were last seen. Select a contributor to open their page.

## A contributor's page

It has six tabs: **Overview**, **Repositories**, **Pull requests**, **Reviews**, **Policy evidence** and **Activity**. Each pull request and commit links to GitHub, and **Policy evidence** links to the reports for those commits.

A report linked to a commit records that a report exists. It does **not** mean the commit passed.

## What is stored

Preflyt keeps only minimal records: stable GitHub user IDs, the commit, pull request numbers and timestamps. It does **not** keep commit messages, review text, email addresses or raw webhook bodies.

## Who can see it

Viewers can browse the directory but cannot open detailed contributor activity or policy evidence. Other roles see the repositories they have access to.

Use the **Help** button on the page for definitions and counting rules.


**Commits linked to contributor** includes recorded commit-author and committer participation. A commit counts once per repository, including when the same contributor has both roles or an event is delivered again. The contribution chart uses the same definition as this metric. The underlying Activity tab retains the original relationship, so committer participation does not imply authorship. Directory sparklines show recorded participation across the selected relationship filters.
