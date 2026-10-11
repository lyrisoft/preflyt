# Deployment options

Preflyt should run entirely as containers with either Docker Compose or Kubernetes. Keep one set of application images and configuration contracts; deployment manifests choose the orchestrator. Do not introduce a separate application implementation, policy format or check result format for each option.

| Component | Docker Compose | Kubernetes |
| --- | --- | --- |
| Web | Web container with same-origin API proxy | Same web image behind an Ingress |
| API | API runtime image | Same API image in a Deployment |
| Background worker | API image with worker command | Same image and command in a Deployment |
| Database migrations | One-shot migration service before API startup | Migration Job completed before rollout |
| PostgreSQL | Persistent database service | Persistent database service or operator-provided PostgreSQL |
| Cache and durable queue | Separate Valkey services | Separate Valkey services or operator-provided equivalents |
| Native checks | Dedicated Docker launcher and ephemeral containers | Dedicated launcher and ephemeral Jobs |
| Telemetry | Optional OTLP endpoint/collector | Same OTLP configuration |

Database, queue and application volumes must survive application replacement. Neither option may reset data during installation, upgrades or tests. Super Admin provisions managed application connections and feature switches in **Settings → Configuration**; the API imports allowlisted legacy environment values once, and saved database values then take precedence. API and worker both decrypt the complete managed configuration using the same deployment-managed encryption root. They are trusted application processes; a separate production governance App and fresh purpose-limited tokens preserve the action/permission boundary. Keep infrastructure, encryption roots, telemetry and native/evidence trust controls in deployment secrets/configuration, never images. Web, migration, execution controllers and scan containers receive neither managed App credentials nor the configuration encryption root. Controllers retain only their dedicated runtime/signing credentials. See [deployment configuration](../operations/deployment-configuration.md).

Restart all API and worker processes after managed connection edits. Feature switches refresh every five seconds; worker consumers apply them on their next reconciliation tick. A failed configuration read/decryption disables live capabilities rather than restoring legacy environment settings.

The Compose stack, application Dockerfiles and [Kubernetes bundle](../../deploy/kubernetes/README.md) exist. Native Docker/Kubernetes dispatch, source verification, signed result ingestion and policy-gate integration are implemented and fixture-tested. Generated local Kubernetes fixtures have exercised PASS, FAIL and INCOMPLETE lifecycle outcomes, scheduling-gate admission and UID-owned cleanup. The bundle’s rendering/static checks and generated-source fixtures do not establish a production deployment or effective isolation. Complete supported native coverage, independent gVisor/Kata isolation review, production cluster acceptance and live release/governance verification remain outstanding. Execution stays disabled without current review.

For GitHub Actions policies, use the [stable GitHub connection guide](stable-github-connection.md); the normal workflow path does not require a signer or native execution controller.

See [Compose operations](../operations/docker-compose.md) for existing application deployment and [native runner](native-runner/README.md) for scanner execution defaults and current verification limits.
