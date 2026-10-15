# Main deployment failure fixes

## Documentation

The Documentation build job inherited only `contents: read`. Its `configure-pages` step calls the Pages site API, which requires Pages read permission for the workflow token. The build job now has `pages: read`; deployment retains its existing `pages: write` and `id-token: write` permissions. Configuration validation runs immediately after checkout, before dependency installation and the documentation build.

The live site read on 13 October 2026 returned `build_type: legacy` and `https://docs.preflytlabs.com/`. With explicit user approval, Pages Source was changed to GitHub Actions (`workflow`) and verified with a second API read; the custom domain remains `docs.preflytlabs.com`. No automatic site creation or additional administration credential is introduced.

## Native Node image

`Dockerfile.node` copies `coverage/run.mjs`. The helper existed locally but was absent from tracked files because the generic `coverage/` ignore rule matched its directory. A narrow ignore exception includes this image-owned helper and continues to exclude generated files in that directory. Other coverage output remains ignored. The production helper is now part of the committed source and clean checkout build context; its code and adapter path are unchanged.

## Validation and deployment status

All 15 focused local workflow and native coverage regressions pass. The coverage helper passes Node syntax validation. All 30 local native Dockerfile COPY inputs are verified against tracked source. The pinned Node base image is not cached locally, so a Docker image build was not run. GitHub Actions builds, deployments and image publication were not rerun. These fixes are committed locally only, under the user's no-push instruction.
