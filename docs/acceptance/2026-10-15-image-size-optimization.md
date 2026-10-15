# Local image size optimization — 15 October 2026

**Result:** optimized local ARM64 images pass functional regression and documentation Compose acceptance. No commits, pushes, registry publication or visibility changes.

## Measured sizes

Docker-reported local image sizes, measured with `docker image inspect` before and after on the same machine. These are not registry transfer sizes or unique disk consumption; layers can be shared.

| Image | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| preflyt-api | 1,128.09 MB | 885.20 MB | 21.53% |
| preflyt-api-migration | 1,397.16 MB | 737.14 MB | 47.24% |
| preflyt-health-scanner | 3,191.45 MB | 2,488.17 MB | 22.04% |
| preflyt-web | 100.62 MB | 100.62 MB | 0.00% |

The sum of these four reported image sizes fell by 1.606 GB (27.61%). This sum double-counts any shared layers and is not a promise of that much unique storage or network savings. Web changed only incidental image metadata; its application payload remains approximately 101 MB.

## Changes

- Added a dependency-graph exporter that preserves complete installed package contents, upstream licenses, native binaries, transitive dependencies and required peers, including separate package versions. It fails on missing required dependencies.
- API retains all declared production dependencies, including Kubernetes support. Only the Prisma client’s explicitly optional Prisma CLI and TypeScript generator peers are omitted; their build-time work is already complete. Runtime check confirms Prisma CLI, TypeScript and Prisma Studio are absent from the API dependency inventory.
- Migration contains Prisma, dotenv, their dependency closure, schema/configuration and migrations. It invokes the Prisma CLI directly with Node; it no longer includes the full API/build workspace.
- Scanner has its own traced entry-point dependency closure and no longer inherits the API dependency tree. Its Docker CLI/buildx, all eight analyzers, bundled offline database, source cleanup, signed receipts, refresh build path and isolation settings are preserved.
- Package managers remain in the build stage. Git remains in the API/controller runtime where needed; scanner/migration do not inherit it. No analyzer functionality or rule set was removed to reduce size.

## Verification

- Full API suite: **1,737 passed across 161 files**, including the exact published Action v2.1.1 contract with no skipped case. API lines coverage: 83.73%.
- Full Chromium suite: **609 passed across 85 files**; coverage emitted.
- API/web/docs typechecks, web lint/format and API/web/docs production builds passed.
- CI automation and deployment packaging: **33 Node tests**; **16 Python tests**. An initial extra combined run in bare Node lacked Git for the Git-diff fixture; the final combined run uses the optimized API image, where Git is an intentional runtime dependency. New runtime export regressions cover relocation, transitive dependencies, required peers, license preservation, optional generator-peer exclusion and missing-required-dependency failure. GNU-tar OCI tests ran in Linux with a 64 MiB temporary filesystem.
- Optimized migration image applied the entire migration history to a separate empty disposable database and passed repeat migration with no pending migrations.
- Generated documentation Compose started with local image tags and `--pull never`; API, worker, database, cache, queue, scanner, engine and web healthy. Initialization/migration jobs exited successfully.
- HTTP/auth smoke passed: SPA routing, web/API readiness, anonymous restrictions, dotfile rejection, wrong-origin rejection, admin sign-in and logout.
- All eight actual bundled analyzers passed generated-fixture acceptance, including detection, exact-scope signature verification and source cleanup.
- Documented backup/restore scripts passed into a new database; restored Identity and completed-migration counts match the original. Backup permissions are 600. Original data was preserved.
- Restarted scanner engine, scanner, API, worker and web with the same volumes; health/readiness and authentication smoke passed afterward.
- Optional controller starts read-only with no application credentials or engine socket, using its required dedicated fixture API key; its health endpoint passed. Optional real native workloads were not newly production-qualified.

## Local usage and boundaries

The five application images (including the optional controller) are tagged `preflyt-local/*:optimized-20261015-arm64`. `work/community-local/images.json` records exact image IDs. The ignored documentation deployment is already running at **http://localhost:8081/super-admin/login**. Its private `.env` and existing volumes were preserved. The separate port-8080 app was untouched.

```sh
cd /Users/peterschikezie/Documents/GitHub/78/preflyt/work/community-local
docker compose up -d --wait --pull never
```

The image builds target this ARM64 Mac. AMD64 release qualification, public pulls, published attestations, real external GitHub onboarding and the remaining legal/security release findings from the [Community audit](2026-10-15-community-audit.md) remain separate. The dependency audit still reports the previously identified unpatched high `braces` advisory in the documentation build chain; this optimization does not resolve or suppress it.

Private command logs, size comparison JSON and backup evidence are under `/private/tmp/preflyt-image-optimization-20261015`. Local evaluation data/credentials remain Git-ignored.
