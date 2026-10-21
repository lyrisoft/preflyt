---
id: notifications
title: Notifications
sidebar_label: Notifications
description: Get in-app and email alerts when results change.
---

# Notifications

Preflyt can tell you when something needs attention: a new report, a failed result, a published policy and similar events.

<figure className="pf-guide-screenshot">
  <a href="/img/guides/notifications.jpg" target="_blank" rel="noreferrer">
    <img src="/img/guides/notifications.jpg" alt="Settings → Notifications controls personal assessment alerts and shared notification channels. Email delivery is disabled in this deployment." width="1728" height="906" loading="lazy" />
  </a>
  <figcaption>Settings → Notifications controls personal assessment alerts and shared notification channels. Email delivery is disabled in this deployment. Select the image to view it full size.</figcaption>
</figure>

## The inbox

Select the **bell** at the top of any page, or open **Notifications**.

- Filter by repository, unread, severity, event type and date.
- Select **Mark all read**, or mark items one by one.
- Notifications only show repositories you can currently access. Losing access hides earlier ones.

Notifications are saved assessment updates. They do not confirm that a pull request is ready to merge.

If you see **Notifications are disabled for this deployment**, a Super Admin must turn on **Workspace notifications** in **Settings → Configuration → Notifications**.

## Who gets notified

- Owners and Admins, repository-assigned Engineering Leads, the person who created the report, and the linked GitHub author of a pull request can receive assessment alerts. Each needs access to the report.
- Owners, Admins and Policy Managers receive policy publication notices.
- Security Engineers with access also receive critical finding and native failure notices.

## Your preferences

Open **Settings → Notifications** (or use the switch in the inbox) to turn your **assessment alerts** on or off. This affects future alerts only. Muting them does not hide governance, critical finding or AI administration notices.

## Email

Email is sent only after a Super Admin sets it up, and each person opts in.

**Set up delivery (Super Admin):** in **Settings → Configuration → Notifications**, turn on **Email notifications** and enter the **SMTP host**, **SMTP port**, **Sender email**, **SMTP username** and **SMTP password**. Restart the API and worker after changing SMTP.

**Shared email channels (Owner or Admin):** in **Settings → Notifications**, select **Add email channel**.

1. Name it, for example *Engineering alerts*.
2. Enter up to **20** recipient addresses, separated by commas or new lines.
3. Save, then use **Send test** to check delivery.

A channel's recipients are separate from anyone's sign-in email and from personal preferences. If delivery fails, the page says **Email delivery is not ready** and tells you who to ask.

## Weekly repository health email

Under **Your notifications**, use **Weekly repository health email** to receive one summary per workspace each week. This preference is separate from individual assessment alerts.

1. Add and verify a delivery email above, or use your available account email.
2. Select **Send me a weekly health email**.
3. Choose up to **50** repositories you can access. **Use assigned repositories** selects your directly assigned repositories; owners and admins can choose from their wider access.
4. Choose a day, hour and timezone, such as `Africa/Lagos`, then select **Save weekly email preferences**. The default schedule is Monday at 09:00 UTC. Your first email is due at the next scheduled time after you opt in.

The email contains repository names, the assessed branch and commit, saved health states, reported finding counts by severity, and links to the reports. It uses the configured health branch, or the default branch when no health branch is configured. Source excerpts and individual finding descriptions are not emailed.

Finding changes compare the latest saved standard assessment with the last complete assessment before the weekly period. Comparisons require equivalent scanner scope and configuration. Partial scans, failed scans, changed scope and AI reviews never establish fixes. The email uses **no longer reported** rather than claiming an engineer's change has been independently verified. If no assessment ran that week, it shows **No new assessment this week** and the last known result. Missing evidence is never treated as healthy.

Emails use saved assessments and do not start new scans or paid AI reviews. Repository access, current selections, membership, email address and opt-in are checked before delivery. Repositories you can no longer access are omitted; if none remain, the email is skipped. Turn off the weekly switch and save to stop future digests. Removing your notification email also turns off weekly emails.

Delivery requires workspace notifications, email delivery, SMTP and the existing worker/Redis queue. Weekly delivery records prevent duplicate scheduling across worker restarts. Failed sends retry up to five times; emails more than seven days overdue are skipped. SMTP delivery cannot guarantee exactly-once receipt after an ambiguous network failure, even though retry message IDs remain stable.
