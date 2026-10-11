---
id: status-labels
title: Status labels
sidebar_label: Status labels
description: What each status label in Preflyt means, and how colour is used.
---

# Status labels

Every status in Preflyt has a **text label** as well as a colour, so meaning never depends on colour alone.

## Colours

| Colour | Meaning |
| --- | --- |
| Green | Success, healthy or completed |
| Red | Failure or error |
| Amber | Needs attention, pending or stale |
| Blue | Information or in progress |
| Grey | Not run, inactive or not available |

Green marks a confirmed positive state. **Related files found** is green because configuration was found; it does not mean a check executed or passed. **Unknown** is amber and still needs attention.

## Repository checks

Shown on the repository **Overview**. Filter the list with **All**, **Needs review** or **Files found**.

| Label | Meaning |
| --- | --- |
| Related files found | A supported file or workflow reference exists at the inspected commit. Shown in green for configuration found; it is not an execution pass. |
| Not found | No supported configuration was found. This is not a policy failure. |
| Unknown | Preflyt could not tell, for example because files were unreadable or the check is not implemented. |

## Check coverage in a report

Shown per check inside a report.

| Label | Meaning |
| --- | --- |
| Related files found | Supporting files were observed at that exact commit. |
| Not found | Nothing associated or observed. |
| Source not verified | A CI result is associated but its source is not verified. |
| Pending | The associated CI result had not finished. |
| Skipped | The associated job was not run. |
| Result expired | The result was too old at the time of collection. |
| Report date is in the future | The result's timestamp is later than expected, so it is not trusted as fresh. |
| Newer result available | A later result for the same source replaced it. |
| Multiple matching results | Conflicting results with the same or unknown time. |
| Not available | The check adapter does not exist yet, so an association cannot enable it. |

Each check in a report also has a result: **Passed**, **Failed**, **Incomplete** or **Not evaluated**.

## CI results

| Label | Meaning |
| --- | --- |
| Succeeded | GitHub reported success. This does not equal a Preflyt pass. |
| Failed | GitHub reported failure. |
| Pending | Still running or queued. |
| Not run | The job was skipped or did not execute. |
| Unknown | GitHub did not report a conclusion. |

## Webhook deliveries

| Label | Meaning |
| --- | --- |
| Recorded | The delivery was verified and stored. |
| Waiting to process | Stored, and the worker has not processed it yet. |
| Not processed | Repository access changed before the worker processed it. |
| Processing failed | The worker gave up after repeated attempts. See [Troubleshooting](../self-hosting/troubleshooting.md). |

## Merge review result

Every report leads with one merge review result. It comes only from the saved report, so it is repeatable. It is Preflyt's view; whether GitHub allows a merge is decided by GitHub.

| Result | Meaning |
| --- | --- |
| Required checks passed | Every check is met by observed evidence. For configuration checks this confirms configuration only. |
| Optional checks need attention | Every required check passes, but an optional check does not. |
| Required checks failed | A required check has a failed result from an approved, verified CI source at that commit. |
| Required results incomplete | Required evidence is missing, stale or unverified, collection was truncated, or the policy has no required checks. |

Results that Preflyt cannot verify stay incomplete. They never become a pass.
