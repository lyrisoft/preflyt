# Offline verifier fixtures

`artifact.bin` is an opaque, never-executed copy of `github_provenance_demo-0.0.12-py3-none-any.whl` from GitHub CLI `pkg/cmd/attestation/test/data`. `bundle.json` is its corresponding signed bundle. Source commit: `8db3c3107a174c51de4758f53d5b27911650931b`. Upstream: https://github.com/cli/cli/tree/8db3c3107a174c51de4758f53d5b27911650931b/pkg/cmd/attestation/test/data . GitHub CLI license is retained in `LICENSE-gh.txt`.

`trusted-root.jsonl` is the public output of `gh attestation trusted-root` (gh 2.96.0) fetched on 2026-10-08 using its TUF verification. It is a frozen test fixture, not a deployment trust-root recommendation. Roots contain public certificate/log keys only. Sigstore source: https://github.com/sigstore/root-signing .

The optional real cryptographic test runs when `PREFLYT_TEST_GH_PATH` identifies an installed reviewed gh binary. It verifies the signed artifact offline, then rejects changed report bytes, signature, run attempt and binary digest. CI should provision that reviewed binary and set the test variable. Other identity/receipt/API tests do not require gh.
