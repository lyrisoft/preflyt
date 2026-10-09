# Native check runner

Preflyt supports a common check contract for Docker and Kubernetes deployments: a verified Git commit, a reviewed fixed scanner command, a bounded report and a result tied to that source and policy selection. Deployment configuration chooses the launcher. Scanner rules and policy evaluation must not fork by deployment type.

## Current verification

The Docker launcher and image-owned report wrapper have passed disposable fixtures for Gitleaks secret detection, the bundled JavaScript/TypeScript Semgrep rule, unsafe Kubernetes configuration, and Node's built-in test runner. Clean scans and tests pass; zero or skipped tests remain incomplete. These fixtures use ordinary Docker with generated source only. They do not approve execution against connected repositories, establish broad SAST coverage, verify dependency database freshness or prove end-to-end policy-gate integration.

The Kubernetes controller currently supplies runtime preflight, not completed native job dispatch. Durable dispatch, signed result ingestion and policy-gate integration remain P3 work. Local Docker availability must not enable production execution by itself.

## Shared defaults

- Source is exported from the exact Git commit, object hashes verified, and materialized into a private read-only tree. No Git hooks, archive extraction or repository-supplied host paths.
- Commands, arguments and scanner configuration belong to the reviewed image. Repository files cannot select shell commands or environment variables.
- Each job runs as UID/GID 65532, with a read-only root, no capabilities, no network, no application/cloud/GitHub/model credentials and no Docker socket.
- Each job has one CPU, 2 GiB memory, 128 processes, a five-minute deadline and bounded temporary/report storage. Reports are limited to 256 KiB. These are initial limits, not capacity guarantees.
- The image-owned wrapper returns the report before temporary mounts disappear. It does not return raw scanner logs. Secret scan reports are redacted.
- Actual container controls are checked before startup. Cleanup targets the container ID created by this attempt, never an unrelated container with a colliding name. Unconfirmed cleanup prevents a passing result.
- Reports alone are not trusted execution evidence. Results must also carry verified source, image, configuration, runtime and request provenance before affecting policy evaluation.

## Docker deployment

Run the launcher as a separate service on a dedicated runner host. The API and integration worker must not have Docker access. The runner may use the engine's default seccomp profile; never set `seccomp=unconfined`. `seccomp=default` is a filename, not Docker's built-in default profile selector.

Real repository execution requires a configured `runsc` or `kata` runtime and an independent signed review covering runtime isolation, engine configuration, organization scope and the tool inventory. `NATIVE_DOCKER_APPROVAL` carries that review; `NATIVE_RUNTIME_REVIEW_KEYS` contains trusted Ed25519 public keys. The review expires within 30 days and changes to the engine or tool inventory invalidate it. Review approval cannot be issued by the execution job itself.

The deployment must keep signing and application credentials outside scanner containers. A containerized launcher needs only its dedicated engine connection and private job storage, with the same source path visible to that engine. Do not mount a general-purpose host Docker socket into the API or worker. Docker and Kubernetes are operator choices; Docker execution does not require a Kubernetes cluster.

## Kubernetes deployment

Use the same application images, scanner images, source verification and result format. Launch ephemeral Jobs on the dedicated reviewed runtime class. Kubernetes service-account authority stays with the launcher; scanner pods receive no service-account token. Apply the existing isolation review, network policies and resource controls. The job pod must never be able to reach the application database or publish authoritative results directly.

## Build and verify disposable fixtures

From the repository root:

```sh
docker build -f docs/deployment/native-runner/Dockerfile.gitleaks -t preflyt-native-gitleaks:fixture docs/deployment/native-runner
docker build -f docs/deployment/native-runner/Dockerfile.semgrep -t preflyt-native-semgrep:fixture docs/deployment/native-runner
docker build -f docs/deployment/native-runner/Dockerfile.trivy -t preflyt-native-trivy:fixture docs/deployment/native-runner
docker build -f docs/deployment/native-runner/Dockerfile.node -t preflyt-native-node:fixture docs/deployment/native-runner
pnpm --filter @preflyt/api exec tsx scripts/native-check-fixtures.mts
```

The harness selects only generated fixtures, uses content-addressed local image IDs, creates no database records and never publishes GitHub checks. Fixture image tags are build conveniences, not production approval. Production images must be published by immutable digest and reviewed together with their configuration, licenses and any vulnerability databases. The bundled Semgrep configuration contains one dynamic-code-execution rule; extend reviewed coverage before representing it as a complete security scan. Trivy dependency scanning requires an image with a reviewed fresh offline database.
