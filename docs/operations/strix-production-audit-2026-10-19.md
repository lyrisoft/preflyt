# Production Strix packaging audit — 19 October 2026

Scope: optional production Compose packaging for the existing source-only General
Security Review and Payment Risk Review profiles, and matching image publication.

## Changes

- Added `ai-security` services: separate TLS Docker-in-Docker engine, one-shot
  certificate/storage initializer and non-root Strix controller. API/worker get only
  a read-only connection volume on an internal service network.
- Added pinned multi-stage controller packaging with build-only Go tooling required
  by Strix's wheel. The runtime installs no packages and holds no provider keys.
- Publish controller and restricted sandbox images in an independent Strix build
  group for AMD64/ARM64. Release manifests and version tags include all seven images.
- Production uses versioned sandbox references resolved to a local engine image ID;
  the existing local host-controller path remains available for development.
- Updated downloadable Compose image substitution, installation/recovery guidance,
  version compatibility and resource requirements. Production image publishing
  still does not remotely restart an operator's server.

## Audit corrections

The first clean image build identified upstream's required Go TUI build toolchain;
Go now lives only in a pinned builder stage. A disposable startup caught an unquoted
Compose tmpfs option list; it was corrected and covered by a deployment regression.
Local image qualification now includes the Strix group separately instead of
silently including it in the API group. The controller cert includes its service
DNS name and is renewed on startup when fewer than seven days remain.

## Verification

- Both new image Dockerfiles built locally on ARM64 from pinned upstream images.
  The upstream sandbox manifest was verified to contain AMD64 and ARM64 variants.
- 37 Python runner, source-inspection, payment-report and initialization tests passed
  in the pinned Strix environment.
- 36 Node release/catalogue/notes/local-image tests passed.
- 9 focused deployment/Compose API tests passed, including isolation, optional
  startup, tmpfs options and both publisher matrices.
- Documentation production build, generated standalone downloads, environment
  reference and frozen-version verification passed.
- A disposable production-style engine/init/controller stack reached healthy.
  The real application Strix client, running as UID 1000 with only the read-only
  connection volume, completed authenticated HTTPS capability discovery for all
  three review profiles. Invalid bearer credentials returned 403. Only the public
  connection document was visible in the application-side mount.

The unpaid startup smoke preloaded a small trusted fixture image into the isolated
engine to avoid duplicating the 11 GB toolkit. The actual restricted toolkit image
was built separately. This checks production startup/transport and packaging; it
is not a new paid-model review, full toolkit execution or a VM-grade isolation
qualification. The existing advisory/source-only evidence boundary is unchanged.

Before publication, merge the release branch with current main ancestry so release
planning can compare the published baseline. Apply the earlier additive personal
notification migrations when upgrading this combined release. Preserve all user
and repository grants, notification state and Strix connection/state volumes.
