# Signed CI report provenance

See the [production deployment contract](../deployment/github-governance-production.md) for plan requirements, separate Apps, reviewed runtime configuration and release limits.

## Setup

Apply additive migration `20261009060000_ci_attestations` and regenerate the Prisma client. Back up PostgreSQL before upgrading. No repository write permission, background job, new Redis key or Preflyt runner is added.

Provision an administrator-reviewed GitHub CLI binary (verified locally with 2.96.0) and obtain Sigstore roots with `gh attestation trusted-root` on a trusted connected administration machine. Review the acquisition and pin the binary/root SHA-256. Keep both files read-only to the API runtime. Set all five variables in `apps/api/.env.example`: `CI_ATTESTATION_GH_PATH`, `CI_ATTESTATION_GH_SHA256`, `CI_ATTESTATION_ROOT_PATH`, `CI_ATTESTATION_ROOT_SHA256`, and `CI_ATTESTATION_WORKFLOWS`. The allowlist is a JSON array of exact `owner/repo/.github/workflows/ci.yml` strings. No credential is needed by offline verification. Public roots are not secrets. Refresh roots through administration, never on report submission.

Containers require a derived reviewed image or read-only mounts providing the binary and root at those configured absolute paths. Use binaries matching the container architecture/libraries. The base API image keeps the feature disabled until configured. Root or workflow policy rotation means older receipts do not establish provenance in newly collected assessments; old immutable assessments remain unchanged.

## Workflow

Generate a GitHub artifact attestation for the exact JUnit/SARIF report bytes in the workflow that produced them; export one Sigstore JSON bundle. Follow [GitHub's attestation guide](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) and pin actions to reviewed full commit SHAs. Availability for private repositories depends on the GitHub plan; unavailable attestations remain unverified rather than using a weak fallback.

After the completed workflow webhook is processed, approve its numeric workflow identity under repository Standards and import the exact report under that observation. In CI results, open the workflow details, expand **CI provenance** on the report, enter the allowlisted signer path and select the signed bundle. Owner/Admin/Super Admin can verify; readers can inspect status. Missing deployment configuration is visible. Create a new assessment after verification to freeze the proof; existing assessments are never rewritten.

The source certificate SHA must equal the observation SHA. A PR merge-ref report is not a head-SHA report. Cross-repository reusable signing and check-run-to-workflow mapping are deliberately unsupported in this first slice. Empty/malformed/tampered proofs, wrong repository IDs, commit/run/attempt/signer, unsupported source or self-hosted runner provenance fail closed.

## API and storage

GET/POST `/github/repositories/:repositoryId/ci-evidence/:deliveryId/artifacts/:artifactId/provenance`. POST accepts `{bundle: string, signerWorkflow: string}` and requires privileged session and exact frontend Origin. GET requires session and selected/available active installation access. Responses contain proof status and safe receipt references; original report/bundle bytes and verifier errors are not returned. GET does not contact GitHub.

Receipts are append-only, content/policy scoped and audit-backed; successful duplicates do not add an audit. Access, report integrity and source binding are rechecked after verification. Failed verification, revoked access or audit failure cannot leave a receipt. Existing artifact verification labels stay unchanged. Historical receipt/bundle retention follows parent artifact retention.

Validated provenance removes only `REPORT_PROVENANCE_UNVERIFIED` for a unique valid matching report. Tool identity, execution environment and rule coverage still block trusted executed checks. No gate, repository write or AI action follows from provenance alone.

## Verification and rollback

Scoped tests cover signed identity, tampered bytes/signatures, policy pins, revocation, API authorization/Origin, replay, quotas, concurrent verifier admission, audit rollback and immutable assessments. The adapter also enforces runtime/output limits; timeout and output-overflow behavior were not induced in the live CLI smoke check. The real cryptographic test requires `PREFLYT_TEST_GH_PATH=/absolute/path/to/gh`; run `pnpm --filter @preflyt/api exec vitest run test/ci-attestation.test.ts test/evidence-validation.test.ts test/assessment-plan.test.ts test/assessments.integration.test.ts` against a disposable PostgreSQL database. Frontend typecheck and touched-file lint/format cover controls; browser tests remain skipped.

Unset provenance configuration to disable new verification. Retain the additive table when rolling back application code; no reset or destructive migration is needed. Automatic provider artifact retrieval and independent tool/environment/coverage verification remain later work.

## Policy-aware publication extension

Provenance alone still does not prove rule coverage. The policy-aware publisher additionally requires deployment-reviewed pinned execution contracts, rule-specific report checks and live workflow-run verification. A matching contract can establish execution trust in a new assessment; it does not rewrite historical snapshots. Automatic retrieval/publication, cross-repository reusable signing and ruleset activation remain pending. See the [check publication guide](github-check-publication.md).
