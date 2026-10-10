---
id: first-assessment
title: Your first assessment
sidebar_label: First assessment
description: Profile a repository, adopt engineering standards and record your first commit assessment.
---

# Your first assessment

You will profile a repository, choose the standards that apply to it, and freeze the result at an exact commit. You need to be an **Owner or Admin** and to have [selected a repository](select-repositories.md).

## 1. Profile the repository

1. Open **Repositories** and select a repository card to open it.
2. Choose **Discover profile**.

Preflyt reads the repository's default branch through the GitHub App and records what it finds at that exact commit. Nothing in the repository is built or executed.

The **Overview** tab then shows:

- a summary of **selected checks**, **configuration hints**, **recent CI results** and **recent assessments**,
- the **Control register**, filtered by **All**, **Needs review** or **Config found**,
- the detected **Stack**, **Tooling** and the **Snapshot** (branch, commit and capture time).

Open the **evidence** button on any row to see which files support it, each linked to GitHub at that commit.

:::info Partial inspection
If Preflyt could not read some files within its limits, the header shows **Partial inspection**. Select it to see why. Controls that depend on unread files appear as **Unknown**, not as missing.
:::

Choose **Refresh profile** whenever you want to inspect the latest default-branch commit. Each profile is a separate saved snapshot.

## 2. Adopt engineering standards

1. Open the **Standards** tab.
2. Choose **Choose packs**. A side panel opens.
3. Pick an **Adoption profile**: **Default** (core requirements), **Recommended** (adds broader evidence) or **Strict** (adds resilience requirements). All of them run in **observe mode**.
4. Tick the **packs** that apply. Packs matching your detected stack are marked **Recommended**.
5. Choose **Save selection**.

The five built-in packs are Baseline Engineering, Application Security, Backend Services, Frontend Applications and Infrastructure as Code. Each is versioned, and the **Pack catalogue** lets you open any pack's rules.

Your saved selection becomes the **Control register** on the Overview. Each control is marked **Required** or **Advisory** and shows whether its configuration was found in the profile.

## 3. Create an assessment

An assessment **freezes** your standards and the evidence available for one commit, so you can compare later.

1. Open the **Assessments** tab and choose **New assessment**.
2. The **commit SHA** is filled with the profiled commit. Replace it with any full 40-character SHA that Preflyt has a profile or CI result for.
3. Optionally, for each control, choose a **CI result** from that commit to associate with it. Leave **No association** if none applies.
4. Choose **Create assessment**.

The snapshot appears in the list. Open it to see its coverage, the controls table (requirement, coverage and the associated CI result) and **Source and verification details** with digests of everything it froze.

:::caution Associations are your claim
A CI result you associate with a control is recorded as **unverified**: Preflyt cannot tell from GitHub alone that the job covered that control. A successful job never turns into a pass by itself. [Evidence and trust](../concepts/evidence-and-trust.md) explains how to get verified coverage.
:::

If your GitHub App receives pull request events, Preflyt also creates assessments automatically for the head commit of pull requests in selected repositories that have adopted standards. These are historical snapshots of that commit. They do not run code or block the pull request.

## What next

- Read [How Preflyt works](../concepts/how-preflyt-works.md) and [Status labels](../concepts/status-labels.md) to interpret what you see.
- Set up [webhooks](../self-hosting/github-app.md#3-subscribe-to-events) to collect CI results automatically.
- Invite your team from **Access Control**.
