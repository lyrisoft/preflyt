---
id: contributors
title: Contributors
sidebar_label: Contributors
description: See who works on which repositories, from pull request and commit activity.
---

# Contributors

**Contributors** shows who is working on your repositories, using activity GitHub reports to Preflyt. Open **Workspace → Contributors**.

When a repository is selected, Preflyt reads a limited sample of its recent pull requests, reviews and commits from GitHub. After that, GitHub webhook events keep it current, so the App should be subscribed to **Pull request**, **Pull request review** and **Push** events. See [GitHub App](../self-hosting/github-app.md#3-subscribe-to-events). Without webhooks the page shows only that recent sample.

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
