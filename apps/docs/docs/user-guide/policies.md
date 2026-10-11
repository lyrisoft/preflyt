---
id: policies
title: Policies
sidebar_label: Policies
description: Create, approve and publish a policy that says which standards a branch must meet.
---

# Policies

A **policy** says which standards a branch must meet. Once published, Preflyt evaluates every pull request into that branch against it.

Open **Policies** in the sidebar.

## Choose a scope

At the top of the page, **Policy scope** sets what you are working on:

- **Repository**: policies for one repository.
- **Team**: assign standards to every repository a [team](teams.md) covers.
- **Organization**: assign standards to every selected repository. Select **Set organization scope** to prepare it.

Below the scope are two tabs:

- **Branch policies**: the policies themselves.
- **CI jobs**: connecting your GitHub Actions workflow. See [Pull request checks](pull-request-checks.md).

## Create a branch policy

1. Choose **Branch policies**, then **New policy**.
2. Enter the **Branch name**, the branch pull requests target, such as `main`.
3. Choose the standards the branch must meet, and the **Requirement level**.
4. Optionally use **Make additional checks required** to turn optional checks into required ones.
5. Create the draft.

Organization and team requirements are included automatically. A repository policy can add to them but not weaken them.

## Approve and publish

A new policy is a **draft**. To use it:

1. **Review** the draft. You see the saved standard versions, inherited team standards and any AI Reviews, which are suggestions only.
2. **Approve** it. Approval needs a **different authorized reviewer** than the person who created it. A Super Admin can approve their own draft, and that exception is recorded in the audit history.
3. **Publish** it.

Publishing lets Preflyt evaluate pull requests against the approved policy. It saves a **non-blocking** policy: it does not activate any GitHub rule. To make GitHub enforce it, see [Merge Protection](merge-protection.md).

If the saved standards change after you create a draft, Preflyt tells you to edit the draft or create a new version before approval. Published policies are never altered. To use newer standards, create a new revision.

## After publishing

Review the check sources and create a fresh report before you ask for merge protection. Publishing does not mean every check passed: results come from your pull requests.
