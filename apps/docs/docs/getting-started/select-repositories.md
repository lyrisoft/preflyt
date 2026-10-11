---
id: select-repositories
title: Select repositories
sidebar_label: Select repositories
description: Choose which repositories Preflyt is allowed to profile and assess.
---

# Select repositories

Installing the GitHub App makes repositories **available**. Preflyt only works with the ones you **select**. This keeps the scope explicit and auditable.

## Choose repositories

1. Open **Repositories** in the sidebar.
2. The summary tiles show **Available repositories**, **Selected for Preflyt**, **Active installations** and **Private repositories**.
3. Below, each repository is a card. Tick the checkbox in the corner of a card to **select** it. Use **Search repositories** and the selection and visibility filters to narrow a long list.
4. Selected repositories link to their own page. Select one to open it.

![The Repositories page before GitHub is connected, showing empty inventory](/img/screens/repositories.png)

Only a Preflyt **Owner or Admin** can change selection. Other roles see the inventory without the checkboxes, and attempting the change returns "Only a Preflyt Owner or Admin can change repository selection."

If the list is empty, check that:

- the GitHub App is installed on the organization and has access to those repositories,
- the Super Admin saved the App credentials and restarted the API and worker,
- you are signed in with a role that can connect repositories.

Use **Refresh repositories** to re-read the list from GitHub. The page otherwise shows the last successful sync.

If GitHub reports that the App lost access to repositories, the page tells you to reconnect the App to restore it.

## What selecting does and does not do

- **Selecting** lets Preflyt read the repository's metadata and file contents to build a [profile](first-assessment.md#1-inspect-the-repository), and lets webhook events for it be recorded. Events for repositories that are **not selected** are acknowledged and discarded.
- **Selecting does not** run any repository code, build or test.
- **Selecting does not** give other people access. Access comes from roles and repository assignment in [Access Control](../self-hosting/authentication.md).

## Next

[Your first report](first-assessment.md).

Selecting a repository automatically inspects its files to detect the stack. It does not execute code. Recommended checks are preselected when you open **Choose standards** for a repository without a saved selection; existing standards, published policies and model routing are preserved. If inspection fails, the repository stays selected and **Refresh profile** lets you retry.
