---
id: how-preflyt-works
title: How Preflyt works
sidebar_label: How Preflyt works
description: How Preflyt connects repository health, approved engineering standards and verified CI evidence to traceable readiness results.
---

# How Preflyt works

Problems found in QA or production cost more than problems found while you design, code or review. Preflyt helps you catch them **earlier**, at your repository and your pull requests, by answering three questions at an exact commit:

1. **Which engineering checks apply** to this repository?
2. **What evidence** exists for each of them, and can you trust it?
3. **Is it ready** to progress, or where are the gaps?

Preflyt is an **Engineering Assurance & Readiness Platform**. It connects repository health, approved requirements and verified evidence from tests and scanners. Your configured GitHub Actions integration provides continuous PR feedback; repository scanner execution depends on a qualified runtime. AI helps investigate and explain findings, while deterministic checks and approved policies own readiness evaluation. GitHub applies any explicitly configured merge restrictions.

Preflyt works with your CI and scanning tools. It does not replace GitHub Actions, established testing frameworks or comprehensive scanner products. Built-in scanners have explicit coverage limits; existing tools can supply supported reports through configured policy commands.

## Health before CI

Selecting a repository queues a branch Health assessment at a fixed commit. Reviewed scanners can produce located findings without a workflow or saved standards. Without an approved runtime, the report is explicitly inspection-only and partial. Health findings do not satisfy CI policy gates. See [Repository health](../user-guide/repository-health.md).

## The CI workflow

Health and CI answer complementary questions. **Health** describes the codebase at a selected branch revision, including supported findings, completeness and freshness. **CI assessments** establish whether submitted checks meet the requirements for a change. Both feed the same Findings workspace.

```mermaid
flowchart LR
  R[Selected repository] --> H[Branch Health assessment]
  R --> C[CI reports and policy assessment]
  H --> F[Unified Findings]
  C --> F
  F --> S[Assessed-commit source]
  S --> G[AI or analyzer guidance]
```

In Findings, filter by source, type, repository, severity or status. Open an issue to inspect its evidence and saved source excerpt. Configured AI produces a short problem, likely effect and suggested fix, saved for later visits; analyzer/rule guidance is the fallback. AI explanations are advisory. The original evidence remains available alongside them.

```mermaid
flowchart LR
  D[Discover<br/>profile the repository] --> A[Assess<br/>freeze standards + evidence]
  A --> V[Validate<br/>verify evidence sources]
  V --> E[Enforce<br/>quality gates]
  E --> I[Improve<br/>learn from gaps]
```

| Step | What Preflyt does | Status |
| --- | --- | --- |
| **Discover** | Profiles each selected repository with file evidence. | Available |
| **Assess** | Freezes your standards and reported CI results at a commit. | Available |
| **Validate** | Verifies where evidence came from, through authenticated submissions and verified GitHub execution, or reviewed native execution receipts. | Available, see [Evidence and trust](evidence-and-trust.md) |
| **Enforce** | Shows a merge review result for every report. A published policy publishes a **Preflyt / Engineering Readiness** check on each pull request. **Merge Protection** can require it through GitHub rulesets. | Observe by default; enforcement is opt-in |
| **Improve** | Trends, contributor activity and advisory AI review. | Available |

## The three engines

- **Validation**: discovers repository context, coordinates approved Health analysis and normalises CI evidence.
- **Governance**: holds your standards, requirements and quality gates.
- **Intelligence**: explains findings using assessed code and supports optional PR reviews. **AI never decides a gate result.**

## What "observe mode" means

In the default install, Preflyt **reads** and **records**:

- It reads repository files and metadata through a read-only GitHub App.
- It records CI results GitHub reports for exact commits.
- It does **not** run your tests or scanners itself. **Your own GitHub Actions workflow** runs them, and Preflyt verifies the completed run. Native execution inside Preflyt is off until you deploy its separate, reviewed controller.
- It does **not** block merges by default. Blocking needs three explicit steps: publish a policy, turn on PR checks, and require the **Preflyt / Engineering Readiness** check in GitHub. See [Pull request checks](../user-guide/pull-request-checks.md) and [Merge Protection](../user-guide/merge-protection.md).

A **Related files found** result means a supported file or workflow reference exists at that commit. It does **not** prove the tool ran or passed.

## Core objects

| Object | Meaning |
| --- | --- |
| **Workspace** | Your organization's space in Preflyt, linked to a GitHub organization or identity provider. |
| **Repository** | A GitHub repository you have explicitly selected. |
| **Profile** | What Preflyt found in a repository at one commit. |
| **Standard** | A versioned set of engineering checks, such as Application Security. |
| **Health report** | Immutable branch analysis, supported findings, completeness and freshness; separate from CI readiness. |
| **Report** (CI assessment) | A saved snapshot of selected standards and evidence at one commit, with a merge review result. |
| **CI result** | A check or workflow outcome GitHub reported for a commit. |
| **Finding** | An issue surfaced from evidence, with its own lifecycle. |
