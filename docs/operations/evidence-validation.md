# Evidence validation (P1 prerequisite slice)

New assessment snapshots freeze a versioned validator (v1 integrity checks; v2 signed provenance support) and per-rule evidence validation. Open an assessment and expand **Evidence validation** to inspect integrity, reported execution, and missing prerequisites. Historical snapshots stay unchanged; snapshots without this field predate the validator.

## Verified checks

Mapped CI observations must match the full projection rebuilt from their processed signed webhook delivery, including repository, installation, revision, source identity, result, timestamp and digests. Original artifact bytes must match SHA-256, parser version 1, the bounded offline parser, and their stored summary. Only redacted scalar summary fields and validation results enter snapshots; report bytes, test names, paths and tool names do not.

`tests.required` requires one unambiguous JUnit report with at least one reported executed test (passed + failures + errors). All-skipped or empty reports do not establish execution. `security.sast` requires SARIF; finding count alone does not establish scanner execution. Provider success and reported failures are separate facts.

The validator also records approved source matching, freshness, superseded or ambiguous observations, missing formats, and collection truncation. At most 32 original artifacts are validated per snapshot; a 33rd sets `validationCollectionTruncated` and prevents complete evidence. Individual imports retain the existing 256 KiB limit. Multiple matching reports remain ambiguous rather than arbitrarily selecting one.

## Trust boundaries

**VALID report integrity** means bytes and parsing agree. **INVALID evidence** means observation or report integrity failed. **INCOMPLETE validation** means execution trust remains unestablished. Neither valid hashes, approved job names, administrator associations nor mutable verification labels establish trusted CI execution.

Administrator uploads without a current verified signed attestation remain blocked by unverified report provenance. Even with [verified provenance](ci-provenance.md), tool identity, execution environment and rule coverage remain unverified. `trustedExecutedChecks` stays zero, rule outcomes and quality gates stay null. No repository code is executed and no GitHub status or remediation is published.

Next prerequisite: obtain independently verifiable CI report provenance bound to the exact source revision, producer/tool and environment, with complete rule-specific coverage. Do not enable trusted outcomes merely by changing an upload label.

## Deployment and verification

No migration, new service or environment variable is required. API validation uses local PostgreSQL evidence without calling GitHub. Run the scoped evidence-validation, assessment-plan and assessment integration tests against a disposable database; frontend typecheck and touched-file lint/format cover the UI. Browser tests remain skipped.

## Policy-aware execution contracts

The baseline limitations above apply when no reviewed execution contract is configured. The policy-aware extension can mark supported rule evidence `VERIFIED` only when a pinned signing workflow contract, current cryptographically verified provenance, report integrity, source approval and rule-specific execution checks agree. Mutable upload labels remain insufficient. The published-policy evaluator separately rechecks the current workflow run and policy/contract hashes before allowing manual success. Historical previews are unchanged. See [production deployment](../deployment/github-governance-production.md); automatic publication and ruleset activation remain unreleased.
