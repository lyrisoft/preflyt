---
id: standards
title: Standards
sidebar_label: Standards
description: Choose, copy and create the versioned engineering standards your repositories follow.
---

# Standards

A **standard** is a versioned set of checks that your code should meet, for example "Application Security". Preflyt ships five built-in standards, and you can copy them or create your own.

Open **Standards** in the sidebar.

<figure className="pf-guide-screenshot">
  <a href="/img/guides/standards.jpg" target="_blank" rel="noreferrer">
    <img src="/img/guides/standards.jpg" alt="Built-in standards show their versions, supported checks and customization action." width="1728" height="906" loading="lazy" />
  </a>
  <figcaption>Built-in standards show their versions, supported checks and customization action. Select the image to view it full size.</figcaption>
</figure>

## Built-in standards

The five built-in standards are **Baseline Engineering**, **Application Security**, **Backend Services**, **Frontend Applications** and **Infrastructure as Code**. Each has a version, and a version never changes once published.

Select **Built-in standards** to browse them. Open one to see its checks and which are required at each requirement level.

## Create your own

1. Select **New standard**, or copy a built-in standard as a starting point.
2. Choose the checks it includes from the available checks. Use **Filter checks** to find one.
3. Optionally select **Add check** to define a custom check:
   - give it a name and a short description of what it covers and how to fix a failure,
   - choose its **Result source**: **Test report (JUnit)** or **Scan report (SARIF)**,
   - optionally set a **Workflow command**: the test or scan command to run. Leave it empty to use the built-in recipe if one exists,
   - optionally set the **Result file**: where the command writes its report, for example `reports/tests.xml`.
4. Optionally select **Add AI Review** to attach an approved skill. AI Reviews only give suggestions. See [AI reviews](ai-reviews.md).
5. Save.

Your standard appears under **Organization standards**. If a standard has no checks yet, the page says **Create a standard or copy one from Built-in standards**.

### Versions

Saved versions stay unchanged. Editing a standard creates a **new version**, and the history is kept. A policy keeps using the version it was published with until you publish a new revision of that policy, so editing a standard never changes a published policy by surprise.

## Use a standard in a workflow

Every standard card has **View YAML**. Install this policy runner once in each repository. It fetches the published branch policy on every run, so changing the checks does not require another workflow edit. Configure project commands and genuine result paths in Standards, then approve and publish a new policy revision. Built-in security recipes install their pinned scanner images automatically. See [Pull request checks](pull-request-checks.md).

## Choose standards for a repository

Each repository has its own selection:

1. Open the repository and select the **Standards** tab.
2. Choose **Choose standards**.
3. Pick a **Requirement level**:
   - **Core**: baseline requirements.
   - **Recommended**: adds broader checks.
   - **Strict**: also requires resilience checks.
4. Choose up to five standards. Those that match the repository's detected stack are marked **Recommended**.
5. Review the changes Preflyt shows, then choose **Save standards**.

Saving standards does not turn on GitHub merge protection, and existing policies keep their approved version. To enforce standards on a branch, create a [policy](policies.md).

Only an **Owner or Admin** can change a repository's standards.
