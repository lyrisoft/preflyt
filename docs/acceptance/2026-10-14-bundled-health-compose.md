# Bundled Health scanner Docker deployment

## Delivered behavior

The application Compose stack now starts the Health scanner automatically. A
dedicated Docker-in-Docker engine generates TLS credentials; a one-shot initializer
prepares private named volumes and copies only client TLS material to the scanner.
The scanner prepares its fixed tools, generates its HTTPS/signing identity and
writes the protected application connection file. API and worker start after an
authenticated scanner readiness check. There is no separate scanner command,
environment file, host directory preparation or manual connection transfer.

The generated standalone Compose download includes the same services and named
volumes, with no source-checkout paths. `preflyt-health-scanner` is included in
commit and versioned release publication. Changes to its packaged analyzer inputs
now trigger application image publication. Documentation covers startup progress,
requirements, private image access and scanner diagnostics. Browser verification
also corrected first-install instructions to open `/sign-in`, since `/` serves the
product page.

## Isolation boundary

Only `health-engine` is privileged, as required for nested Docker. It has no host
Docker socket, host directory mounts or published ports. The scanner receives
engine client credentials; API/worker receive only its HTTP connection file,
mounted read-only. Engine storage, job/source storage, signing identity and
connection storage are separate volumes. BuildKit's client and daemon can reach
public registries during fixed-tool preparation; repository scanner containers
retain their enforced network-disabled, non-root, read-only source profile.

The nested engine shares its host kernel. This is not VM isolation, general
repository-command admission or production qualification. A dedicated application
Docker host is recommended for production. Tests and coverage remain CI evidence;
the Health scanner does not execute repository tests.

## Local verification

Executed on Docker Desktop, Linux/arm64, Engine 29.8.2, Compose 5.6.0, 4 CPUs and
approximately 5.54 GiB available Docker memory. Deployment guidance recommends
8 GiB and 20 GiB of disk; this run is not a capacity qualification.

- Built API, migration, web and Health scanner images locally from the branch.
- Started a fresh isolated project from a standalone folder containing the
  generated `compose.yaml` and a protected generated `.env`, with no source mounts.
- PostgreSQL, cache, queue, engine, scanner, API, worker and web became healthy;
  migration and scanner initialization exited successfully.
- Verified effective nested-engine seccomp, memory and PID support. Prepared
  Gitleaks and Semgrep images were confirmed arm64.
- Applied all 61 migrations to a fresh database. The runtime database role has no
  superuser, create-database or create-role privilege.
- Passed HTTP smoke checks for health, direct SPA routing, anonymous access,
  origin enforcement, administrator authentication/session/logout, masked
  configuration, and a persisted/restored notification setting.
- Verified `/sign-in` → **Set up Preflyt** → **Start setup** → administrator login
  → **Engineering Overview** → **Configure GitHub** in Chrome.
- Executed all eight static analyzers on generated, credential-free source. The
  smoke test requires usable results, detection of a generated fake token,
  retained redacted findings, an exact-scope signed receipt and confirmed cleanup.
  A tiny initial fixture correctly produced an unavailable duplication scope;
  the final fixture contains enough duplicated code to exercise its measurement.
- Replayed migrations with no pending changes, ran the standalone backup script
  (nonempty file, mode 0600), and restored into a separate fixture database.
  Original and restored counts matched: one identity and 61 applied migrations.
- Stopped and restarted the entire standalone stack with the finalized images.
  All eight long-running services returned healthy, both one-shot services exited
  successfully, and the protected connection-file fingerprint was unchanged.
  The packaged eight-analyzer smoke passed again after restart without file
  copying, manual certificate changes or a separate scanner command.
- Passed 20 focused scanner/deployment regressions and 20 release/scope tests,
  API compilation, documentation generation/build and deployment asset checks.

The initial full-stack attempt exposed a missing BuildKit-client egress network;
that configuration was corrected before the successful scanner startup. No host
Docker socket or scanner isolation bypass was used to resolve it.

## Release and acceptance limits

The running trial uses locally built images. GHCR anonymous access was rejected
before this implementation because the packages are private and Docker has no
GHCR login. Registry/package visibility was not changed. A matching release must
publish the new Health scanner image before the updated public Compose download
can be used with published images; the existing `v0.1.0` is not this qualification.

No GitHub App, external identity provider, SMTP server or AI provider was added to
the fresh trial. Live GitHub owner onboarding, real-repository Health, incoming
webhooks/CI assessments, AI reviews and external TLS remain separate acceptance
steps after their normal connection configuration. No GitHub workflow, package
release, public documentation deployment or production deployment was run by
this local acceptance.
