---
id: audit-log
title: Audit log
sidebar_label: Audit log
description: Review paginated workspace activity with date, action and repository filters.
---

# Audit log

Open **Administration → Audit log** to review recorded workspace actions. Owners, Admins and Auditors can read it within their current workspace and repository permissions.

Use the **date**, **action** and **repository** filters, then apply them. Date filters include whole UTC days; table timestamps use your local time and details also show UTC. Results are newest first, 20 per page. The table is paginated; use **Previous** and **Next** to review older records. Open an entry for readable actor, action, time and selected details. Filter state is kept in the page URL.

Credentials and raw metadata are excluded. Repository access still applies; the log is not an unrestricted view of other workspaces. Background actions may identify a system actor rather than a person.

**Access Control → Activity** remains focused on recent membership and role changes. An audit event records an action, not proof that every related check passed; open its assessment or deployment for the result.

<figure className="pf-guide-screenshot">
  <a href="/img/guides/audit-log.jpg" target="_blank" rel="noreferrer">
    <img src="/img/guides/audit-log.jpg" alt="Audit log provides repository, action and date filters, plus details for each recorded event." width="1728" height="906" loading="lazy" />
  </a>
  <figcaption>Audit log provides repository, action and date filters, plus details for each recorded event. Select the image to view it full size.</figcaption>
</figure>
