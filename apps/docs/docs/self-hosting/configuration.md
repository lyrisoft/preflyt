---
id: configuration
title: Configuration
sidebar_label: Configuration
description: Which Preflyt settings live in environment variables and which live in Settings, with a full variable reference.
---

# Configuration

Preflyt splits configuration in two:

1. **Settings → Configuration** in the web app holds application connections and feature switches. Only a **Super Admin** can change them. They apply to every workspace.
2. **Environment variables** hold everything that must exist before the database can be read: infrastructure, encryption keys and trust controls.

## What lives in Settings

Open **Settings → Configuration** as Super Admin.

| Section | What you configure |
| --- | --- |
| GitHub | Public Preflyt API URL, App ID, client ID and secret, private key, webhook secret, installation and login callbacks, the sign-in switch and the event-ingestion switch |
| Governance | An optional separate governance App and installation ID, automatic PR check publication, ruleset activation, history import and retention |
| Single sign-on | OIDC issuer, client ID and secret, callback |
| Notifications | In-app and email switches, SMTP host, port, sender, username and password |
| Intelligence | Model configuration and advisory review switches |
| Native execution | Preflight and execution switches |

Organization-level settings stay on their own pages: AI models and provider keys, review skills, CI jobs and policies, notification channels, and **Settings → PR feedback** (PR check publication, policy summary comments and optional AI feedback). Organization Owners and Admins cannot change deployment credentials.

### How saved settings behave

- **Secrets stay hidden.** The browser never receives a saved secret, only whether one is set. Leave a secret field empty to keep the saved value. Use **Clear saved** and then **Save changes** to remove it.
- **GitHub connections refresh safely.** GitHub and optional governance credentials apply immediately in the API and within five seconds in the worker. Cached App clients and installation tokens refresh when the App key changes. OIDC and SMTP connections still require an API and worker restart; the page shows a restart notice for those changes.
- **Feature switches apply on their own.** Switches and history retention refresh every five seconds, with no restart.
- **Concurrent edits are detected.** If someone else saved first, refresh and re-apply your change.
- **Changes are audited.** The audit record stores who changed which fields and the revision, never secret values.
- **Failures fail closed.** If a read or decryption fails, live switches turn off until a read succeeds. Preflyt does not fall back to old environment values.

Environment-file edits are different: use `docker compose up -d` to recreate affected services. `docker compose restart` does not reload `.env`.

### First start and legacy values

On first start the API imports any application values it finds in the environment **once**, encrypts the secrets and stores them. After that, **database values always win**, including empty ones. On a fresh install you can leave the application values out and fill them in under Settings. You will first need the Super Admin recovery login to open the page. See [Authentication](authentication.md).

## What stays in environment variables

Keep these in your `.env` or secret manager:

- database and migration passwords,
- cache and queue URLs and prefixes,
- the public origin and HTTP port,
- the Super Admin recovery credentials and bootstrap token,
- telemetry,
- the three encryption keys,
- native execution, CI proof and attestation trust settings.

### The three encryption keys

Generate **three separate** 32-byte base64 keys with `openssl rand -base64 32`:

| Key | Protects |
| --- | --- |
| `CONFIGURATION_ENCRYPTION_KEY` | Credentials saved in Settings → Configuration |
| `GITHUB_USER_TOKEN_ENCRYPTION_KEY` | GitHub user tokens used for GitHub sign-in |
| `AI_PROVIDER_ENCRYPTION_KEY` | AI provider credentials |

Never reuse one key for another purpose, commit a value, or paste a key into Settings. Back up each key in your secret manager, independently of the database. There is no key rotation: if you replace a key, restore the original to decrypt what it protected.

## Variable reference

Defaults are what Preflyt uses when you do not set a value. A blank default means the value is unset. You only need to set the variables in the [Docker Compose](docker-compose.md) guide to get started.

### Core

| Variable | Default | Description |
| --- | --- | --- |
| `WEB_ORIGIN` | `https://preflyt.example.com` | Public origin, no trailing slash or path. Production requires HTTPS. |
| `PREFLYT_HTTP_PORT` | `8080` | Loopback port the web service publishes. |
| `PREFLYT_IMAGE_REGISTRY` | `ghcr.io/lyrisoft` | Where the images are pulled from. |
| `PREFLYT_VERSION` | | **Required.** An existing stable version (`vX.Y.Z`) or development tag (`sha-` plus the 40-character commit ID). |
| `POSTGRES_PASSWORD` | | Database owner password, used by migrations. Hexadecimal. |
| `DATABASE_APP_PASSWORD` | | Runtime database role password. Hexadecimal and different from the owner password. |
| `CONFIGURATION_ENCRYPTION_KEY` | | Encrypts credentials saved in Settings. Required. |

### Recovery and sign-in

| Variable | Default | Description |
| --- | --- | --- |
| `SUPER_ADMIN_USERNAME` | | Recovery username. Set together with the password to seed the account. |
| `SUPER_ADMIN_PASSWORD` | | Recovery password, 24 to 128 characters. Stored only as a salted scrypt hash. |
| `BOOTSTRAP_TOKEN_SHA256` | | SHA-256 hex of your out-of-band first-Owner token, for the OIDC first-Owner flow. |
| `GITHUB_USER_TOKEN_ENCRYPTION_KEY` | | Base64 of 32 random bytes. Required to enable GitHub sign-in. |

### Cache and queue

| Variable | Default | Description |
| --- | --- | --- |
| `REDIS_URL` | `redis://cache:6379/0` | Metadata cache. Override only for a separately managed service. |
| `REDIS_CACHE_PREFIX` | `preflyt:production:cache` | Key prefix for the cache. |
| `QUEUE_REDIS_URL` | `redis://queue:6379/0` | Job queue. It must not evict keys. |
| `QUEUE_PREFIX` | `preflyt:production:queue` | Key prefix for the queue. |

:::caution Keep the queue separate
The cache evicts under memory pressure. The queue must use `noeviction` with persistence. Do not point both at the same evicting instance. Different Redis database numbers do not isolate memory.
:::

### Telemetry

Telemetry is off until you provide an endpoint. See [Observability](observability.md).

| Variable | Default | Description |
| --- | --- | --- |
| `OTEL_SDK_DISABLED` | `true` | Set to `false` to enable OpenTelemetry. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | | OTLP base endpoint. |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | `http/protobuf` or `grpc`. |
| `OTEL_EXPORTER_OTLP_HEADERS` | | Encoded exporter headers. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | | Full traces URL (HTTP includes `/v1/traces`). |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | | Full metrics URL. |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | | Full logs URL. |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | `3000` | Export timeout in milliseconds. |
| `OTEL_TRACES_EXPORTER` | `otlp` | Traces exporter. |
| `OTEL_METRICS_EXPORTER` | `otlp` | Metrics exporter. |
| `OTEL_LOGS_EXPORTER` | `otlp` | Logs exporter. |
| `OTEL_RESOURCE_ATTRIBUTES` | `service.namespace=preflyt,deployment.environment.name=production` | Resource attributes. |
| `OTEL_TRACES_SAMPLER` | `parentbased_traceidratio` | Sampler. |
| `OTEL_TRACES_SAMPLER_ARG` | `0.1` | Sampling ratio. |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000` | Metric export interval in milliseconds. |
| `OTEL_PROPAGATORS` | `tracecontext,baggage` | Context propagators. |
| `COLLECTOR_UPSTREAM_ENDPOINT` | | OTLP HTTP base URL the optional collector forwards to. |
| `COLLECTOR_UPSTREAM_HEADERS` | `{}` | JSON object of upstream headers, for example `{"Authorization":"Bearer <token>"}`. |

### Notifications

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_ALLOW_INSECURE_LOCAL` | `false` | Development only. Allows a loopback SMTP server without TLS. Ignored in production. |

### CI evidence and governance trust

Normal Action onboarding verifies the GitHub run, attempt, commit and completed jobs directly through the GitHub App. Report signatures are optional, including for private repositories; no GPG key or external signer is required. The variables below configure additional signed-report verification for deployments that explicitly use it. See the [advanced trust runbook](https://github.com/lyrisoft/preflyt/blob/development/docs/deployment/github-governance-production.md); it is not the basic onboarding path.

| Variable | Default | Description |
| --- | --- | --- |
| `CI_REPORT_PROOF_MODE` | `github-native` | Verification of optional report signatures: GitHub attestations (`github-native`) or a configured organization signer (`organization-key`). Neither is required for the normal GitHub job-verification path. |
| `CI_ORGANIZATION_SIGNER_KEYS` | | Public-key allowlist JSON. Never include private keys. |
| `CI_ATTESTATION_GH_PATH` | | Absolute container path of the reviewed GitHub CLI executable used to verify attestations. |
| `CI_ATTESTATION_GH_SHA256` | | SHA-256 of that exact binary, lowercase hexadecimal. |
| `CI_ATTESTATION_ROOT_PATH` | | Absolute container path of the reviewed Sigstore trusted-root file. |
| `CI_ATTESTATION_ROOT_SHA256` | | SHA-256 of that exact file, lowercase hexadecimal. |
| `CI_ATTESTATION_WORKFLOWS` | | JSON array of exact signer workflow paths, `owner/repo/.github/workflows/file.yml`. |
| `CI_EXECUTION_CONTRACTS` | | Reviewed JSON array of contracts. Each pins a rule ID, signer workflow, reviewed commit, report format and tool version. Set by the deployer, never by users. |
| `PREFLYT_ATTESTATION_DIR` | | Host directory mounted by the reviewed evidence Compose override. |
| `GITHUB_GOVERNANCE_LOCAL_ACCEPTANCE` | `false` | Must stay `false` in production. For disposable local acceptance only. |

### Native execution

Native execution is disabled by default and needs its own reviewed controller. See [Native execution](../user-guide/native-execution.md) for prerequisites, supported adapters and remaining acceptance limits.

| Variable | Default | Description |
| --- | --- | --- |
| `NATIVE_RUNTIME_BACKEND` | `kubernetes` | Explicit runtime backend: `kubernetes` or `docker`. No fallback after failed review. |
| `NATIVE_DOCKER_APPROVAL` | | Signed independent approval for the Docker backend; use instead of a Kubernetes runtime approval. |
| `NATIVE_RUNTIME_APPROVAL` | | A signed independent review of the execution runtime (an Ed25519 signed token). It expires within 30 days. |
| `NATIVE_RUNTIME_REVIEW_KEYS` | `[]` | JSON array of trusted Ed25519 public keys (`kid` and PEM) that verify that review. |
| `NATIVE_CONTROLLER_API_KEY` | | Random key of 32 to 256 characters shared by the API, worker and execution controller. |
| `NATIVE_TOOL_REVIEWS` | `[]` | JSON array of reviewed tools: rule, image pinned by `@sha256:` digest, version, licence, configuration hash and expiry (at most 30 days). Repository-supplied commands are never accepted. |

### Intelligence

| Variable | Default | Description |
| --- | --- | --- |
| `AI_PROVIDER_ENCRYPTION_KEY` | | Base64 of 32 random bytes. Separate from every other key. |

Models and endpoints are created by organization admins under **AI Intelligence**, not in the environment.
