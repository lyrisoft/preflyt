# Community Edition release preparation and qualification

Use this runbook with [the readiness tracker](../planning/open-source-readiness.md). It describes work to perform after the relevant verification/publication is authorized; writing it does not run a release. Do not change visibility, deploy migrations or trigger workflows just to fill a checklist.

## 1. Select the candidate and clear rights

Record the exact source SHA, intended release version, supported platforms and image digests in a copy of the [candidate evidence template](../releases/community-candidate-template.md). Include all pending source fixes in the reviewed candidate; do not use results from an earlier commit as acceptance.

- Review Lyrisoft ownership and contributor DCO records. Retain Apache-2.0 and upstream license notices. The app's license does not replace third-party licenses.
- Produce a candidate-specific dependency/scanner/rule/database/font/asset inventory and satisfy notice obligations. `THIRD_PARTY_NOTICES.md` is an index, not that inventory.
- Confirm no future proprietary module was unintentionally included; do not remove agreed core Community features to create a paid edition.
- Review original and imported source/assets, including offline scanner archives and tools inside container bases. Preflyt-owned Semgrep configuration does not establish rights to every upstream image file.

## 2. Exposure and public-contribution review

Perform a redacted current-tree and full reachable-history secret/confidentiality review with the approved scanner. Include branches/tags, CI logs and artifacts, registry/build caches, screenshots, fixtures, internal URLs and customer material. Store findings privately; the public record should contain sanitized conclusions and remediation references, not secret values. Review whether a sanitized release repository is preferable to exposing existing history. Revoke exposed credentials with their providers; history rewriting is not revocation.

Review workflow OIDC trust, caches/artifact provenance, local/reusable actions, permissions, protected environments and fork behavior. The DCO workflow reads GitHub commit metadata without checking out PR code; it is not a security or ownership audit. Project verification still runs untrusted source and requires separate review. Checkout credentials are disabled in checked-in workflows, but live tokens/environment permissions and branch rules must be verified independently.

Confirm @iampeters has write access and required code-owner review works. Enable the `DCO sign-off` check as a required check when separately authorized. Existing commits are not automatically signed off, rewritten or exempted. Confirm a backup maintainer and security triage owner, and exercise delivery to support@lyrisoft.tech without transmitting real vulnerabilities.

## 3. Private candidate qualification

When tests/builds are authorized, first use isolated local infrastructure and applicable full suites. Apply the new GitHub transaction migration to a disposable database, not the running application database. Follow [test database safety](test-database-safety.md).

Qualify the final images on AMD64 and ARM64. Keep the engine/scanner and optional native-execution boundaries distinct. Verify:

1. Clean documented Compose start with initial independent encryption keys, no source checkout or host Node/Postgres/Redis installation.
2. Admin identity preserved through App registration/installation and organization connection; selected GitHub repositories load once; later sync preserves explicit exclusions and workspace boundaries.
3. Real repository Health: accurate complete/partial/failed states, findings/source evidence and history; no manual scanner bootstrap. Verify setup states and green Completed badges.
4. Real PR: compatible published Action version, same-run test/coverage reports, verified evidence, readiness and explicitly activated basic protection. Missing/failing evidence must not pass. AI-disabled deterministic flow must work; exercise optional BYOK success/failure separately.
5. Persistence, least-privilege database roles, migration replay, supported upgrade, backup/restore and restart with stable scanner identity/keys. Document rollback limits; image downgrades do not undo migrations.

Record exact commands, versions, duration and outcomes. Do not repeatedly spend hosted build minutes on a candidate whose relevant local qualification is incomplete.

## 4. Artifacts and public access

The application Bake targets explicitly request SBOM and maximum-mode provenance using [Docker's attestation configuration](https://docs.docker.com/build/bake/reference/#targetattest). Inspect the actual registry output and validate subjects/digests and contents; requesting an attestation is not verifying it or signing it. Never pass secrets in build arguments: maximum provenance can expose build parameters. Use supported secret mounts instead.

The application images copy current license/notice material under `/usr/share/licenses/preflyt/`; this does not complete third-party inventory clearance. Include required complete notices for actual dependencies and bundled scanner images. The optional native publisher currently loads to the local Docker store and pushes afterwards; do not assume it preserves attestations. Qualify a compatible export/attestation path separately before promising native-image supply-chain evidence.

After explicitly authorized publication/visibility changes:

- Verify the repository and every normal-stack GHCR package independently. A public repository does not automatically establish anonymous package access.
- On clean AMD64 and ARM64 hosts, with no GHCR credentials or helper supplying them, follow the exact public downloads, pull/start all images and exercise scanner preparation. Record digests. Authenticated CI pulls do not satisfy this requirement.
- Verify version tags resolve to approved digest manifests with both platforms, and that release notes identify all images, schema/upgrade requirements and supported Action version.
- Inspect and verify available SBOM/provenance, signing policy and vulnerability triage. Record tool versions, findings, exceptions and reviewer; do not call a metadata file a security pass.
- Update private-access documentation only after anonymous access works. Refresh screenshots affected by changed UI and keep actual setup/disabled states honest.

## 5. Go/no-go and handoff

Collect owner, legal/IP, security and release-maintainer approval against the candidate evidence. Publish supported security versions, backup contact, known limits and community support expectations. Confirm contribution templates, CODEOWNERS/DCO and security reporting are effective remotely. Community has unlimited repositories and optional BYOK AI; Cloud remains planned.

Only after explicit public-launch authorization should maintainers make the repository/packages public, publish release communication or update a deployed site. Do not mark the readiness checklist complete from the existence of these files or an old successful run.
