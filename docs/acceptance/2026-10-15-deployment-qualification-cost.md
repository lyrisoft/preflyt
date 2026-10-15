# Deployment qualification cost — 15 October 2026

Development published-image acceptance keeps exact revision checks, fresh database migration through normal startup, login, origin enforcement, protected routes and authenticated scanner readiness. Main release acceptance additionally exercises all Health analyzers, signed findings and source cleanup, migration replay, protected backup restore and restart. Image preparation and service readiness now have separate workflow steps.

The Health scanner image packages the five fixed tool filesystems as Docker-loadable archives during image build. Startup checks archive SHA-256 values, loads missing content-addressed images into the dedicated engine and retains the existing version, isolation, signing and readiness checks. Restarts reuse the exact image IDs. No extra registry credential is needed inside the engine. Source development and scheduled dependency database refresh retain their existing build paths. The release build varies the database cache key by UTC date. Generated Docker stages are checked against the standalone native Dockerfiles before publication.

## Local evidence

- Final audited API suite: 124 files passed; 1,107 tests passed, two optional tests skipped. The final native CI package-manager invariant passed separately.
- API TypeScript check passed.
- Final CI automation and generated-stage tests: 23 passed. The Linux OCI archive graph/digest regression test passed separately (24 Node tests total). All eight Python CI automation tests passed.
- Final ARM64 bundled scanner and application images built successfully.
- Fresh-engine scanner readiness: 53.9 seconds, with the application image already local. All five bundled images loaded without tool compilation. Registry downloads are excluded from this measurement.
- Warm scanner restart: 12.5 seconds, with all five exact tool image digests verified unchanged. Generic untagged-image listing was insufficient for this check; each pinned image was inspected directly.
- All eight analyzers, generated finding, signed result and source cleanup passed through the real scanner transport.
- Full Compose startup, login, SPA routing, origin checks, protected API and configured authentication passed.
- Migration replay, mode-0600 backup, restore into a separate disposable database, identity/migration row counts, service restart and authenticated scanner readiness passed.
- The initial legacy Docker archive format used a configuration digest that did not match Docker 29's imported image ID. OCI manifests fixed that mismatch; a tiny real-engine import verified the expected manifest ID before the full rebuild.
- An earlier rebuild exhausted host disk space and Docker storage became read-only. After approved Docker recovery and disk cleanup, verification resumed with available space checked. No real application database or data volume was deleted.
- Conflict-resolution commit `3ee3da1` was pushed separately to development; GitHub reported PR #104 mergeable. Image publication remains a separate workflow outcome, not established by these local checks.
- AMD64 bundle execution remains for its native release runner; local deployment acceptance used Linux ARM64 under Docker Desktop. No manual workflow dispatch was used for local acceptance.

The scanner image is larger because it carries the tools. Cold registry download remains necessary. This change removes initial tool compilation from the deployment host, not the initial image download.

## Pre-push audit

The audit tightened manifest digest types and made stage regeneration fail before writing if Dockerfile markers or the Trivy target boundary are missing. Regression tests cover malformed inputs and preserve valid generated output. Native fixture CI now selects the same pnpm version as the root package contract. These guards preserve the validated startup path and fail closed on malformed deployment metadata.
