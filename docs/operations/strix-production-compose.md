# Production Compose: AI security review

General Security Review and Payment Risk Review are two source-only profiles of
one Strix controller. They share a pinned source snapshot and the existing model
broker. This deployment does not enable live website/API penetration testing,
execute payment scenarios, certify compliance or decide merge permission.

## Enable the optional services

Use a release that includes `preflyt-strix-runner` and `preflyt-strix-sandbox`,
with the same immutable release version or full commit tag as the application.
The standalone Compose download contains all service definitions; no host Python,
checkout, local bridge script or host Docker socket is required.

Set in the protected Compose `.env`:

```dotenv
PREFLYT_IMAGE_REGISTRY=ghcr.io/lyrisoft
# Keep the exact published PREFLYT_VERSION already selected for the application.
COMPOSE_PROFILES=ai-security
```

Pull and start from the installation directory:

```sh
docker compose pull
docker compose up -d --wait --wait-timeout 1800
docker compose logs --tail 50 strix-runner
```

Allow additional resources beyond standard Health scanning: the isolated engine
has a 6 GiB limit and the controller a 2 GiB limit; one sandbox has a 4 GiB limit
inside that engine. Plan for at least 16 GiB Docker memory, 8 CPUs and 60 GiB free
disk for the combined installation. These are starting budgets, not throughput
qualification. The first start pulls the release sandbox into the separate engine
and can take several minutes. It cannot accept jobs until preparation succeeds.

Enable AI configuration and reviews in **Settings → Configuration**, then configure
and test the Security testing (VAPT) model route in AI Intelligence,
permit source sharing, then explicitly select General security review, Payment
Risk Review, or both in repository assessment options. Starting the profile does
not itself review any repository or consume model requests. Existing repository
permissions and model limits still apply. Initial automatic assessments stay
standard-only. See [Payment Risk Review](payment-risk-review.md).

## Isolation and credentials

- `strix-engine` is a dedicated privileged Docker-in-Docker daemon. It has no host
  socket, host path mounts or published ports. This follows the existing Health
  engine pattern; it is not a claim of VM-grade or hostile-tenant isolation.
- Only the non-root `strix-runner` gets its copied client TLS certificates. It has
  no provider API key, GitHub token or database credentials. The API/worker receive
  only a read-only, owner-restricted connection file containing the runner origin,
  authentication key and public certificate.
- The controller's HTTPS endpoint is internal-only. Job-scoped inference callbacks
  go to `http://api:3000` on the private service network. Provider keys remain in
  Preflyt. Do not publish the controller or engine ports.
- Job containers run as UID 1000, read-only, without Linux capabilities, host mounts
  or extra hosts. They have CPU/memory/process limits, temporary source storage and
  an internal network with no external route. The trusted relay uses engine exec;
  repository content is transported as bytes, not host command text.
- Sandbox image tags are versioned releases or full commit tags, resolved to an
  engine-local image ID before admission. Mutable `latest` references are rejected.
- Keep the connection, state and engine volumes. Keys/receipts persist across
  restarts; source work directories are removed after completion. Interrupted jobs
  are failed and cleaned, never automatically resumed with paid model calls.

## Health, upgrades and recovery

`docker compose exec -T strix-runner python readiness.py` checks authenticated TLS,
profile support and the isolated engine without calling a model. Container health
is not evidence of a completed review. A real saved report is separate acceptance.

Upgrade both Strix images together with API/worker/web; never reuse an older
sandbox image with a newer controller. Published images contain the pinned Strix
source and dependency versions. No Python packages or controller code are installed
at runtime. The nested engine only pulls the matching sandbox image.

The self-signed controller certificate is persisted for up to one year and renewed
at startup when fewer than seven days remain. Plan maintenance before expiry;
recreating the controller refreshes the shared connection file. Never delete only
one connection/state volume while keeping mismatched credentials elsewhere.
Restarting during a review interrupts it; run an explicit new review afterward.

For a failed start, inspect `strix-init`, `strix-engine` and `strix-runner` logs.
Registry access, free disk, unsupported image architecture or a mismatched version
must be fixed before retrying. Standard repository scanning remains available when
this optional profile is absent/unavailable. To disable it, stop its services and
remove `COMPOSE_PROFILES=ai-security`; do not delete application/database volumes.

The production publisher builds images and publishes release documentation. It
does not remotely restart your existing Compose installation; pulling and running
`up -d` remains an operator action. Do not combine the production profile with the
Docker Desktop-only `compose.strix-local.yaml` host-controller bridge.
