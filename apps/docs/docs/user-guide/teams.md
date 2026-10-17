---
id: teams
title: Teams
sidebar_label: Teams
description: Group people and repositories and apply the same standards across them.
---

# Teams

A **team** groups people and the repositories they own, so you can apply the same [standards](standards.md) to all of them at once. Open **Administration → Teams**.

Teams organize people and requirements. They **never grant access** to Preflyt or GitHub.

<figure className="pf-guide-screenshot">
  <a href="/img/guides/teams.jpg" target="_blank" rel="noreferrer">
    <img src="/img/guides/teams.jpg" alt="The initial Teams view offers GitHub import and local team creation." width="1728" height="906" loading="lazy" />
  </a>
  <figcaption>The initial Teams view offers GitHub import and local team creation. Select the image to view it full size.</figcaption>
</figure>

## Create a team

You can:

- select **Create team** and choose existing workspace members, or
- select **Import from GitHub** to bring in teams from your connected GitHub organization. After **List teams**, choose an individual team or **Import all teams**. Import all covers every page, regardless of the name filter, and skips teams already imported. Keep the dialog open while it runs; progress and individual failures remain visible. Retrying imports only the remaining teams. Imports are read-only and start with no repositories in scope. The App needs **Members: Read-only** for this.

Each team has tabs: **Overview**, **Members**, **Repositories**, **Standards & policies**, **Effective impact** and **Activity**.

## Choose which repositories a team covers

In the team's **Repositories** tab, review the repositories and **explicitly approve** the ones whose policies the team may set. Only repositories you are allowed to manage and that are selected in Preflyt are offered.

A team can include **child teams**. Select **Preview scope** to see the exact list of repositories that would be added, then **Approve scope**. This records the approval. It does not give anyone access, change an existing policy or activate any GitHub rule.

## Apply standards to a team

1. Open **Policies** and choose **Team** as the policy scope, then pick the team. You can also use the team's **Standards & policies** tab.
2. Choose the exact standard versions, a requirement level and the branch.
3. **Preview** the checks added to each repository, and any conflicts.
4. Apply the preview. This creates a standards selection and a policy draft for each repository.
5. Review each draft, then **approve and publish** it in [Policies](policies.md). A different authorized reviewer must approve.

If anything changes while you are previewing, preview again before applying.

**Effective impact** shows each repository's policy status. A published policy does not mean every check passed.

## Organization-wide requirements

Use **Organization-wide requirements** (the **Organization baseline**) to apply one shared set of standards to every selected repository. A repository cannot weaken or bypass a baseline. A new repository needs explicit approval and re-applying before it is covered.

## Upgrade a team's standards

In **Standards & policies**, choose **Upgrade** next to an active assignment, pick the new versions, preview and apply. The old assignment is kept for history and new drafts are created. Already published policies are never changed until you publish a new revision.

## Limits

500 teams per organization. 100 members and 100 repositories per team. 100 assignments per team. At most five standards combined.

You cannot remove a repository from a team while the team has an active standards assignment covering it.
