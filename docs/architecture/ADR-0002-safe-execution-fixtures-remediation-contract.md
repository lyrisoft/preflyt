# ADR-0002: MVP safe execution and verified remediation

**Status:** Accepted product design; implementation pending  
**Date:** 2026-10-08  
**Related:** [Product requirements](../PRD.md), [ADR-0001](ADR-0001-typescript-first-stack.md)

## Decisions

1. **MVP may execute code only in an approved isolation environment.** Safe execution is a prerequisite for scanner/test/build jobs, not deferred to V1. If no approved executor exists, Preflyt only ingests external CI findings.
2. **PoC repository writes are fixture-only.** End-to-end proof of concept may create remediation PRs solely in administrator-designated, disposable fixture repositories. General MVP remains read-only.
3. **Remediation validation has a versioned, immutable evidence contract** with exact source commit, environment, commands, a protected original reproduction harness, patch SHA-256 and required check outcomes.
4. **Unmerged source PRs are fixed into their own feature branch**, not silently into main. Fix PRs are created as drafts, checked again after creation, and reconciled when source state changes; historical validation must never be presented as current validation after a target change.

## 1. MVP isolation and execution policy

| Execution class | Trust and use | Permission |
| --- | --- | --- |
| INGEST_ONLY | Any connected repository without an approved executor | Consume externally generated CI logs, checks and scanner artifacts; do not run repository code |
| FIXTURE_SANDBOX | Allowlisted disposable PoC fixtures on an approved test host | Limited local Docker evaluation; **never** real untrusted/customer repositories |
| APPROVED_REPOSITORY_SANDBOX | Real connected repositories (MVP scan/test/reproduction) | Independently validated stronger isolation; e.g. dedicated Kubernetes workers with gVisor/Kata or an equivalent assessed sandbox |
| REMEDIATION_SANDBOX | V1 patch and independent validation | All approved repository controls plus editable-path restrictions and Git-writer authorization |

Required before **every** sandboxed scanner, test, install, build or agent-command task:

- No privileged mode, host PID/network namespaces, hostPath mounts, host Docker socket, host devices or broad Kubernetes permissions.
- Non-root and no privilege escalation; drop capabilities, apply supported seccomp/AppArmor/SELinux, use read-only root filesystem with bounded scratch/workspace.
- CPU, memory, process, storage and deadline quotas; termination and cleanup must work on cancellation/restart.
- Default-deny outbound networking including metadata endpoints, cluster APIs, private network and other organizations. Dependencies may be fetched only through an approved auditable egress proxy with narrowly scoped destinations; never unrestricted network access.
- No production/platform secrets, model API keys, repository write credentials or cloud IAM credentials in untrusted jobs; a brokered checkout/artifact pathway must prevent their disclosure.
- Immutable image digest, pinned source SHA, dependency lock digests, approved toolchain versions and redacted/nonsecret environment configuration.
- Controller verifies effective runtime class, admission/security policy, worker placement, isolation, egress, and quotas before scheduling; requested YAML alone is not evidence.
- Escape, metadata service, network exfiltration, cross-repository access and resource-abuse security tests must pass before class approval.

**Important:** Containerization alone is not an adequate adversarial security boundary. Kubernetes without stronger isolation and tested enforcement does not qualify either. The first real-repository scan/test job is gated on this security baseline in **MVP**.

If the approved executor is unavailable or preflight fails, mark the step BLOCKED_EXECUTION_ENVIRONMENT, preserve imported CI evidence, and return an evidence-only or inconclusive investigation. **No silent fallback** to the NestJS API host, a worker shell, or unsafe Docker.

**V1 adds:** edit-capable ephemeral jobs, repro-and-validation pipelines, patch limits, restricted Git writes, scaled sandbox orchestration and further hardening. It does **not** introduce the first mandatory isolation barrier.

## 2. PoC fixture-only write boundary

The PoC is a restricted technical experiment, **not a customer-facing MVP remediation feature**:

- Maintain a signed administrator-managed allowlist of **stable provider repository IDs**, not repository-name patterns or LLM instructions.
- Use a **separate GitHub App installation/write identity** provisioned exclusively on designated disposable fixture repositories (ideally a throwaway organization). General repo integrations remain read-only.
- Enforce the allowlist at workflow admission and **again** in the Git writer using provider repository ID, source PR and target refs; enforce allowlisted scope in the GitHub App's own permissions.
- PoC may reproduce, patch and create human-reviewed PRs **within these fixtures only**. It may not merge, approve, alter protections, deploy or write to arbitrary repositories.
- Real or historical non-fixture failures may be investigated read-only, using external CI evidence or an approved repository sandbox; the PoC must not push patches, branches, PRs, or comments to those repositories.
- Fixture-local Docker must pass its own controls but is **not** promoted to the approved real-repository executor.
- Hide PoC write controls from ordinary MVP onboarding; label fixture PRs as evaluations and audit all write attempts.

**Hard acceptance test:** A non-fixture repository must reject branch/PR/comment/push operations even if the request is tampered with, an event is replayed or source code contains prompt injection. Until V1, non-fixture outcomes are findings or downloadable patch suggestions, not automated SCM writes.

## 3. Immutable reproduction and validation evidence contract

Each investigation/remediation attempt receives a versioned, append-only evidence record. It must capture:

| Group | Mandatory fields |
| --- | --- |
| Identity | Contract version, organization ID, stable provider repository ID, investigation/attempt IDs and originating CI run/check |
| Source and target | Exact source commit SHA, source branch/ref, original PR number and base (when relevant), remediation PR target branch, base HEAD SHA at start and before writing |
| Environment | Execution class, effective runtime and image **digest**, OS/architecture, versions of tooling, lockfile/check configuration hashes, network policy ID, nonsecret environment-variable names |
| Commands | Actual argv, working directory, timeouts, step ordering, timestamps, exit codes, stdout/stderr hashes and artifact refs; redacted nonsecret parameters |
| Baseline | Original reproduction command, expected signature, exact observed failure evidence and certainty/repeatability status; trusted harness artifact ID/SHA-256, file/configuration/input manifest and hashes, runner/selection arguments, expected test discovery and skip rules |
| Patch | Canonical binary Git diff bytes SHA-256, original Git tree SHA, patched tree SHA, changed-file manifest and patch-application result |
| Validation | Separate sandbox job IDs, patched checkout SHA/tree, equivalent pinned environment, results and artifacts for each required check |
| Policy | Required-check set and applicability/version **frozen before patching**, approvals/exceptions, final decision |
| Freshness | Pinned source PR head, integration base/merge SHAs where applicable, remediation target HEAD, pre/post-creation observations and timestamps, current/changed/unavailable source PR state, freshness status, last successful reconciliation and cleanup outcome |
| Audit | Agent/model metadata, spending and resource limits, Git writer authorization, PR URL and complete timestamps |

Do not store passwords, source tokens, API keys, or unredacted secrets in the record.

### Version 1 contract example (illustrative only)

~~~json
{
  "contract_version": "1.0",
  "repository": {"provider": "github", "id": 12345},
  "investigation_id": "inv-123",
  "attempt_id": "attempt-1",
  "source": {
    "pr_number": 42,
    "pr_original_base": "main",
    "ref": "feature/payment-timeout",
    "commit_sha": "FULL_GIT_COMMIT_SHA",
    "remediation_target": "feature/payment-timeout",
    "target_head_sha_start": "FULL_GIT_COMMIT_SHA",
    "target_head_sha_before_write": "FULL_GIT_COMMIT_SHA"
  },
  "environment": {
    "executor_class": "REMEDIATION_SANDBOX",
    "image_digest": "sha256:IMAGE_DIGEST",
    "os_arch": "linux/amd64",
    "toolchain_versions": {"node": "APPROVED_NODE_VERSION"},
    "lockfile_sha256": "DIGEST",
    "configuration_sha256": "DIGEST",
    "env_names": ["NODE_ENV"],
    "network_policy_id": "deny-egress-v1"
  },
  "baseline": {
    "argv": ["pnpm", "test", "--", "tests/payment.test.ts"],
    "cwd": ".",
    "expected_failure": "TimeoutError:payment",
    "observed": "reproduced",
    "exit_code": 1,
    "evidence": "artifact://fixture/original-run"
  },
  "reproduction_harness": {
    "artifact": "artifact://fixture/trusted-reproducer",
    "sha256": "TRUSTED_HARNESS_DIGEST",
    "manifest_sha256": "TRUSTED_HARNESS_MANIFEST_DIGEST",
    "expected_test_ids": ["payment timeout"],
    "agent_editable": false
  },
  "patch": {
    "git_diff_sha256": "DIGEST_OF_CANONICAL_BINARY_DIFF",
    "original_tree_sha": "TREE_SHA",
    "patched_tree_sha": "TREE_SHA",
    "changed_files": ["src/payment.ts"]
  },
  "validation": {
    "policy_version": "remediation-checks-v1",
    "mandatory_checks": ["original_repro", "affected_tests", "required_ci", "applicable_scans", "patch_policy"],
    "results": [
      {"check": "original_repro", "status": "passed", "artifact": "artifact://fixture/after"}
    ],
    "status": "NOT_VALIDATED_MISSING_CHECKS"
  },
  "freshness": {
    "status": "PENDING_VERIFICATION",
    "last_checked_at": null,
    "observed_target_head_sha": null,
    "cleanup_status": "NOT_REQUIRED"
  }
}
~~~

The sample is schematic, **not** schema-valid production data. Actual implementations validate SHA lengths, required fields, artifact digests and all checks before an outcome can become VERIFIED.

### Protected original reproduction harness

Before patching, the trusted controller captures the original reproducer from the pinned source revision or a separately authorized, versioned regression fixture. Freeze its assertions, test selectors, runner arguments, fixtures/mocks, configuration and other inputs that determine test execution and expected results; record their manifest, hashes and expected test discovery/skip behavior. Code under test is the bounded patch subject, not part of the immutable harness.

Store the harness outside the agent-editable workspace. The independent validator verifies its digest and restores or mounts the same harness and configuration read-only in both baseline and patched validation jobs. Run it against the respective original and patched application code. The agent cannot replace the harness, redirect its inputs or substitute its own report. A fresh sandbox alone does not establish harness integrity.

Agent-written or modified tests are supplemental evidence. They cannot replace the trusted original reproduction or reduce the frozen mandatory checks. New skips, zero discovered tests, removed/weakened assertions, redirected test selectors or an invalid harness digest fail validation. If the trusted reproducer cannot be run faithfully, report INCONCLUSIVE / NOT_VALIDATED. Any harness revision requires independent authorized approval and a new linked attempt with baseline reproduction; a patch cannot redefine its own success criterion.

### Required algorithm

1. **Freeze inputs and harness:** Resolve the original failing commit, source PR head/ref, integration base/merge SHAs when relevant, repo ID, required check set and applicability policy version **before editing**. Identify the exact approved environment, lockfiles, image digest and command parameters. Capture and hash the trusted reproduction harness outside agent edits.
2. **Reproduce baseline:** In an isolated job at the original failing revision, verify the harness manifest and run the original command with the frozen harness. A matching failure signature and expected test discovery must be observed. Success, mismatch, unexpected skips, nondeterministic failures or environmental errors are INCONCLUSIVE, not reproduced.
3. **Patch:** Apply a bounded change to the pinned source revision only; save the raw canonical Git binary diff (deterministic serialization, defined ordering) and SHA-256, changed files, original tree SHA and patched tree SHA. Agent edits to tests do not modify the trusted harness.
4. **Validate independently:** Start a fresh sandbox at the patched tree in the **equivalent** immutable environment. Verify and restore the same trusted harness and run the **original failing command** against patched application code. It must pass with the expected tests actually executed. Any unavoidable environmental difference must be disclosed and evaluated against an explicit policy.
5. **Required checks:** Pass (a) trusted original repro turned green, (b) affected regression tests, (c) repository-required CI suite/build/typecheck/lint where registered, (d) applicable dependency/security/IaC scans, (e) scope/branch/protected-file and harness-integrity rules. Every mandatory check must have an independently collected result and artifact.
6. **Fail closed:** Failed/skipped/missing/errored/timed-out mandatory checks, harness mismatch or execution suppression => NOT_VALIDATED. A check may be deemed NOT_APPLICABLE only when applicability was determined deterministically before patching; policy exceptions require auditable authorized approval and cannot waive the trusted original reproduction.
7. **Pre-write check:** Resolve the actual source branch HEAD, source PR state, integration base when relevant and authorization again just before Git write. If a required revision changed, the source PR merged/closed, the branch disappeared or permission was lost, stop as STALE_REVISION / TARGET_UNAVAILABLE. Do not automatically rebase or retarget. An unavailable check blocks writing.
8. **Create pending draft:** The restricted Git writer pushes a new fix branch and opens a **draft** PR only after authorization and independent validation. Include the pinned revision tuple, evidence links, check results, target branch, harness digest and patch checksum. Mark PR freshness PENDING_VERIFICATION; local validation is historical evidence for the recorded revisions, not an assertion about the live target.
9. **Post-creation check:** Re-fetch the created PR's repository/base/head identity, source PR state, actual target HEAD and relevant integration base; independently confirm the pushed tree matches the validated tree. Record observations and timestamps. Only a matching result establishes CURRENT_AT_OBSERVED_REVISION and eligibility for human review. A mismatch invalidates current validation and invokes the stale-PR handling below. Failure to establish freshness leaves the PR pending or UNKNOWN_FRESHNESS and never review-ready.
10. **Reconcile continuously:** Process source/fix PR and branch events and periodically reconcile to cover missed or out-of-order events. Recheck before promoting a draft or claiming current review readiness. Any relevant revision/state change invalidates current validation until a new attempt reproduces and validates against fresh pinned inputs.
11. **Retry safely:** Use a durable operation record and unique idempotency key for repository ID + pinned source SHA + target branch + patch digest; serialize Preflyt writes for that operation. After an ambiguous provider timeout, reconcile an existing branch/PR and its freshness before retrying. A lookup alone is not a concurrency guarantee. Duplicate delivery must not cause a second write or inherit stale validation.

Underlying attempt evidence is immutable; later attempts and freshness/cleanup observations append records, not overwrite them. A test pass is evidence, not a claim of complete correctness.

### Branch races, freshness and cleanup

GitHub PR creation names a live base branch; its [documented creation parameters](https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request) do not atomically compare that branch to an expected HEAD SHA. A pre-write check, platform lock or successful PR creation therefore cannot guarantee that a human or another integration did not move the branch in the intervening window. Preflyt guarantees detection/reconciliation and truthful validation status, not that a transient stale draft can never exist.

Track historical check results separately from PR freshness: PENDING_VERIFICATION, CURRENT_AT_OBSERVED_REVISION, STALE_REVISION, TARGET_UNAVAILABLE or UNKNOWN_FRESHNESS. Show the exact validated revision tuple and the last successful observation time; current status is an observation, not a perpetual guarantee. Missed events, reconciliation failure or expired policy-defined freshness leave the live status unknown and block promotion. A moved PR head or integration base also invalidates any affected checks.

For a mismatch detected after creation, or a subsequent source/target change, invalidate current validation immediately and enqueue idempotent cleanup: close the still-open **Preflyt-owned** fix PR with an auditable stale/target-unavailable reason. Reconcile already closed/merged fix PRs as terminal outcomes; never automatically revert a human merge. While closure is pending or fails, keep the PR draft where supported, mark it stale in Preflyt, and report cleanup failure for authorized intervention. Never modify or close the original source PR, force-push the source branch, retarget the fix, or reuse prior validation on a new base. Do not delete the fix branch during automatic cleanup; retain it and its evidence under retention policy.

If the provider cannot be reached, record UNKNOWN_FRESHNESS and keep review promotion blocked; reconcile on recovery and then either confirm the recorded revisions or perform stale cleanup. Recovery and cleanup attempts are bounded and audited. Post-creation checks narrow and detect race windows but cannot eliminate future branch changes. Human review, branch protections and required SCM checks remain independent merge controls; Preflyt never merges.

## 4. PR target policy

| Failure origin | New remediation PR base | Behaviour |
| --- | --- | --- |
| Open PR from a **same-repository feature branch** | **That same feature branch** | Create a new preflyt/fix branch from the pinned source PR **head SHA** (not a synthetic merge ref), and open the fix PR *into the feature branch*. Do not alter the original feature PR. |
| Failure directly on an active default branch | **Default branch** | Start from its pinned HEAD and verify the target HEAD has not changed before opening the fix PR. Human review and protections apply. |
| PR head comes from a **fork** | **None automatically** | Return validated patch/instructions. Require separately approved fork-write support before any write. **Never silently target main.** |
| Branch moved, PR merged/closed, branch deleted | **None** | Mark stale/target unavailable, require fresh checkout and validation. |
| Detached commit or ambiguous target | **None** | Require explicit authorized branch selection and fresh validation. |

When CI ran on a provider-generated **synthetic merge commit**, record that integration context (merge SHA and base SHA). Reproduce failures against that context when relevant; also test the updated feature against the required base integration. A head-only passing test cannot prove resolution of a merge-only failure.

Do not push changes into an existing feature branch. An agent's fix must be proposed as its **own** PR, and Preflyt must not merge it.

## 5. Acceptance criteria

### MVP execution baseline

- [ ] All Preflyt-run scanning/testing/install/build scripts for real repositories require APPROVED_REPOSITORY_SANDBOX.
- [ ] Preflight confirms effective isolation, placement, egress policy, quotas, and absence of credentials; negative escape/exfiltration tests pass.
- [ ] Docker-only local runner refuses real untrusted repository jobs; unsafe/missing executor falls back to INGEST_ONLY evidence, **never unsafe execution**.
- [ ] Imported CI results are clearly marked as external observations and not Preflyt-verified reproduction.

### Restricted PoC

- [ ] Only stable fixture repository IDs have write permissions in a separate GitHub App installation.
- [ ] A controlled fixture produces a validated patch and a human-reviewed fix PR.
- [ ] Every write to a non-fixture fails from both policy and provider-permission enforcement, including forged event and prompt-injection tests.
- [ ] General MVP repositories have no automated PR-write workflow.

### V1 validation and targeting

- [ ] Every attempt stores exact source commit and PR state, immutable environment/toolchain, commands, output evidence, patch checksum and both tree SHAs.
- [ ] The baseline expected failure is reproduced; after-patch the same original command passes with the frozen trusted harness in an independent equivalent sandbox.
- [ ] Harness manifests/digests and expected test discovery are verified independently; agent edits cannot change the trusted assertions, selectors, inputs or skip rules.
- [ ] Removing assertions, skipping the failing test, redirecting selectors, returning forged results or discovering zero tests cannot produce VERIFIED; supplemental tests cannot replace the original reproducer.
- [ ] Every mandatory check is recorded and passes before VERIFIED; no silent skip.
- [ ] On a same-repository open feature PR, the remediation PR targets **its feature branch**, not main.
- [ ] Known forked, deleted, merged/closed, stale and ambiguous source cases block pre-write authorization; source-state races after creation invalidate freshness and invoke cleanup.
- [ ] Fix PRs begin as drafts and require post-creation identity/tree/source/target verification before human-review readiness; unknown freshness never counts as current validation.
- [ ] Moving the source/target/integration base during or after PR creation invalidates current validation and triggers audited cleanup of only the Preflyt-owned fix PR; transient stale drafts may exist but are never represented as currently validated.
- [ ] Missed events, provider outages, failed cleanup, process restart and concurrent retries are reconciled through durable operation records without duplicate PRs or reused stale validation.
- [ ] Merge and approval are always human-controlled.

## 6. Scope note

The [TypeScript-first decision](ADR-0001-typescript-first-stack.md) remains unchanged. The exact choice of isolation runtime, supported OS/kernel versions and approved code-execution hosting still requires engineering/security verification, but **the requirement for safe MVP execution is resolved**.

**These are design decisions, not statements that the corresponding security controls have been implemented or tested.**
