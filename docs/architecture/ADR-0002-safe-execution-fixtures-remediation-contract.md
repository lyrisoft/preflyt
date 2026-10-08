# ADR-0002: MVP safe execution and verified remediation

**Status:** Accepted product design; implementation pending  
**Date:** 2026-10-08  
**Related:** [Product requirements](../PRD.md), [ADR-0001](ADR-0001-typescript-first-stack.md)

## Decisions

1. **MVP may execute code only in an approved isolation environment.** Safe execution is a prerequisite for scanner/test/build jobs, not deferred to V1. If no approved executor exists, Preflyt only ingests external CI findings.
2. **PoC repository writes are fixture-only.** End-to-end proof of concept may create remediation PRs solely in administrator-designated, disposable fixture repositories. General MVP remains read-only.
3. **Remediation validation has a versioned, immutable evidence contract** with exact source commit, environment, commands, patch SHA-256 and required check outcomes.
4. **Unmerged source PRs are fixed into their own feature branch**, not silently into main.

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
| Baseline | Original reproduction command, expected signature, exact observed failure evidence and certainty/repeatability status |
| Patch | Canonical binary Git diff bytes SHA-256, original Git tree SHA, patched tree SHA, changed-file manifest and patch-application result |
| Validation | Separate sandbox job IDs, patched checkout SHA/tree, equivalent pinned environment, results and artifacts for each required check |
| Policy | Required-check set and applicability/version **frozen before patching**, approvals/exceptions, final decision |
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
  }
}
~~~

The sample is schematic, **not** schema-valid production data. Actual implementations validate SHA lengths, required fields, artifact digests and all checks before an outcome can become VERIFIED.

### Required algorithm

1. **Freeze inputs:** Resolve the original failing commit, source PR/ref, repo ID, required check set and applicability policy version **before editing**. Identify the exact approved environment, lockfiles, image digest and command parameters.
2. **Reproduce baseline:** In an isolated job at that SHA run the original failing command. A matching failure signature must be observed. Success, mismatch, nondeterministic failures or environmental errors are INCONCLUSIVE, not reproduced.
3. **Patch:** Apply a bounded change to the pinned source revision only; save the raw canonical Git binary diff (deterministic serialization, defined ordering) and SHA-256, changed files, original tree SHA and patched tree SHA.
4. **Validate independently:** Start a fresh sandbox at the patched tree in the **equivalent** immutable environment and ensure the **original failing command now passes**. Any unavoidable environmental difference must be disclosed and evaluated against an explicit policy.
5. **Required checks:** Pass (a) original repro turned green, (b) affected regression tests, (c) repository-required CI suite/build/typecheck/lint where registered, (d) applicable dependency/security/IaC scans, (e) scope/branch/protected-file rules. Every mandatory check must have a result and artifact.
6. **Fail closed:** Failed/skipped/missing/errored/timed-out mandatory checks => NOT_VALIDATED. A check may be deemed NOT_APPLICABLE only when applicability was determined deterministically before patching; policy exceptions require auditable authorized approval.
7. **Recheck target:** Resolve the actual source branch HEAD and source PR state again just before Git write. If branch changed, merged, closed, disappeared, or lost permission, stop as STALE_REVISION / TARGET_UNAVAILABLE. Do not automatically rebase or retarget.
8. **Write last:** The restricted Git writer pushes a new fix branch and opens a human-reviewable PR only after authorization and independent validation. Include evidence links, check results, target branch and patch checksum.
9. **Retry safely:** Reconcile idempotently using repository ID + pinned source SHA + target branch + patch digest, checking for an existing PR/branch before retrying.

Underlying attempt evidence is immutable; later attempts append records, not overwrite them. A test pass is evidence, not a claim of complete correctness.

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
- [ ] The baseline expected failure is reproduced; after-patch the same original command passes in an independent equivalent sandbox.
- [ ] Every mandatory check is recorded and passes before VERIFIED; no silent skip.
- [ ] On a same-repository open feature PR, the remediation PR targets **its feature branch**, not main.
- [ ] Fork, deleted, merged, stale, and ambiguous branch cases cannot create unauthorized PRs.
- [ ] Branch-head races and retries cannot create stale or duplicate fix PRs.
- [ ] Merge and approval are always human-controlled.

## 6. Scope note

The [TypeScript-first decision](ADR-0001-typescript-first-stack.md) remains unchanged. The exact choice of isolation runtime, supported OS/kernel versions and approved code-execution hosting still requires engineering/security verification, but **the requirement for safe MVP execution is resolved**.

**These are design decisions, not statements that the corresponding security controls have been implemented or tested.**
