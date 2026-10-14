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

## Container installation

Build the new target locally (it has not been published by this change):

```sh
docker build --target health-scanner -f deploy/api.Dockerfile -t preflyt-health-scanner:local .
```

1. Use a dedicated Linux scanner host/engine, separate from the application host.
   Configure the engine with mutually authenticated TLS and seccomp, memory and
   PID enforcement. Do not expose unauthenticated engine ports or give the API or
   worker a Docker socket. The engine and scanner must see the same source directory
   at `/var/lib/preflyt/health-scanner`.
2. Create `/var/lib/preflyt/health-scanner` and `/var/lib/preflyt/health-connection`,
   owned by UID/GID 1000 with mode 0700. Copy `scanner.env.example` to `scanner.env`
   beside `controller.compose.yaml`. Install the engine's TLS client certificate,
   key and CA in `docker-tls`, readable only by the scanner user. These are deployment
   credentials, not user or per-repository approvals.
3. Set `HEALTH_SCANNER_ORIGIN` to the reachable private TLS endpoint. Its certificate
   includes the DNS name `health-scanner`; configure that private DNS name on the
   application network. Set `PREFLYT_SCANNER_BIND_IP` to the scanner host's private
   interface, restrict ingress to API/worker, then start the supplied controller
   Compose file. Bootstrap verifies isolation and creates the connection file.
4. Transfer **only** `health-connection/connection.json` to a protected directory
   on the application host. Keep mode 0600 and ownership matching the API/worker
   user. Do not transfer scanner identity, signing key, TLS private key, engine
   credentials or source journal. Set `PREFLYT_HEALTH_CONNECTION_DIRECTORY` and
   combine `application.compose.yaml` with the root stack. The connection directory
   is mounted read-only in API and worker. HTTPS validates the pinned certificate;
   requests are authenticated and signatures are checked against the pinned key.
5. Connect GitHub and select a repository in Preflyt. The initial scan queues
   automatically; existing selected repositories can use **Reassess**. No policy
   or approval screens are involved.

## Security and scope

Only the eight fixed Health adapters are admitted. Repository-provided commands,
scanner configuration, tests, installs and builds are rejected. Containers run as
non-root with read-only source and filesystem, no network, no capabilities,
no-new-privileges, bounded CPU/memory/PIDs and execution deadlines. Bootstrap uses
gVisor or Kata when installed, otherwise the hardened runc static-scanner profile.
This is not a claim that runc offers VM-equivalent isolation. General native
repository-command execution retains its separate strong-isolation approval.

The root worker has a 1 GiB memory budget for the bounded source export and authenticated transfer.

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

## Automatic repository test coverage

After upgrading, apply the API migrations and restart the Health scanner while idle.
Startup builds and inventories the package-owned `Dockerfile.coverage` image. The
API and worker do not need Docker access or repository package-manager credentials.
Repository Health assessments capture their test settings and request coverage by
default. Older reports are preserved; reassess to collect a new measurement.

The dedicated host needs access to the public npm registry for dependency preparation.
That phase uses fixed package-manager commands with repository scripts and hooks
removed. Test execution is a separate network-disabled container. Both phases run
nonroot with read-only roots, dropped capabilities, no-new-privileges, bounded CPU,
memory and PIDs. Their shared dependency workspace is a 2 GiB tmpfs volume, removed
after the job. Restart recovery removes only resources whose ownership label matches
the recorded job. No application credentials or Docker socket enter either container.

Supported packages use Vitest, Jest or Node tests with npm, pnpm 10 or Yarn Classic
lockfiles. Private registries, external test services, install-script-dependent native
modules and browser installations need a different execution environment; they remain
incomplete with an actionable reason. No GitHub Actions workflow is started. See the
[Health user guide](../../../apps/docs/docs/user-guide/repository-health.md) for command
settings and measured coverage scope.
