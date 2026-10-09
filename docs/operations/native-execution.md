# Native execution: P3 admission preflight

**Implemented:** a separate read-only TypeScript preflight controller, independent signed review verification, fresh signed runtime observations, repository-scoped status API and assessment UI status. **Not yet implemented:** job dispatch, source checkout, scanner/test/IaC adapters, artifact collection and native gate evidence. No preflight result enables repository execution; all installations remain INGEST_ONLY in this increment.

## Where to find it

Open a repository's **Assessments** tab (or the workspace Assessments page), then **Commit assessments → Execution environment → Check sandbox**. Help opens the shared drawer. The endpoint is `GET /github/repositories/:repositoryId/native-execution/status`; it requires current repository `assessment.read`. Disabled/missing/expired/changed reviews, controller outages and changed controls retain imported CI evidence. A successful preflight displays separately from check outcomes and never changes a deterministic assessment or GitHub result.

## Trust boundaries

The API holds no Kubernetes token. The dedicated controller reads only named runtime resources and cannot schedule jobs with the supplied RBAC. It receives no database, Redis, model, GitHub or cloud-write credentials. Its entry point refuses common platform/model/SCM credential variables. It never loads the default kubeconfig, the developer's current context, an exec authentication plugin or an insecure TLS connection. No shell/repository commands or host-container socket are used.

An independent reviewer signs a deployment-scoped approval **outside Preflyt's API, worker and controller**. The controller has a different signing identity for short-lived configuration observations; it cannot manufacture an independent review. Deployers control the trusted reviewer public-key allowlist. Signatures prove who attested to a review, not that these code tests independently verified your runtime.

Review approval is an Ed25519 compact JWS with protected `{alg:"EdDSA", kid:"reviewer-key-id", typ:"preflyt.native-runtime-approval.v1"}`. Install trusted public SPKI PEM keys as `NATIVE_RUNTIME_REVIEW_KEYS` JSON `[{"kid":"reviewer-key-id","publicKey":"-----BEGIN PUBLIC KEY-----\n..."}]`. The signed payload must contain exactly the following fields (see `NativeApproval` in source):

- `version:1`, stable `environmentId`, explicit allowed internal `organizationIds` (no wildcard).
- A dedicated `preflyt-sandbox-*` namespace name and its UID; exact runtime class name and handler `runsc` or `kata`.
- Exact `networkPolicy`, `resourceQuota`, `limitRange` and credential-free `serviceAccount` names.
- `clusterHash`: Preflyt's canonical digest of `{server:<exact HTTPS origin>,caHash:<digest of CA PEM text>}`; no default cluster fallback.
- `controlsHash`: canonical digest of `nativeControlsProjection` over the inspected namespace, RuntimeClass, all NetworkPolicies, named quota/limits and sandbox ServiceAccount. Status/volatile metadata is excluded; UIDs, security labels, worker placement, resource specifications and credential references are bound. Compute it with the same checked source version before the independent review.
- Exact HTTPS `controllerOrigin` and its Ed25519 SPKI `controllerPublicKey`.
- `approvedAt`, `expiresAt` (maximum 30 days), SHA-256 `reviewDigest` and SHA-256 `testDigests` for `escape`, `metadata`, `exfiltration`, `crossRepository`, `resourceAbuse`, `cancellation`.

These artifact digests must refer to actual independent review evidence. Do not generate dummy review certificates to enable real-repository execution. Review key removal, expiration or relevant resource changes invalidates the approval. The current preflight inspects Kubernetes API configuration, **not effective syscall isolation, CNI enforcement, node PID limits or runtime behavior**. The independent negative tests and future per-job effective runtime checks remain required under [ADR-0002](../architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md). Passing local fixtures or requested YAML does not approve a sandbox.

## Current network/resource profile

The first observer accepts one all-pod default-deny ingress/egress NetworkPolicy and rejects additional additive policies. No dependency egress profile is supported yet. RuntimeClass must select dedicated workers, namespace admission must enforce Restricted with a pinned `v1.*` policy version, and the sandbox ServiceAccount must explicitly disable token automount and contain no secret/image-pull credentials.

Quotas must bound pod count (at most 20), CPU (at most 32 cores), memory (64 GiB), storage (200 GiB) and ephemeral storage (100 GiB). Per-container limits cannot exceed 4 cores, 8 GiB memory or 4 GiB ephemeral storage; positive default requests ≤ defaults ≤ maximum are required. These are preflight ceilings, not final per-job allowances. A runtime approval still requires independent process/deadline/cancellation/resource-abuse evidence. The observer makes at most six parallel read calls, each with a 10-second abort timeout; policy inventory is capped at 100.

## Deployment and upgrade

Build the normal API runtime image; `@kubernetes/client-node` is pinned in production dependencies. The existing report proof verifier's `jose` dependency is also now included in production deployment, rather than only development dependencies. No schema migration is needed for this preflight increment.

1. Independently review a dedicated stronger runtime and retain the evidence above. Do not use an unrelated/production cluster for acceptance.
2. Use the [read-only observer RBAC example](../deployment/native-preflight/observer-rbac.yaml), replacing exact reviewed names. The controller identity can read only those objects plus list NetworkPolicies in the sandbox namespace; it cannot read secrets, exec, create Jobs or mutate resources.
3. Deploy the controller using `node dist/execution-controller.js` and the [dedicated environment example](../deployment/native-preflight/controller.env.example). Mount a least-privilege token and CA read-only. Set `NATIVE_CLUSTER_SERVER` to the exact reviewed HTTPS origin. Token rotation is supported through the mounted file; it is read for each observation.
4. Provide a separate random `NATIVE_CONTROLLER_API_KEY` of 32–256 characters to API/controller, and an Ed25519 `NATIVE_CONTROLLER_SIGNING_KEY` private PEM **only to the controller**. Never install the independent review private key on either service.
5. Terminate TLS at a trusted private ingress/reverse proxy, matching the signed controller origin. Restrict ingress to the Preflyt API. The [optional Compose controller example](../deployment/native-preflight/compose.yaml) binds only loopback and still requires the approved remote runtime and TLS routing; it is not an executor and does not prove sandbox isolation.
6. Install the identical signed review/public reviewer allowlist on API/controller. Set `NATIVE_PREFLIGHT_ENABLED=true` on the API (default false). Root Compose forwards only the API's preflight configuration, not cluster credentials or controller private key. Restart the changed services during deployment; implementation/testing does not restart your running API/worker.

Controller `GET /health/live` proves process liveness only. It deliberately does not claim executor readiness. `POST /preflight` requires the shared credential, bounded strict input and a current exact-scope independent review. It returns an Ed25519 signed observation with the caller's nonce, org, stable repository ID, approval hash, environment, time, control digest and verification failures. API verification rejects response replay, wrong scope/key/control hash, stale observations (30 seconds), redirects, excessive bodies and access/review revocation. Unknown errors are redacted. The controller serializes observations and returns 429 while busy; failed checks never suppress imported CI results.

To roll back, disable `NATIVE_PREFLIGHT_ENABLED`, remove the dedicated controller, and keep the ordinary API/CI worker. No gate/assessment/policy data or GitHub protection changes during this preflight feature's operation or rollback.

## Verification and remaining P3 acceptance

Local automated tests use real Ed25519 signatures and an isolated loopback HTTP server with explicit configuration fixtures. They test forged/revoked/expired/incomplete reviews, changed isolation/network/quota/credential settings, bounded controller routes, response replay/tampering, denied/revoked repository access, and the invariant that even valid preflight leaves `executionAvailable:false`. UI tests cover loaded/blocked/verified/error/loading states. No real cluster was contacted and no connected repository code was executed.

P3 is not complete: finish the separate durable execution dispatcher, credential-free brokered checkout, reviewed pinned scanner/test/IaC images, cancellation/cleanup/artifact receipts, native evidence integration, and independently validated effective sandbox acceptance. P4 work cannot turn any of these missing execution results into passing checks.

Primary runtime references: [Kubernetes RuntimeClass](https://kubernetes.io/docs/concepts/containers/runtime-class/), [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/), [official TypeScript client](https://kubernetes-client.github.io/javascript/), [gVisor compatibility](https://gvisor.dev/docs/user_guide/compatibility/).
