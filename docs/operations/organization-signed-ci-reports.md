# Private-repository report signatures

The organization-key proof adapter verifies reports without GitHub Enterprise native attestations. It uses an administrator-reviewed public-key allowlist and exact repository, commit, workflow SHA, run ID and attempt matching. It does not claim that its signed assertions are GitHub-issued certificates. The signer is a separate trust authority; its security is essential.

## Deployment

Set `CI_REPORT_PROOF_MODE=organization-key` on both API and worker and supply the identical `CI_ORGANIZATION_SIGNER_KEYS` JSON. No private key or KMS credentials belong in either service. Ordinary Compose forwards these two values. The native proof mode remains the default; the native CLI override is optional and is not needed in organization-key mode.

```json
[{"kid":"ci-2026","algorithm":"RS256","publicKeyPem":"-----BEGIN PUBLIC KEY-----\nREPLACE_WITH_REVIEWED_SPKI_PUBLIC_KEY\n-----END PUBLIC KEY-----","repositoryIds":["EXACT_NUMERIC_REPOSITORY_ID"],"workflows":[{"path":"owner/repo/.github/workflows/ci.yml","sha":"REVIEWED_FULL_WORKFLOW_COMMIT_SHA"}]}]
```

Supported algorithms: RSA SHA-256 with at least 2048-bit keys, P-256 ECDSA, and Ed25519. Symmetric signing, embedded or remote keys, unknown algorithms and unknown modes are rejected. Restrict each key to stable repository IDs and exact reviewed workflow SHA/path pairs. Retain existing approved CI source bindings and `CI_EXECUTION_CONTRACTS`; proof never bypasses those requirements. Publish a new policy after changing execution contracts.

## Trusted signing boundary

Use a protected, administrator-controlled signing job or service. It must independently obtain the report from the permitted workflow run and check repository, head commit, run attempt, report completeness and allowed tool versions. Never let untrusted PR code choose signed claims, use the signing key, assume the KMS role, run inside the signer, or replace the report after verification. A key exposed to the same job executing arbitrary repository code does not provide trustworthy execution evidence. Pin trusted signing code and third-party Actions. For private repositories where GitHub plan limits protected environments, enforce isolation and approval in the signing service and cloud IAM boundary instead of pretending the environment is protected.

KMS authorization should bind GitHub OIDC trust to the intended organization/repository, protected signing workflow/ref/environment, and narrow `kms:Sign` on one asymmetric `SIGN_VERIFY` key. Preflyt never creates IAM resources or installs signing authority automatically. Cross-repository reusable signing and self-hosted runners remain unsupported by this first adapter. Do not use `pull_request_target` to execute untrusted checkout with signing privileges.

## Signing format and helper

`scripts/ci/sign-report-kms.mjs` runs **only inside the trusted GitHub-hosted signing job**, with a reviewed AWS CLI and short-lived KMS signing authorization. It reads GitHub job identity, hashes the original report, creates the compact JWS signing input, and asks KMS for `RSASSA_PKCS1_V1_5_SHA_256` over its SHA-256 digest. It stores no private key and writes a new proof file with restricted permissions.

```sh
node scripts/ci/sign-report-kms.mjs report.xml report-proof.json "$KMS_SIGNING_KEY_ARN" ci-2026
```

The helper reads `GITHUB_SHA`; it must be the exact source commit assessed by Preflyt, not a PR merge-ref SHA. The trusted workflow must arrange that source identity correctly. This helper does not itself independently attest runner identity; it signs assertions under the reviewed organization's trust boundary. Deployments must validate that boundary separately.

Upload the JUnit/SARIF report to its completed workflow observation, then choose **Verify report source** and upload `report-proof.json` with the approved signer workflow path. The existing authenticated, origin-protected report proof endpoint remains unchanged. Report bytes must match exactly, including line endings. The signature binds report digest, stable repository ID/name, commit, run/attempt, workflow path/SHA, runner class and issued timestamp. Proofs must be imported within seven days; future timestamps beyond five minutes are rejected. Gate evidence freshness is separately enforced by the published policy and live workflow check.

The JSON envelope is `{ "format": "preflyt.organization-report.v1", "signature": "COMPACT_JWS" }`. Header fields are exactly `alg`, `kid` and `typ`. Signed payload v1 contains `schemaVersion`, `subjectSha256`, `repositoryId`, `repositoryName`, `sourceSha`, `runId`, `runAttempt`, `signerWorkflow`, `signerDigest`, `runnerEnvironment` and `issuedAt`. The artifact ID is server-derived after import and never accepted from the signer as an identity override.

## Rotation and acceptance

Changing the allowed keys, workflow scope or mode changes the policy digest. Old receipts are no longer trusted under changed policy; reverify approved reports. Remove a compromised key promptly. Neither missing proofs, unverified uploads nor a green workflow alone produce PASS. Retained historical assessments preserve their original record, while current publication rechecks current trust and live run state.

Real RSA signature tests cover valid proofs, byte/signature tampering, changed repo/SHA/run/attempt, unknown keys, revoked scopes, workflow SHA changes, invalid timestamps and mode downgrade. KMS network integration, protected signer deployment and live GitHub merge enforcement require separate acceptance; local cryptographic tests do not establish those.

References: [AWS KMS Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html), [GitHub OIDC security](https://docs.github.com/en/actions/concepts/security/openid-connect), [native GitHub attestation availability](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
