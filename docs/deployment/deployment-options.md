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

Database, queue and application volumes must survive application replacement. Neither option may reset data during installation, upgrades or tests. Secrets come from deployment configuration and never from images. Scanner containers do not receive platform secrets.

The Compose stack, application Dockerfiles and [Kubernetes bundle](../../deploy/kubernetes/README.md) exist. The Kubernetes bundle is rendered and statically tested; live deployment acceptance and complete native dispatch/result integration remain outstanding.

See [Compose operations](../operations/docker-compose.md) for existing application deployment and [native runner](native-runner/README.md) for scanner execution defaults and current verification limits.
