---
id: evidence-and-trust
title: Evidence and trust
sidebar_label: Evidence and trust
description: How Preflyt separates configuration, reported CI results and verified evidence, and why a green job is not a pass.
---

# Evidence and trust

Preflyt is careful about what a piece of evidence **actually proves**. This page explains the levels, because they decide how to read every status in the app.

## Three kinds of evidence

| Kind | Where it comes from | What it proves |
| --- | --- | --- |
| **Configuration** | Files in the repository at an exact commit | That a supported setup exists, for example a workflow that mentions a scanner. **Not** that it ran. |
| **Reported CI result** | A signed GitHub webhook for a check or workflow run | That GitHub reported this outcome for this commit. **Not** which rule it covered or which tool ran. |
| **Verified evidence** | An Action submission authenticated by GitHub OIDC, bound to report digests and verified GitHub workflow/job execution, or a verified native execution receipt | That the configured checks produced usable evidence for the exact commit and policy. Report coverage and freshness still matter. |

## Why a green job is not a pass

A job named "test" that succeeded does not tell Preflyt that your required tests ran. So:

- Preflyt **never** turns a provider success into a pass on its own.
- If you associate a CI result with a control by hand, it is stored as **unverified** and labelled **Source not verified**.
- A policy with **no required checks** is **not evaluated**, never an empty pass.
- Missing mandatory evidence is **incomplete**.

For the normal Action flow, Preflyt verifies the repository, workflow, run attempt, PR head commit and completed jobs through GitHub, and binds the submitted report digests to that execution. The first verified run registers the workflow connection. Additional report signatures are optional; private repositories do not need a separate signer. Follow [Pull request checks](../user-guide/pull-request-checks.md).

## Freshness and conflicts

Preflyt keeps results honest over time:

- A result with a missing timestamp does not inherit "just now".
- **Expired** and **future-dated** results never appear fresh.
- A newer result for the same source marks the older one as **superseded** (**Newer result available**).
- Two conflicting results with the same or unknown time are **ambiguous** (**Multiple matching results**).
- A snapshot is **historical**. It says nothing about the current state of a branch.

## Pipeline reports

The Action submits bounded JUnit and SARIF reports from your workflow automatically. Preflyt stores summaries and checksums, not uploaded report bytes, CI logs or credentials. There is no manual report-import workflow in the UI. Older unverified records can remain in history; they do not become verified by being displayed in an assessment.

## AI and advisory reviews

AI review is optional, per organization and **advisory**. It can explain or flag, but it never decides a quality gate result. The app keeps AI output separate from observed evidence.

## Native execution

Running scanners inside Preflyt is a separate, **disabled-by-default** capability. It needs its own controller, a signed independent isolation review, and reviewed tool images. Generated test fixtures do not establish production acceptance. Production acceptance is incomplete. Use GitHub Actions for normal onboarding; see [Native execution](../user-guide/native-execution.md) for the implemented controls, current coverage and operator prerequisites.
