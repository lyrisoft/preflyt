---
id: access-control
title: Access Control
sidebar_label: Access Control
description: Invite people to your workspace and choose what each person can do.
---

# Access Control

**Access Control** decides who can use your workspace and what they can do. Open **Administration → Access Control**.

It has four tabs: **People**, **GitHub members**, **Roles & permissions** and **Activity**. Only an **Owner or Admin** can manage people. Everyone else can read the roles.

## Roles

| Role | What they can do |
| --- | --- |
| **Owner** | Manage organization settings, people, repositories and policies. |
| **Admin** | Manage people, repositories and policies. Owner assignment is restricted. |
| **Policy Manager** | Create, review and publish policies. Read assessments and contributor evidence. |
| **Security Engineer** | Review security evidence, manage imported reports and read policies. |
| **Engineering Lead** | Run and review assessments, read policies and contributor evidence. |
| **Developer** | Run assessments and review results for assigned repositories. |
| **Auditor** | Read audit history, assessments, policies and contributor evidence. No changes. |
| **Viewer** | Read repositories, assessments, policies and contributor lists. No changes. |

Owners and Admins can see every repository in the workspace. **All other roles only see the repositories you assign them.**

The **Roles & permissions** tab lists exactly what each role can do.

## Give someone access

If your workspace is linked to GitHub:

1. Open **Access Control** and the **GitHub members** tab. It lists your GitHub organization's members. Use **Sync members** to refresh it.
2. Select **Assign role** next to a person, or use **Give access** and pick someone from the searchable list. People who already have access are not listed.
3. Choose a built-in **role** and the repositories they should see.
4. Save.

Preflyt checks that the person is still an active member of your GitHub organization when you save. The person then signs in with **Continue with GitHub**.

For single sign-on workspaces, use the **People** tab and **Give access** with the person's identity from your provider.

## Rules that protect you

- You **cannot edit your own access**.
- The **last active Owner** cannot be removed.
- Only an Owner can assign or change the **Owner** and **Admin** roles.
- Changes take effect on the **next request**. Removing someone's access stops them straight away.

## Review changes

The **Activity** tab lists recent access changes: who changed what, and when. For paginated platform activity with action, date and repository filters, use [Audit log](audit-log.md).

## Link an existing workspace to GitHub

If your workspace already existed before GitHub sign-in, use **GitHub members → Link GitHub organization**. It verifies the current workspace Owner and a GitHub organization owner before confirming. It keeps your repositories, policies and history. Accounts are never matched by email or username.
