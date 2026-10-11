# Fresh GitHub App manifest registration — 2026-10-11

Status: **PASS — fresh registration, installation, owner onboarding, repository inspection and real webhook ingestion.** Tested on 2026-10-11. PR policy publication and AI review are outside this fresh-registration result.

## Isolation

- Current checkout; separate local UI (5174), API (3002), disposable PostgreSQL and queue containers.
- All 54 existing migrations applied to the isolated database.
- Fresh distinct encryption keys; no existing App, policy or model credentials copied.
- Temporary public proxy accepts only signed POST `/github/webhooks`; other methods/routes return 404. Signature validity is checked by the isolated API.
- Existing deployment and App untouched.

## Observed live stages

1. Fresh-deployment Start setup and Super Admin sign-in succeeded.
2. Settings showed the guided Create your GitHub App flow with optional capabilities off by default.
3. Prepared `Preflyt Manifest Live 20261011` in `lyrisoft`, enabled setup-PR support, left ruleset administration off.
4. Preflyt review displayed repository/workflow writes for setup PRs and the preservation/inspection boundaries.
5. Confirm in GitHub posted the generated manifest and navigated to GitHub's Confirm access page, signed in as `iampeters`.
6. Account owner approved GitHub Mobile verification and authorized test-App creation.
7. GitHub created the App and returned to Preflyt. The existing API process showed **One GitHub App → Connected** and an Install App link, with no credential copying or restart.
8. Isolated DB verification: manifest transaction `CONNECTED`, encrypted secrets envelope present, no private key/client secret/webhook secret in the nonsecret configuration JSON.
9. Owner approved installation on **only `lyrisoft/preflyt-p2-acceptance`**. GitHub confirmed Actions/members/metadata read and checks/code/PR/workflows write; no ruleset administration.
10. GitHub sign-in used the generated App client credentials and callback successfully. Preflyt verified `iampeters` as organization owner and created the isolated `lyrisoft` workspace.
11. The isolated worker had not yet been started, so repository inventory required **Refresh repositories**. It returned exactly one permitted private repository. The ordinary deployment includes the worker; this test then started its isolated worker.
12. Explicit repository selection automatically inspected main commit `b3355f9` and displayed Python. DB showed one selected repository and one saved profile.
13. GitHub's App delivery API showed successful real `ping`, `installation` and `check_run` deliveries (HTTP 202). After repository selection, the isolated worker retained and processed **two `check_run` events**. No synthetic signed events were used.

## Scope and limits

API connection hot reload was verified by GitHub sign-in and repository reads in the same API process used before registration. The worker was started after registration, so live worker credential rotation is not claimed here; its hot-reload behavior is covered by the existing focused tests.

No standards, branch policy, model route or protection was created in this isolated workspace. Fresh-App PR policy publication and AI review were not exercised; do not infer those outcomes from registration success. The existing Preflyt deployment/App/model routes were left unchanged.

## Temporary resources

The private test App `preflyt-manifest-live-20261011` remains installed only on the acceptance repository. Local UI/API/database/queue/worker and a signed-webhook-only temporary tunnel were left available for follow-up tests. Their temporary credentials are stored in a protected local directory, not in this report. The tunnel is not a stable deployment URL. Removing the test App or installation requires a deliberate cleanup action; do not delete the existing production App.
