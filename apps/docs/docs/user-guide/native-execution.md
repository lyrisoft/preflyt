---
id: native-execution
title: Native execution
sidebar_label: Native execution
description: Optional checks in a separate reviewed Preflyt runtime, prerequisites and current coverage limits.
---

# Native execution

Native execution means **Preflyt schedules a check in a separate isolated runtime**, rather than your GitHub Actions runner running it. It is optional and disabled by default. Use [GitHub Actions](pull-request-checks.md) for normal onboarding; installing Preflyt does not automatically run repository code.

## Choose your execution path

| Path | Who runs the code | What you set up |
| --- | --- | --- |
| GitHub Actions | Your GitHub runner | A branch policy, the public Preflyt Action and its final gate in your workflow, plus a reachable API |
| Native execution | A separately reviewed Docker or Kubernetes execution controller | Dedicated isolated runtime, independent signed runtime review, reviewed tool images, controller credentials, preflight and execution enablement |

Native execution is implemented and fixture-tested, but **production acceptance is incomplete**: broad analyzer coverage, independently validated effective isolation and production Kubernetes acceptance remain outstanding. A passing local fixture or **Check sandbox** response does not establish these. It is not a production-ready replacement for your full CI suite.

## Images and deployment components

The normal stack needs `preflyt-api` (also used by the worker), `preflyt-api-migration` and `preflyt-web`, plus PostgreSQL and Valkey. These application images are currently private; obtain package access and registry credentials as described in [Docker Compose](../self-hosting/docker-compose.md).

Native execution additionally needs `preflyt-native-controller` and only the reviewed tools your plan uses: Node, Gitleaks, Semgrep or Trivy. The offline Trivy image bundles vulnerability data. Tool images are pinned by immutable digest and reviewed separately; do not substitute a moving tag. The controller and tool images are not required for GitHub Actions integration.

The API and worker have no Docker engine or Kubernetes scheduling credentials. The controller must target a dedicated reviewed runtime, never the application host's Docker socket. Normal Docker Compose startup does not deploy an execution controller.

## Operator setup

Native onboarding is an advanced operator task, not a single enable switch:

1. Prepare a dedicated Docker runtime or Kubernetes sandbox with supported strong isolation, denied network access, bounded resources and credential-free jobs.
2. Obtain an independent review and negative-test evidence for escape, metadata access, exfiltration, cross-repository access, resource abuse and cancellation. Install the trusted reviewer public keys and exact signed runtime approval; the review expires within 30 days.
3. Deploy the separate controller with its own signing identity, private journal/state, authenticated HTTPS endpoint and API credential. Keep the independent review signing key outside Preflyt.
4. Review each fixed tool image, configuration, version, licence, scope and expiry. Dependency scanning needs compatible offline vulnerability data no more than 24 hours old.
5. Configure the deployment's native trust settings and enable **Native runtime preflight** in **Settings → Configuration → Native execution**. Confirm the live sandbox matches its review. Enable **Native execution** only after runtime/tool review and acceptance; the controller must also have execution enabled.
6. Recreate services after environment changes; restart API and worker services after OIDC or SMTP connection changes. Saved GitHub connections refresh automatically. Re-check after runtime, image or review changes. A revoked, expired or changed review blocks requests rather than falling back to a weaker runtime.

The [operator runbook](https://github.com/lyrisoft/preflyt/blob/development/docs/operations/native-execution.md) and [runner deployment files](https://github.com/lyrisoft/preflyt/tree/development/docs/deployment/native-runner) contain the exact signed schemas, Docker/Kubernetes overrides and credential contracts. These source links require access to the private Preflyt repository. Arrange that access with Lyrisoft before attempting native setup; this page is not a complete standalone production installer.

## Use it in Preflyt

1. Select and inspect the repository, and save its standards. Native requests use the **recorded commit and selection**, not an arbitrary branch tip.
2. Open **Assessments → Commit assessments → Execution environment** and choose **Check sandbox**. This checks setup, not the repository's engineering checks.
3. Open **View check plan**. Review the commit, supported checks, tool review and unavailable adapters.
4. With repository **execution.run** permission, select supported checks and choose **Request checks**. Read any blocked reason before retrying.
5. Follow the paginated **Check requests** history. **Cancel request** requests cancellation; wait for cleanup confirmation. A request being queued or completed is not a policy pass.
6. Open the saved assessment to see verified results and coverage. Native evidence does not automatically activate GitHub protection or waive missing CI requirements.

## Current adapters and limits

| Check | Fixed adapter | Coverage |
| --- | --- | --- |
| Secret scanning | Gitleaks directory scan | Reviewed full-rule evidence can be accepted |
| Tests | Node built-in test runner | Partial; does not run arbitrary project scripts or install dependencies |
| SAST | Semgrep with image-owned local rules | Partial |
| Lint | Narrow image-owned Semgrep lint rules | Partial; not the project's full lint configuration |
| Dependency vulnerabilities | Trivy with reviewed offline data | Partial |
| Infrastructure policy | Offline Trivy Terraform/Kubernetes checks | Partial |

Build, type checking, coverage, container-image scanning and exposure adapters are not available in the native controller. Supported adapters use fixed commands; repository or AI-supplied commands are not accepted. Jobs have no dependency-download egress, a five-minute deadline and bounded resources/reports. Kubernetes source bundles over 512 KiB remain incomplete.

Verified failures can fail required checks. **Clean partial coverage stays incomplete**, so keep verified CI evidence for full project checks. Existing CI evidence stays available when native execution is disabled, blocked or unavailable.

## Disable or recover

Disable execution to stop admission of new requests. Preserve journals and wait for cancellation/cleanup reconciliation before stopping an active controller. Disable preflight and remove the dedicated controller when it is no longer needed. This does not remove your assessments or change GitHub branch protections.
