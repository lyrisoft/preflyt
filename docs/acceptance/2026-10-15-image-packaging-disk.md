# Image packaging and local qualification — 2026-10-15

The AMD64 API group in GitHub Actions run `38707658664` failed while packaging the dependency scanner: `gzip: stdout: No space left on device`. The final Buildx exception hid that underlying error. The previous local image qualification covered ARM64 without completing the AMD64 release group.

Scanner packaging now streams the filesystem through gzip, hashes the uncompressed stream for the OCI diff ID and hashes compressed bytes for the layer descriptor. It writes no uncompressed filesystem tar. The outer `.tar` contains already compressed OCI layers; startup verifies the archive digest and the exact imported image ID. The AMD64 hosted API runner removes only fixed unused SDK directories and requires 24 GiB free before building. Its cleanup refuses local, self-hosted and ARM64 machines.

`node scripts/ci/local-images.mjs` builds all five application and six native images on AMD64 and ARM64, without publishing. It checks both host and Docker filesystem headroom before each group. Docker Desktop's VM limit can be exhausted while macOS still has free space; checking the host alone did not detect this during the first full Compose attempt. The corrected preflight was exercised with a cached ARM64 web build and reported 28.3 GiB host / 13.6 GiB Docker free.

## Verified locally

- All 22 image variants built, loaded and passed architecture/content-ID inspection: 11 AMD64 and 11 ARM64.
- All six native-tool images on each architecture passed the CI generated-source fixtures, including Semgrep file accounting and scanner-failure handling.
- API suite: 159 files, 1,721 tests passed, 5 skipped.
- Node automation/stage suite: 28 tests passed. Linux OCI packaging: 2 tests passed, including a 128 MiB source under a 2 MiB output-file limit and a 64 MiB temporary filesystem.
- AMD64 scanner: eight analyzers, seeded finding, signed result and source cleanup passed. Startup plus scanner smoke took 169.251 seconds; startup accounted for 86.2 seconds and analyzer execution approximately 83 seconds.
- After scoped storage cleanup, the fresh ARM64 Compose deployment reached readiness in 52.8 seconds and passed health, SPA routing, protected API, origin and configured authentication checks. All eight Health analyzers, the seeded finding, signed result and source cleanup then passed; total startup and acceptance time was 80.161 seconds. Its disposable containers and volumes were removed.

The image matrix and native fixture logs are saved under the local temporary evidence directory `preflyt-all-images-iZxOMP`. AMD64 execution used Docker Desktop emulation on Apple Silicon; the dedicated nested Docker engine was ARM64. A native AMD64 hosted run was not started. Migration replay, backup restore and restart were verified in the previous deployment acceptance and were not repeated for this packaging patch.

Superseded Preflyt test-image tags and exact older Preflyt build-cache records were removed to recover Docker VM space. Existing application volumes/databases and the 22 newly qualified image tags were preserved. Disposable acceptance projects remove only their own generated volumes.

No images or commits were pushed and no GitHub Actions run was dispatched for this qualification.
