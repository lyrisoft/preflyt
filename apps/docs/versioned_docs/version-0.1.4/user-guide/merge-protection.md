---
id: merge-protection
title: Merge Protection
sidebar_label: Merge Protection
description: Make GitHub require the Preflyt check before a pull request can merge.
---

# Merge Protection

A [pull request check](pull-request-checks.md) shows a result. **Merge Protection** is what makes GitHub **require** it, so a failing or incomplete pull request cannot merge.

GitHub is always the one that blocks the merge. Preflyt publishes the result and helps you create the GitHub rule.

Open **Merge Protection** in the sidebar and choose a repository. It has two tabs: **Branch rules** and **PR checks**.

<figure className="pf-guide-screenshot">
  <a href="/img/guides/merge-protection.jpg" target="_blank" rel="noreferrer">
    <img src="/img/guides/merge-protection.jpg" alt="Merge Protection shows the repository scope and rulesets fetched from GitHub." width="1728" height="906" loading="lazy" />
  </a>
  <figcaption>Merge Protection shows the repository scope and rulesets fetched from GitHub. Select the image to view it full size.</figcaption>
</figure>

## PR checks

The **PR checks** tab lists the latest check for each pull request: its target branch, whether it was published to GitHub, the current verified Preflyt result and when it last changed. Select a row to open the report, or **View on GitHub**.

A result that is unknown or still pending is never shown with an old passing result.

If publishing is off you see a message pointing you to **Settings → PR feedback**.

## Require the check in GitHub

You have two options.

### Option 1: set the rule yourself in GitHub

In your repository's **Settings → Rules** (or branch protection), require the status check **Preflyt / Engineering Readiness** on the branch. GitHub only offers a check by name after it has appeared on at least one pull request, so open one first.

Also require your own CI checks as you normally do.

### Option 2: let Preflyt manage the ruleset

Under **Branch rules**, use the three tabs **GitHub rulesets**, **Drafts** and **Deployments**.

1. **GitHub rulesets** lists the rulesets GitHub already has for the repository, read-only.
2. **Drafts → New draft** creates a draft ruleset:
   - choose the **Target branches** from GitHub,
   - choose a **Protection profile**: **Standard** (one approval, a pull request, and protection from force pushes and branch deletion), **Strict** (two approvals, code owner review, approval after the latest push, resolved conversations and up-to-date checks), or **Custom protections**,
   - review the generated configuration, which includes the required **Preflyt / Engineering Readiness** check.

   Saving a draft **does not change GitHub**.
3. **Deployments → Review activation** shows the exact GitHub changes and the open pull requests that would be affected. A reviewer approves it, then **Activate on GitHub** applies it. Preflyt verifies the result.
4. **Roll back** sets the managed ruleset to **disabled** and verifies the result. It does not delete it. Other GitHub protections stay in effect.

:::warning Activation blocks pull requests
Once active, pull requests without a passing Preflyt check are blocked. Review the affected pull requests before you activate.
:::

Activation needs these, all off or unavailable by default:

- **Ruleset activation** turned on in **Settings → Configuration → Governance** by a Super Admin.
- The selected GitHub App must have **Organization administration: Read and write**, approved on its installation. The primary App is used by default; a separate governance App is optional and needs the same permission.
- A current **automatically published passing PR check targeting each branch being protected** must exist, bound to the current policy. A manually created assessment or a passing check for a different branch is not enough.
- A **different authorized administrator** must approve. A Super Admin who proposed it may approve their own, and that is recorded in the audit history.

Use **Refresh** in **GitHub rulesets** to fetch the current inventory after an external change or deletion; the fetched timestamp tells you when the list was last read. Managed deployments also check for drift. If someone changes their protections in GitHub, Preflyt shows the differences and **does not overwrite them**. Resolve drift before rollback. Preflyt does not offer deletion of arbitrary GitHub rulesets; manage those in GitHub.

## Recommended order

1. Publish a [policy](policies.md) and get your [pull request checks](pull-request-checks.md) passing on a test branch.
2. Open a few real pull requests and confirm the results are right.
3. Then require the check, starting with one repository.

## Limits

- Pull requests from forks and merge queues are not supported.
- Ruleset management applies to one repository at a time.
