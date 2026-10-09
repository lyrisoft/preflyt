# Kubernetes deployment

This bundle uses the same web, API, worker and migration images as Docker Compose. It includes PostgreSQL, a disposable cache and a persistent queue, so managed database services are optional. It does not add application code or install an operator/Helm dependency.

The bundle is a single-instance starting point. PostgreSQL and queue storage use retained PVCs and your cluster's default storage class. Cluster backups, external TLS/Ingress, registry access and production capacity remain operator responsibilities. No host ports, host paths, cluster roles or application service-account tokens are installed. The namespace enforces restricted Pod Security; database/cache ingress is limited to application clients. Application egress is available for GitHub, identity providers and configured integrations.

## Configure

1. Use an explicitly selected cluster context; never rely on your current context. Create namespace `preflyt` before installing secrets.
2. Replace the development image placeholders in `resources.yaml` and `migration.yaml` with the reviewed, published immutable release digests. API and worker must use the same API image. This checkout does not imply those release images already exist in a registry.
3. Set `WEB_ORIGIN` in `preflyt-config` to the HTTPS public origin. The web container proxies `/api/` to the `api` Service. Configure an Ingress/TLS controller for the `web` Service on port 8080; API and databases stay internal.
4. Provision the following Secrets from protected files or your secret manager. Do not commit their values or put them in shell arguments:

| Secret | Required values |
| --- | --- |
| `preflyt-db-secrets` | `POSTGRES_PASSWORD`, `DATABASE_APP_PASSWORD` |
| `preflyt-migration-secrets` | `DATABASE_URL` for the `preflyt_owner` role at `db:5432/preflyt` |
| `preflyt-api-secrets` | `DATABASE_URL` for `preflyt_app`; enabled authentication/integration settings |
| `preflyt-worker-secrets` | `DATABASE_URL` for `preflyt_app`; only enabled worker GitHub, SMTP, CI proof and telemetry settings |

Use fresh URL-safe database passwords; the URLs and password Secrets must agree. The initialization script creates the restricted application role on an empty database volume. Editing a Secret does not rotate a password in an existing database. Application pods never receive migration owner credentials. Web receives no application Secrets.

For GitHub login, include `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_USER_TOKEN_ENCRYPTION_KEY` and `GITHUB_LOGIN_CALLBACK_URL=https://your-origin/api/auth/github/callback` in API configuration, then enable the flag in the ConfigMap. Register that exact callback. Worker credentials depend on enabled background features. The encryption key must remain stable across pod replacement. Use the same existing application environment contract for OIDC, GitHub governance, CI proof and notifications; this bundle does not invent alternative authentication.

## Install and roll out

All application Deployments initially have zero replicas. This deliberately prevents application startup before a successful migration. Database, cache and queue start first. Render locally without cluster access:

```sh
kubectl kustomize deploy/kubernetes > /private/tmp/preflyt-rendered.yaml
```

After configuring images, Secrets and the public origin, run the following against your chosen context. Replace `YOUR_CONTEXT`; these commands do not choose a cluster for you.

```sh
kubectl --context YOUR_CONTEXT apply -k deploy/kubernetes
kubectl --context YOUR_CONTEXT -n preflyt rollout status statefulset/db --timeout=180s
kubectl --context YOUR_CONTEXT -n preflyt rollout status statefulset/queue --timeout=180s
kubectl --context YOUR_CONTEXT -n preflyt rollout status deployment/cache --timeout=180s
kubectl --context YOUR_CONTEXT apply -f deploy/kubernetes/migration.yaml
kubectl --context YOUR_CONTEXT -n preflyt wait --for=condition=complete job/preflyt-migrate --timeout=600s
# Proceed only if the migration completed successfully.
kubectl --context YOUR_CONTEXT -n preflyt scale deployment/api deployment/worker deployment/web --replicas=1
kubectl --context YOUR_CONTEXT -n preflyt rollout status deployment/api --timeout=180s
kubectl --context YOUR_CONTEXT -n preflyt rollout status deployment/worker --timeout=180s
kubectl --context YOUR_CONTEXT -n preflyt rollout status deployment/web --timeout=180s
```

The migration Job has no retry and a ten-minute deadline. A failed Job does not authorize scaling the applications. Diagnose and preserve its logs; do not reset the database or mark migrations applied without repair. Readiness verifies application/database reachability, not every product workflow.

## Upgrade and recovery

This initial bundle uses an explicit maintenance rollout. Preserve old image digests, take and rehearse a protected database backup, review schema compatibility, then scale API/worker/web to zero. Update immutable images and configuration, apply the bundle, remove only the previous completed migration Job after preserving its diagnostic record, and run the new migration Job. Scale applications up only after migration success. Do not delete PVCs, PostgreSQL or queue data during an upgrade. Applying the base bundle resets application replicas to zero by design; use the documented rollout sequence rather than applying it casually to a running installation.

Restore into a new database target before a recovery cutover; never overwrite the sole original copy. Roll back application images only when compatible with the current schema. Cluster backup/storage retention and a live restore rehearsal must be verified for your environment.

## Native checks and verification status

Native execution remains disabled by default. Scanner jobs belong to a dedicated reviewed execution environment, not to the application namespace. See [native runner](../../docs/deployment/native-runner/README.md) for shared Docker/Kubernetes check contracts and remaining P3 dispatch work. Do not grant the API or integration worker Kubernetes Job or Docker control as a shortcut.

The restricted PostgreSQL startup and application-role initialization are also checked with `pnpm --filter @preflyt/api exec tsx scripts/kubernetes-storage-fixtures.mts` using a new ephemeral database container, without application credentials or persistent volumes. This verifies the storage container controls, not Kubernetes scheduling or CSI volume behavior.

The bundle is locally rendered and checked for security, persistence, credentials and Compose parity. It has not been applied to a production cluster or accepted as a complete deployment. No existing user cluster was touched.

References: [Kubernetes security contexts](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/) and [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/).


### Advisory AI reviews

Enable `AI_CONFIGURATION_ENABLED` and `AI_REVIEWS_ENABLED` in `preflyt-config` only after model/skill setup. Supply the same separate stable `AI_PROVIDER_ENCRYPTION_KEY` in API and worker Secrets. The existing worker processes explicit evidence-only reviews; it needs model egress, not runtime-control permissions. See [review skills deployment](../../docs/operations/review-skills.md).
