# Guided first CI assessment — 16 October 2026

## Problem

Overview displayed inspection, standards and assessment steps, but its primary button always said “Create first report.” That action silently inspected the repository and adopted recommendations. The highlighted step and its action did not match, and there was no explicit review between steps.

## Updated behavior

- With no repository, the panel directs an authorized administrator to repository selection first.
- With a repository, current progress comes from the repository's saved profile and standards API, rather than period-filtered dashboard summaries.
- **Inspect repository** performs inspection in the panel, then advances to standards. It does not save standards or create an assessment.
- Recommended standards display their titles, versions, reasons and expandable check lists. The user explicitly selects them and chooses **Save standards and continue**. An empty selection is disabled; concurrent selection changes are rejected rather than overwritten.
- Existing saved standards are retained. Unverified versions require review through the repository's Standards tab. Partial inspection evidence is labeled Partial, rather than marked completed.
- **Create assessment** appears only after a profile and verified selection exist. It rechecks those prerequisites, creates the commit-bound assessment and opens that assessment's results. It never silently performs earlier steps.
- Successful steps move keyboard focus to the new step heading. Permission checks apply separately to each step; completed steps do not require a user to possess earlier-step mutation permissions. Loading, persistent errors, retry and contextual repository links remain available.
- Completion badges use the existing shared green Completed mapping; Partial uses its existing warning mapping. No new status colors were introduced.
- Setup does not publish branch policies, enable merge protection, run repository code or change AI source-sharing settings. Missing CI results remain visible. Repository Health remains separate and does not require CI setup.

## Verification

- Full Chromium suite: **613 passed across 85 files**.
- Focused guide/helper regressions: **14 passed**, including the actual sequence of API requests and final navigation, explicit standards selection, empty selection, permission boundaries, conflict rejection, failure retention, keyboard focus, all-time assessment handling and 320px layouts in both themes.
- Web typecheck, ESLint and formatting checks passed.
- Production web build/prerender and documentation build passed.
- Deployment automation: **37 Node tests passed**, including four new admin-session smoke regressions. Both fresh SUPER_ADMIN and connected OWNER workspace roles must have `platformAdmin: true`; either role without that authority is rejected.
- The original fresh-install smoke assumed the active role stayed SUPER_ADMIN and failed on the already-connected local workspace. The check now verifies authenticated deployment authority directly. Live HTTP/login/origin/protected-route smoke passed with the corrected check; no user membership or session role was changed.
- Rebuilt only the local ARM64 web image and updated the ignored documentation deployment on port 8081. API, worker, scanner images, credentials and application volumes were preserved. The separate port-8080 deployment was untouched.

The local web image was built as `preflyt-local/preflyt-web:check-1792106562215-arm64`, content ID `sha256:6d348c8e586c14c0d79a3ba0da12eff70e698b4ef8c35d7218586635c8bef885`, and selected through the existing `optimized-20261015-arm64` local tag. `work/community-local/images.json` records the current mapping.

Private execution logs: `/private/tmp/preflyt-guided-setup-*.log`. The full suite emitted a ResizeObserver delivery warning but returned exit 0 with all 613 cases passing. No new live GitHub installation or real repository mutation was performed for this UI task; regression requests use controlled fixtures, and local deployment smoke checks use the isolated instance.

No commit, push, GitHub Actions run or registry publication was performed.
