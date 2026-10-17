# Finding review card refinement

Implemented locally on 2026-10-17. No commit or push.

- Shared 40px SurfaceIcon, semantic heading and existing StatusBadge share one compact header. A divider separates the header from the form.
- Reason labels, required/optional metadata, normal-weight input text and character counts have consistent spacing. The main action uses the shared primary Button in a right-aligned bordered footer.
- Expiry uses the shared styled OptionSelect: until manually reopened, 7/30/90 days, or a custom local date and time. The custom field appears only when selected and validates future timestamps. Reopening still submits no expiry.
- Detailed matching criteria and assessment/merge-policy implications are documented in the existing page Help drawer. Saved reasons, expiry results, history, permission failures and inline save errors remain visible where applicable.
- Existing repository access, required reason, expected revision, query invalidation and API decision semantics are preserved. Controls disable while saving; failed saves retain the reason.

## Verification

- 30 focused browser tests passed across finding review and finding details, including ignore/reopen, optional exact expiry, duration preset, invalid past dates, read-only and denied access, and save failure recovery.
- Visually inspected light/dark card screenshots at 320px and 400px viewport widths with real parent padding. No horizontal overflow. Seven review-card tests passed again after framing the visual captures.
- Web TypeScript and focused ESLint passed; whitespace checks passed.
- Rebuilt the local ARM64 web image and updated only the web service in preflyt-ce-local. Running image ID matches recorded build evidence; redesigned JavaScript assets, homepage and API readiness were verified over localhost HTTP. The web service is healthy. Other services and reporting preferences were preserved.

Screenshots are ignored local test artifacts under apps/web/src/features/findings/__screenshots__/finding-review-*.png. The source checkout remains uncommitted.
