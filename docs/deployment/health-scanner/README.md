# Automatic repository Health scanner

User flow: **connect GitHub → select repository → scan**. No runtime approval,
policy, standards selection or GitHub workflow is needed for Health. This service
is part of the self-hosted installation, configured once by the deployment operator.

## Local development

With Docker running, from the repository root:

```sh
pnpm --filter @preflyt/api start:health-scanner:dev
```

The bootstrap builds pinned packaged images, inspects effective Linux isolation,
generates its own identity and TLS certificate, and writes the protected connection
file automatically. The usual API and worker discover that file. It does not load
API dotenv or receive database, GitHub, AI or application secrets. Keep it running
alongside the API and worker. First startup downloads scanner images and a Trivy
database; subsequent startup reuses immutable cached images.

## Docker Compose installation

The normal Docker deployment now includes `health-engine`, `health-init` and
`health-scanner`. Download `compose.yaml`, create the documented `.env`, and run:

```sh
docker compose up -d --wait
docker compose ps
```

No source checkout, scanner environment file, manual directory ownership, certificate
creation or connection-file transfer is required. The published scanner image bundles
the five built tool images and their initial vulnerability database. First startup
checks the archive hashes and loads the pinned images into the dedicated engine;
it does not compile tools or require another registry login. The larger scanner
image still needs to be downloaded. Use `docker compose logs -f health-scanner`
for progress. Subsequent starts reuse the exact engine images. API/worker startup
is gated on an authenticated scanner readiness check. Source development outside
Compose retains its local build path.

Use at least 4 CPUs, 8 GiB of Docker memory and 20 GiB of free disk. Docker Desktop
runs the nested engine in its Linux VM; a Linux Docker host must permit privileged
Docker-in-Docker. The nested engine is the only privileged service. It receives no
host Docker socket or host directory, has no published ports, and has only its own
engine storage, engine TLS certificates and a read-only view of scanner job storage.
It is a separate daemon, not a separate machine. Use a dedicated application Docker
host in production; this setup does not claim VM-equivalent isolation.

The one-shot initializer sets scanner volume ownership to UID/GID 1000 and copies
only the generated engine client certificates to the scanner's private TLS volume.
Scanner signing identity and HTTPS key live in `health_state`. API and worker mount
only `health_connection` read-only. The scanner and engine resolve job source files
at the identical `/var/lib/preflyt/health-jobs` path. No engine credentials, signing
keys or source directories are mounted into API or worker.

The release publishes `preflyt-health-scanner` with the same version as the application.
Existing versions without that package cannot run the new Compose file: use a release
that includes bundled Health. For a source checkout, the usual `docker compose build`
builds the scanner target and its tool archives too. Native Dockerfiles remain the
source of truth: after editing one, run `node scripts/deploy/scanner-stages.mjs`
and verify `node --test scripts/deploy/scanner-stages.test.mjs`.

An optional synthetic acceptance check runs all eight static analyzers, verifies a
redacted generated finding and signed result, and confirms source cleanup:

```sh
docker compose exec -T api node dist/health/health-scanner-smoke.js
```

This is deployment-fixture evidence; it does not establish a real GitHub connection,
repository assessment, CI checks, AI provider setup or production qualification.

The older `controller.compose.yaml`, `scanner.env.example` and
`application.compose.yaml` remain reference manifests for operators integrating a
separate scanner host into a custom deployment. They are not extra steps in the
normal Compose installation.

## Security and scope

Only the eight fixed Health adapters are admitted. Repository-provided commands,
scanner configuration, tests, installs and builds are rejected. Containers run as
non-root with read-only source and filesystem, no network, no capabilities,
no-new-privileges, bounded CPU/memory/PIDs and execution deadlines. Bootstrap uses
gVisor or Kata when installed, otherwise the hardened runc static-scanner profile.
This is not a claim that runc offers VM-equivalent isolation. General native
repository-command execution retains its separate strong-isolation approval.

The application worker has a 1 GiB memory budget for the bounded source export and authenticated transfer.

The source export proves the original Git commit tree and the regular-file subset
actually mounted. Binary assets, oversized files, generated/vendor directories,
links and submodules are excluded and counted in the report. Source export has
bounded file/byte limits; limits or unavailable source never become passing checks.
Every signed result binds organization, repository, exact commit, source hash,
scanner package and job. Private source is deleted after completion/cancellation;
the application retains reports and redacted finding locations. Completed source-free scanner journals are retained for seven days; active jobs and pending cleanup are never pruned.

Dependency images refresh automatically when the vendor database approaches its
24-hour limit. New packages are applied only while idle. Refresh failure leaves
stale dependency evidence incomplete while other analyzers remain usable.

Local acceptance covers all eight scanner containers, signature verification,
source identity and cleanup. Real repository acceptance and container deployment
must be recorded separately; no GitHub workflow has been run for this change.

## Local acceptance — 13 October 2026

The live `lyrisoft/maiguard-api` main-branch assessment at commit
`6d3a4faa9c421e40e5422afe121f0f59fc3efe07` completed through the normal Health UI,
without standards, a workflow or runtime approval. Assessment
`a5f55317-980a-448c-809b-ce67abefb33f` verified 3,647 retained source files and
recorded 30 excluded files. The signed result and source cleanup were checked.
Gitleaks reported 83 potential secrets; 16 redacted findings were retained within
the receipt budget. These are detector matches, not confirmed exposed credentials.

Maintainability and hotspot scans passed their recorded scope. Static-security
analysis reported parse/processing errors; dependencies and reliability did not
produce an accepted bounded report; duplication had no verified measurement.
The report is **partial**, with three of seven analyzer outputs recorded as
completed. Those missing metrics remain unavailable. This acceptance proves
automatic admission, isolation, source-bound results and the UI flow; it does
not prove complete analysis of this repository or production deployment.

Coverage remains unavailable until test execution supplies a measured report.
Static scans and detected test files cannot establish a coverage percentage.

## Tests and coverage

Health runs eight fixed static analyzers. Repository tests, dependency installation
and arbitrary build commands are not admitted by the scanner. Verified test and
coverage evidence comes from CI for the assessed commit. See the
[Health user guide](../../../apps/docs/docs/user-guide/repository-health.md).
