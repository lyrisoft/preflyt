# Approved CI source bindings

P1.3a supplies backend bindings for imported evidence. It does not validate execution, produce PASS, evaluate gates or publish GitHub checks. There is no binding editor in the UI yet.

## Approval API

Authenticated readers can GET `/github/repositories/:repositoryId/ci-bindings`. OWNER, ADMIN and SUPER_ADMIN may POST to that path with the configured WEB_ORIGIN and session cookie. The repository must remain selected, available and attached to an active installation. Responses are not cached.

First adopt standards, read their selection ID and the latest binding ID (null for the first approval), then submit:

```json
{
  "expectedSelectionId": "<current standards selection ID>",
  "expectedBindingId": null,
  "bindings": [
    { "ruleId": "tests.required", "kind": "check_run", "appId": "123", "checkName": "Unit tests" }
  ]
}
```

Alternatively bind `kind: workflow_run` with an exact `workflowId` string and no appId/checkName. Use IDs and exact case-sensitive check names from normalized signed CI observations, not guessed display names. Each adopted import_only rule accepts one source binding. Planned adapters and configuration-only rules cannot be enabled through bindings. One source may cover multiple imported rules, but this still does not establish that those rules executed.

Approvals append a revision and audit event atomically. Concurrent or stale approvals return 409; reload IDs before retrying. An empty bindings array clears associations in a new revision. Adopting a new standards selection makes previous bindings inactive and requires explicit reapproval against the new selection. Existing assessments remain unchanged.

## Matching and evidence

New signed check_run observations preserve app ID and exact check name. Workflow observations preserve workflow ID and run attempt when supplied. These allowlisted fields are included in version 2 evidence hashes. Historical identity-free version 1 observations and hashes are unchanged and cannot be automatically matched.

Both manual and CI-triggered assessments match only observations from the exact repository, installation and commit SHA. They freeze the active binding revision and definitions in their hashed request. Approved associations are labelled APPROVED_SOURCE_BINDING; manual per-assessment overrides retain ADMIN_ASSOCIATED_UNVERIFIED. Neither establishes verified execution or trusted tool/environment provenance. Provider success remains separate from the null rule outcome and null quality gate.

Multiple matching source object IDs produce AMBIGUOUS coverage, never an arbitrary winner. Within one workflow run, the highest signed run attempt takes precedence over timestamps; multiple observations with missing attempt metadata are ambiguous. Conflicting equal/unknown-time observations remain ambiguous. If the 100-observation collection limit is exceeded, automatic bindings are ambiguous because uniqueness cannot be established. Missing identities remain unmapped. Freshness, skipped/pending states and supersession still apply.

Trusted tool output, reproducible environment contracts, PR head/base context and deterministic gates remain separate implementation slices. A workflow or check name cannot certify test coverage.
