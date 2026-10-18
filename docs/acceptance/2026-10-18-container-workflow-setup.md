# Container workflow setup — 18 October 2026

## Delivered locally

Workflow setup detects `Dockerfile`, `Dockerfile.*` and `*.Dockerfile` at the inspected repository commit. A single file is selected automatically; several files produce an inline, labeled Dockerfile selector. A remembered selection from an installed managed workflow is reused when the path still exists. Missing files receive actionable guidance. Static policies and container-check command overrides do not show the selector or inherit unrelated setup.

The selected file supplies a generated Docker build step and `CONTAINER_IMAGE` tagged with the exact PR head. A matching literal build context from an existing build-push-action is reused only if it names a repository directory and is unambiguous; otherwise the Dockerfile's directory is displayed for review. Paths are passed as quoted environment values. No repository code is built on the API server; the workflow neither pushes images nor starts test infrastructure.

Selection travels through preview, AI generation, download and PR creation. Backend validation rejects unresolved multiple choices and paths absent from fresh repository source. Existing repository permissions, origin checks, target-branch revision checks and terminal gate validation remain intact. The PR audit records the selection. AI choices share the same Dockerfile, and sensitive Dockerfile contents are omitted from its prompt while retaining path metadata. The unified CI setup skill is version 3.

Changing the Dockerfile resets review and pending proposals. Existing manual YAML edits remain visible until the generated replacement is explicitly loaded. Controls show regeneration progress, stay disabled while source is updating, and offer detection recovery if the chosen file disappears. The shared selector supports keyboard input and wraps long paths at 320px in both themes.

## Compatibility finding and local companion fix

Read-only inspection of the released [Action v2.1.1 scanner provisioning](https://github.com/lyrisoft/preflyt-action/blob/v2.1.1/tools.py) found that isolated Trivy receives neither the runner Docker daemon nor a local image archive. A locally built tag therefore cannot be scanned through that code path. The latest GitHub release was also confirmed as v2.1.1 during this audit.

Companion Action commit `2257b6a` is saved on local branch `codex/local-container-image` in the user's `preflyt-action` repository. It inspects local images, exports them on the runner, mounts the archive read-only outside the writable scanner cache, and uses Trivy's documented [image archive input](https://trivy.dev/docs/latest/target/container_image/#tar-files). It never mounts the Docker socket or forwards GitHub/OIDC credentials. Failed, empty or timed-out exports remain incomplete; registry image behavior is retained. Temporary archives are cleaned up.

**Release dependency:** neither repository was pushed. The generator retains the existing published `lyrisoft/preflyt-action@v2.1.1` reference. Publish a new Action release containing `2257b6a` and update the configured Action version before using generated runner-built container scans in GitHub. This audit does not claim a successful live vulnerability scan or remote workflow run.

## Verification

- Exact staged Preflyt snapshot: 105 API tests, 16 Chromium tests, API/web TypeScript checks and targeted frontend lint passed independently of unrelated working-tree edits.
- Working checkout: the same API coverage and 17 browser tests passed; its extra browser test belongs to the unrelated polling work excluded from this commit.
- Documentation production build, environment references, deployment assets/links and frozen-version checks passed.
- Keyboard selection, regeneration progress, missing/stale selection recovery, manual-edit preservation, read-only access, AI/download/PR payloads, both themes and 320px layout were checked. Light/dark screenshots were inspected.
- Read-only MaiGuard HEAD inventory found seven Dockerfiles. Selecting `api/Dockerfile` generated context `api`, the PR image tag, and no database, Compose, migration or seed setup.
- Companion Action: 27 Python tests passed; two opt-in real-Docker scanner smoke tests were skipped. Scanner invocation and archive-export tests use controlled subprocess mocks, not a live vulnerability scan.
- Staged whitespace checks passed. No GitHub Actions jobs, pushes, PRs or deployments were triggered; no workers were interrupted.
