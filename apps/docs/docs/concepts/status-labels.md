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
| Grey | Unknown, not run, inactive or not available |

Green is never used for something that is unknown or unassessed.

## Control configuration

Shown on the Overview controls table.

| Label | Meaning |
| --- | --- |
| Configuration found | A supported file or workflow reference exists at the profiled commit. It does not prove the tool ran. |
| Not found | No supported configuration was found. This is not a policy failure. |
| Unknown | Preflyt could not tell, for example because files were unreadable or the check is not implemented. |

## Assessment coverage

Shown per control inside an assessment.

| Label | Meaning |
| --- | --- |
| Configuration found | Configuration observed at that exact commit. |
| Not found | Nothing associated or observed. |
| Source not verified | A CI result is associated but its source is not verified. |
| Pending | The associated CI result had not finished. |
| Skipped | The associated job was not run. |
| Result expired | The result was too old at the time of collection. |
| Report date is in the future | The result's timestamp is later than expected, so it is not trusted as fresh. |
| Newer result available | A later result for the same source replaced it. |
| Multiple matching results | Conflicting results with the same or unknown time. |
| Not available | The check adapter does not exist yet, so an association cannot enable it. |

An assessment's overall coverage is **Incomplete** when mandatory evidence is missing, or **Not evaluated** when no required checks exist.

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

## Quality gate preview

The Quality Gates page is an **observe-only** preview built on assessment snapshots. Outcomes are deterministic, and they come only from the frozen snapshot:

- **PASS**: a requirement is met by observed evidence. For configuration requirements this confirms configuration only.
- **BLOCK**: a required, verified check failed at that commit.
- **INCOMPLETE**: evidence is missing, stale, unverified or collection was truncated.
- **Not evaluated**: no required checks exist.

Execution evidence that Preflyt cannot verify stays **Incomplete**.
