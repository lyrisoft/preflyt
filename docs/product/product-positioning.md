# Preflyt product positioning

Updated on 16 October 2026 for the approved Community Edition direction. This is the identity and copy guide; it does not add capabilities, clear release blockers or authorize publication.

## Identity

- Category: **Engineering Assurance & Readiness Platform**.
- Public descriptor now: **Engineering assurance for GitHub.**
- Public descriptor after release clearance: **Open-source engineering assurance for GitHub.**
- Tagline: **Engineering confidence before production.**
- Website headline: **Know what passed. See what needs attention.**
- Website explanation: **Bring repository health, engineering standards and verified CI results into one workspace. Understand the evidence behind every assessment.**

Lead with the engineering question, then explain the product category. The headline describes what users can inspect; it does not promise passing results, complete coverage or production safety.

## Community and Cloud

Community Edition is free to self-host under **Apache-2.0** for original Preflyt code and documentation. It includes the complete core workflow, without an artificial repository cap, subscription or license key. Capacity depends on the operator's infrastructure. Third-party licenses remain intact; the separate Preflyt Action stays MIT-licensed. Contributions use DCO sign-off, not copyright assignment.

Keep Health, standards/policies, verified CI evidence, findings/history, basic merge protection, access controls and audit history in Community. Optional AI uses the operator's provider; no paid model is required for core checks. Do not introduce a feature paywall by rewriting the positioning.

The Community Edition pricing label is **Open source**, with **No software license fee · Apache-2.0** beneath it. Explain that infrastructure and optional provider costs remain the operator's responsibility. Preserve the current public-release access notice.

Managed Cloud is a **planned** paid service for following through from findings to reviewed fixes across teams and tools. Managed hosting is the foundation; its stronger differentiation is connected remediation:

- One-click managed Slack, Microsoft Teams and email notification connections, plus Jira and Linear issue creation and status sync. An authorized administrator still grants provider access and chooses destinations.
- Agentic AI investigation, proposed fixes and draft pull requests with explicit human approval and fresh assessment evidence.
- Owner routing, reminders, escalations and cross-repository remediation campaigns, keeping ticket status separate from verified resolution.
- Portfolio reporting and scheduled evidence packs, with original assessment links and explicit coverage gaps.
- Managed AI and isolated scanner capacity, upgrades, monitoring, recoverable backups, team usage/spending controls, guided onboarding and priority support.

**Repository context is Cloud-only:** planned searchable code indexing, embeddings and retrieval of related functions/tests/contracts outside the PR diff (issue #97 / P4.RI). Describe it as “Repository-aware AI reviews” and mark it coming soon. Keep this future implementation outside the Apache-licensed Community codebase. Community retains existing profile metadata, Health/source evidence and optional BYOK diff-based AI reviews.

Existing Community AI configuration/budgets, core governance, access controls, email and audit history remain included. Cloud sells managed operations and coordinated automation; do not claim basic security, existing integrations or AI configuration are Cloud-only. AI cannot waive checks or authorize a merge. The pricing page may describe this planned scope with “Coming soon” and “Pricing at launch”; do not invent prices, a trial, an SLA, signup or cloud availability before the offer exists. Future Enterprise scope needs an explicit product decision and customer evidence.

### Calls to action and release state

- Before public clearance: **Community install guide** links to the existing quick start, with a visible note that source and images currently require access. **View on GitHub** is secondary and does not imply anonymous repository access.
- After public clearance: primary **Install Community Edition**, secondary **View on GitHub**. Remove access caveats only after anonymous source/image access and the documented install path are verified.
- Keep **Sign in / Open workspace** separate from deployment. These actions open the current installation, not a managed Cloud account.
- Community links point to contribution instructions, issues and security reporting. Add Discussions only after it is enabled and a maintainer is assigned. Do not invent a community size, star count, response-time promise or customer logo.

## Voice and page structure

Use concrete verbs: connect, inspect, assess, verify, review, investigate. Explain the result before the mechanism. Prefer “See which checks ran against this commit” to “unified intelligence,” “enterprise-grade assurance,” or “AI-powered compliance.” Use the familiar technical anchors GitHub, GitHub Actions, JUnit and SARIF only where supported. Preflyt engineering standards are not an industry interoperability standard; do not borrow OpenTelemetry positioning literally.

The homepage should answer these questions in order:

1. What does Preflyt help me understand? Outcome-led headline and a working product preview.
2. What can I inspect? Health, findings and the evidence behind an assessment, with product visuals linked to capability explanations.
3. How do I get a useful result? Install Compose → create the admin → connect/install the App and select repositories in GitHub → imported repositories receive Health assessments. Add standards, policies and CI afterward.
4. What do I operate and pay for? Community scope, Apache-2.0, optional BYOK AI, current access requirements and planned managed Cloud.
5. How can I participate? Specific contribution opportunities and the DCO guide.

Keep the existing Preflyt visual identity and responsive app previews. Product fixtures demonstrate workflow, not customer adoption. Use consistent real-app captures for guides; redact private data and refresh captures when the corresponding flow changes. No fabricated testimonials, compliance certifications or benchmark claims.

## Outcomes and differentiation

1. Identify engineering risks early through supported repository health analysis and findings investigation.
2. Verify code changes against approved engineering requirements with versioned policies and current CI evidence.
3. Give engineering leaders traceable readiness evidence across their repositories.

Connect repository health, engineering requirements, evidence verification and readiness results across the development workflow. Work with GitHub Actions, testing frameworks and scanner products rather than claiming to replace them. Built-in scanner coverage is explicit and limited; existing tools can supply supported reports through configured policy commands. AI enhances investigation, explanations and recommendations. Deterministic checks and approved policies own evaluation.

## Initial customer focus

Prioritize engineering organizations of roughly 10–100 developers in fintech, payments, lending, insurance technology and regulated software. They often need to connect existing GitHub Actions testing/scanning tools with governance and traceable engineering decisions. This is a customer targeting hypothesis to validate, not a claim of proven adoption.

Intended buyers: CTO, VP of Engineering, Head of Platform or Head of Infrastructure. Daily users: engineering managers, developers, DevOps/platform engineers and security engineers.

## Claim boundaries

- Verified means evidence is checked for its actual scope, commit, workflow attempt and policy revision. It does not imply that every result passed. Missing or untrusted required evidence remains incomplete.
- Continuous PR feedback requires the configured CI integration. The documented Compose installation includes the isolated Health scanner. Reports retain their measured scope and original commit; unsupported or omitted analysis remains visible. General native command execution is separate and requires its own reviewed runtime. Do not imply continuous full scanning of every connected repository.
- Readiness reports inform decisions. GitHub applies merge restrictions when explicitly configured; Preflyt does not certify production safety or regulatory compliance.
- AI is advisory. It cannot waive a required check, turn missing evidence into a pass or authorize a merge.
- Self-hosting gives operators control over deployment and repository access. Optional external AI providers still receive the source explicitly permitted by the configured review.

Keep scope, missing evidence and execution limits visible on capability pages and in documentation. Preserve the distinction between repository health, CI readiness and GitHub merge permission.

## Reference and adaptation

Reviewed [SigNoz's website](https://signoz.io/) and [repository](https://github.com/SigNoz/signoz) on 16 October 2026. Adopt the communication pattern: a clear user outcome, a recognizable technical foundation, product evidence, deployment choice and accessible contribution paths. Preflyt's foundation is GitHub and verified engineering evidence. Preserve Preflyt's copy, visuals and Apache-2.0 decision; do not copy SigNoz's assets, commercial claims, pricing or separate enterprise licensing model.
