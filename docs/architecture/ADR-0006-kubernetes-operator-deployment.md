# ADR-0006: Kubernetes deployment via Helm-bootstrapped Preflyt Operator

**Status:** Accepted deployment direction; not implemented
**Date:** 2026-10-08
**Related:** [PRD](../PRD.md), [incremental delivery](../roadmap/incremental-delivery.md), [execution isolation](ADR-0002-safe-execution-fixtures-remediation-contract.md)

## Decision

**Docker Compose remains the primary standalone installation. For Kubernetes, the preferred deployment is Helm → Preflyt CRDs + Operator → Preflyt Custom Resource → reconciled application.** Use the **same published versioned application images** and compatible configuration concepts in both environments. A direct application Helm chart is an optional fallback, not the preferred Kubernetes lifecycle manager.

**Helm bootstraps** the operator deployment, its RBAC, service account, CRDs and (optionally) a sample Preflyt custom resource. The Operator continuously reconciles the Preflyt instance: frontend, API, assessment workers, intelligence services as they ship, execution-controller configuration, Services, ingress, configuration, health and status. It does not become a second application API or run k6 workloads itself.

## Helm packaging and CRD lifecycle

Use separate chart packages:

- `infra/helm/preflyt-operator`: controller deployment, RBAC, service account, webhook configuration if required, and CRDs in chart `crds/`.
- `infra/helm/preflyt`: optional direct application deployment for installations that cannot run the Operator. Keep image/configuration parity and explicitly prevent dual ownership of the same resources.

Helm CRDs in `crds/` install before templates, **cannot be conditionally templated by values**, and are **not automatically upgraded or removed** by Helm. Thus **do not claim `crds.install: false` or `enableCRD: false` controls packaged CRDs**. Use Helm's `--skip-crds` for separately managed CRDs; publish an explicit, validated CRD upgrade/migration procedure. Never delete CRDs automatically on chart uninstall, as doing so can delete custom resources.

Operator install and sample instance creation can be toggled separately (e.g. `preflyt.createInstance`), but an operator chart with disabled controller should not silently create an unreconciled instance.

## Custom resource design

Proposed API: `platform.preflyt.io/v1alpha1`, kind `Preflyt`, namespace-scoped. Example **illustrative, not installed**:

~~~yaml
apiVersion: platform.preflyt.io/v1alpha1
kind: Preflyt
metadata:
  name: preflyt
  namespace: preflyt
spec:
  version: "0.1.0"
  components:
    api:
      replicas: 2
    frontend:
      replicas: 2
    worker:
      replicas: 2
  database:
    mode: external
    existingSecret: preflyt-postgres
  redis:
    mode: external
    existingSecret: preflyt-redis
  observability:
    otlp:
      endpoint: https://otel.example.com
      protocol: http/protobuf
  ingress:
    enabled: true
    host: preflyt.example.com
~~~

CRD schema must validate required configuration, mutually exclusive bundled/external dependencies, image versions, secret references, upgrade constraints and executor selection. Use Kubernetes Secrets or External Secrets; no raw provider/API keys in the custom resource or Helm values. Preserve standard OTEL variables and per-service identity.

## Profiles and ownership

- **Standalone/evaluation:** optional bundled PostgreSQL, Redis and S3-compatible evidence storage with durable PVCs and explicit data-loss/backup warnings.
- **Production:** external PostgreSQL, Redis and object storage preferred; operator validates connection references but **does not manage external databases' backups, upgrades or failover**.
- CR status conditions: Reconciling, Ready, Degraded, UpgradeBlocked, MigrationFailed, with observedGeneration and actionable reasons.
- Reconciliation must be idempotent, leader-elected, scoped by namespace and least-privilege RBAC. Prevent uncontrolled owner-reference deletion of persistent data.
- Database migration coordination, upgrade compatibility, backup prerequisites, rollback limitations and CRD conversion are explicit lifecycle designs—not assumed safe automatically.
- Operator does not bypass approved sandbox isolation for real repository code. k6 Operator is a separate controller used later for distributed performance workloads.

## Phase delivery without reordering P0–P12

- **P0:** Docker Compose remains the deployable requirement. Document CRD/configuration shape and Helm/operator packaging design; do not block already-running P0 on an unbuilt Operator.
- **P1–P3:** Ship a **minimal usable Operator** as an additive Kubernetes deployment capability once its tested chart, CRD, reconciler, installation, health, uninstall and rollback flow are complete. Prefer a dedicated release slice within the existing phase; do not declare partial scaffolding usable.
- **P4–P7:** Expand reconciliation for newly shipped components, secret/config rotation and controlled upgrades.
- **P8–P10:** Add configuration for performance workers and optional k6 Operator integration.
- **P11–P12:** Improve HA, scaling, observability, drift handling and production lifecycle safeguards.

The current repository has implemented Compose services and a locally rendered/tested [plain Kubernetes application bundle](../../deploy/kubernetes/README.md) as an interim deployment path. No chart, CRD, Operator reconciliation or live-cluster acceptance is claimed. This does not replace the preferred Operator lifecycle decision or mark its acceptance criteria complete.

## Acceptance criteria

- [ ] Helm installs the pinned CRD and Operator in a clean cluster; a Preflyt CR causes actual frontend/API/workers to become Ready.
- [ ] Operator restarts/reconciles desired state and exposes accurate status and events.
- [ ] `helm install --skip-crds` works with separately managed compatible CRDs.
- [ ] CRD upgrades follow an explicit safe versioning/migration procedure; uninstall does not unexpectedly delete persistent data.
- [ ] External dependency secrets, OTLP endpoint, image versions and resources are configurable without source edits.
- [ ] Operator RBAC is scoped and does not require cluster-admin for normal reconciliation beyond narrowly defined installation needs.
- [ ] Compose deployment and existing user workflows continue working independently.
- [ ] A real-repository execution request cannot bypass independent sandbox admission.
