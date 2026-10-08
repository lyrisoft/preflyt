# ADR-0006: Cryptographically verified CI report provenance

Status: Accepted for the opt-in P1 provenance slice.

## Decision

Use GitHub Actions Sigstore/SLSA artifact bundles to verify the origin of already-imported reports. Use the reviewed GitHub CLI verifier with an explicitly pinned binary, frozen trusted-root JSONL file and deployment workflow allowlist. Verify offline; do not fetch bundles, execute repository code or pass platform credentials to the verifier.

Enforce SHA-256 of the original report and certificate-backed GitHub issuer, numeric repository ID, source URI/SHA, signer workflow URI/digest, GitHub-hosted runner classification, exact workflow run and attempt. Require a completed signed workflow observation and an active adopted source binding. This first slice rejects check-run observations, fork provenance, cross-repository reusable signers, self-hosted attestations, multiple subjects/bundles and missing claims. Do not infer tested source from arbitrary predicate fields or rewrite merge-commit provenance to a PR head SHA.

Retain bounded original bundles with append-only verification receipts and audits. One receipt per artifact and policy digest, at most five policy versions per artifact. No upload label changes. Assessment validator version 2 includes a current-policy receipt only after report/observation integrity checks; historical assessments stay immutable.

## Remaining trust prerequisites

The attestation establishes a signed origin claim. It does not establish correct test execution, trusted scanner/tool version, a pinned complete execution environment, or sufficient rule coverage. GitHub-hosted classification is only runner provenance. Required outcomes remain incomplete and quality gates remain null until those separate contracts are implemented. Failed checks cannot be converted to passing results by an attestation.

## Operations and limits

The binary and root must be administrator-owned/read-only. Configuration includes SHA-256 pins; changes fail verification and policy rotation invalidates receipt eligibility in new assessments. JSON bundles are limited to 512 KiB; verifier concurrency is one per API process, runtime 15 seconds, output 2 MiB. The child receives no GitHub/model/DB credentials, uses a private temporary directory and blocked proxy settings, and cleans temporary material. Deployment policy should also deny verifier egress. Verification is outside DB locks; access, integrity and source approval are rechecked transactionally before receipt/audit insertion.

An optional runtime dependency is deliberately explicit: deployments without the reviewed gh binary, trusted roots and allowlist show verification as unconfigured, while ingest-only functionality continues. Container operators must mount/provision these files; the base image does not silently download a verifier or trust roots.

References: [GitHub CLI verification contract](https://cli.github.com/manual/gh_attestation_verify), [trust-root export](https://cli.github.com/manual/gh_attestation_trusted-root), [certificate extension fields](https://github.com/sigstore/sigstore-go/blob/main/pkg/fulcio/certificate/extensions.go).
