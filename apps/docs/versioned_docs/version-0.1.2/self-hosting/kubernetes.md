---
id: kubernetes
title: Kubernetes
sidebar_label: Kubernetes
description: Deploy Preflyt to Kubernetes with the single-instance manifest bundle.
---

import { CurlDownload } from '@site/src/components/Download'
import {InstallationVersion} from '@site/src/components/InstallationVersion'

# Kubernetes

<span className="badge-status badge-available">Available</span> as a single-instance manifest bundle. It is rendered and fixture-tested, but **not accepted on a live production cluster**. Helm and Operator packaging are planned and **not implemented**.

The bundle (the `kubernetes` folder) uses the **same** web, API, worker and migration images as Docker Compose. It includes PostgreSQL, a disposable cache and a persistent queue, so a managed database is optional.

## What you provide

- A cluster and an explicitly selected `kubectl` context. Never rely on your current context.
- An Ingress and TLS controller for the `web` Service on port 8080. The API and databases stay internal.
- Network access to GHCR and a published Preflyt release to run. Public release images do not require an image-pull secret.
- Storage with backups, and capacity planning. Database and queue storage use retained PVCs on the default storage class.

The namespace enforces restricted Pod Security. No host ports, host paths, cluster roles or application service-account tokens are installed.

<InstallationVersion />

## Get the bundle

```bash
mkdir preflyt-k8s && cd preflyt-k8s
```

<CurlDownload file="kubernetes.tgz" />

```bash
tar -xzf kubernetes.tgz && cd kubernetes
```

The folder contains `kustomization.yaml`, `resources.yaml` and `migration.yaml`.

## Configure

1. **Create the namespace** `preflyt`. The release images are public, so no GHCR credentials or image-pull secret are needed:

   ```bash
   kubectl --context YOUR_CONTEXT create namespace preflyt
   ```

2. **Keep the matching images.** The downloaded bundle already pins all application images to the version shown above. For stronger guarantees, use the corresponding image digests. The API and worker must use the **same** API image.
3. Set `WEB_ORIGIN` in the `preflyt-config` ConfigMap to your public HTTPS origin.
4. Create the Secrets in the next table from protected files or your secret manager, not shell arguments.

| Secret | Required values |
| --- | --- |
| `preflyt-db-secrets` | `POSTGRES_PASSWORD`, `DATABASE_APP_PASSWORD` |
| `preflyt-migration-secrets` | `DATABASE_URL` for the `preflyt_owner` role at `db:5432/preflyt` |
| `preflyt-api-secrets` | `DATABASE_URL` for `preflyt_app`; `CONFIGURATION_ENCRYPTION_KEY`; the identity and provider encryption keys; deployment trust settings |
| `preflyt-worker-secrets` | `DATABASE_URL` for `preflyt_app`; the **same** `CONFIGURATION_ENCRYPTION_KEY`; provider keys; CI proof and telemetry settings |

Use fresh URL-safe passwords. The URLs and password Secrets must agree. Editing a Secret does not rotate a password in an existing database. Application pods never receive the migration owner credentials, and the web pod receives no application Secrets.

Provision GitHub, sign-in and notification settings in **Settings → Configuration**, as for Compose. See [Configuration](configuration.md).

## Install and roll out

All application Deployments start at **zero replicas** on purpose, so nothing starts before a successful migration. Preview the rendered manifests without cluster access:

```bash
kubectl kustomize . > rendered.yaml
```

Then, replacing `YOUR_CONTEXT`:

```bash
kubectl --context YOUR_CONTEXT apply -k .
kubectl --context YOUR_CONTEXT -n preflyt rollout status statefulset/db --timeout=180s
kubectl --context YOUR_CONTEXT -n preflyt rollout status statefulset/queue --timeout=180s
kubectl --context YOUR_CONTEXT -n preflyt rollout status deployment/cache --timeout=180s

kubectl --context YOUR_CONTEXT apply -f migration.yaml
kubectl --context YOUR_CONTEXT -n preflyt wait --for=condition=complete job/preflyt-migrate --timeout=600s

# Continue only if the migration completed successfully.
kubectl --context YOUR_CONTEXT -n preflyt scale deployment/api deployment/worker deployment/web --replicas=1
kubectl --context YOUR_CONTEXT -n preflyt rollout status deployment/api --timeout=180s
kubectl --context YOUR_CONTEXT -n preflyt rollout status deployment/worker --timeout=180s
kubectl --context YOUR_CONTEXT -n preflyt rollout status deployment/web --timeout=180s
```

The migration Job has no retry and a ten-minute deadline. A failed Job does not authorize scaling up. Keep its logs, and never reset the database or mark a migration applied without repair.

## Upgrade and recovery

Use a maintenance rollout:

1. Preserve the old image digests, and take and rehearse a protected database backup.
2. Review schema compatibility, then scale API, worker and web to zero.
3. Update images and configuration, apply the bundle, remove only the previous completed migration Job (after saving its diagnostics), and run the new migration Job.
4. Scale up only after the migration succeeds.

Do not delete PVCs or queue or database data during an upgrade. **Applying the base bundle resets replicas to zero by design**, so follow the sequence above rather than applying it casually to a running installation. Restore into a new database before a recovery cutover.

Saved GitHub and governance connections refresh immediately in the API and within five seconds in workers. OIDC and SMTP edits still require restarting all API and worker replicas. Coordinate authentication restarts to avoid mixed snapshots. For environment changes, update the deployment configuration and roll out new pods; restarting a pod alone does not change its configuration.

## Native checks

Native execution stays disabled by default. Scanner jobs belong in a dedicated, reviewed execution environment, not the application namespace. Do not give the API or worker Kubernetes Job or Docker control as a shortcut.


## Shared repository-assessment runner

A Kubernetes-hosted Preflyt can use the same dedicated Docker controller as a Compose-hosted instance. The download includes the sibling `kubernetes-shared-docker-runner` folder. From the `kubernetes` folder, render that overlay instead of the base when choosing the shared Docker backend:

```bash
kubectl kustomize ../kubernetes-shared-docker-runner > preflyt-shared-runner.yaml
```

This render selects the Docker backend for API and worker and leaves admission disabled. It does not install a Docker engine, mount a socket or create native Kubernetes jobs. Use the existing reviewed Docker controller endpoint, Docker approval, reviewer public keys, analyzer reviews and application-side controller key through the deployment configuration/Secrets. Controller signing keys and engine TLS credentials stay on the dedicated controller. Enable admission only after actual runtime qualification; imported CI and repository inspection remain available while it is disabled.

Native Kubernetes jobs are a separate optional backend; Kubernetes hosting alone does not require them.
