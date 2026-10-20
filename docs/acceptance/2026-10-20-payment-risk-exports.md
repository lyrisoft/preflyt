# Payment Risk Review exports — 2026-10-20

Implemented explicit PDF and Markdown downloads from the saved report, replacing the JSON download button. The internal JSON API contract remains available. Both formats retain all eight sections, exact commit and assessment identifiers, source references, review limitations, detailed finding reasoning and human review decisions.

Checks passed:

- 15 API tests across report imports, human review overlays, export rendering and authenticated HTTP exports. The final logo/page-break change additionally passed all five export-specific API tests.
- 10 browser tests, including both actual download request formats, filenames and MIME types, fresh permission checks, download failures, report access failure, embedded loading, and 320px layouts in light and dark themes.
- API and web typechecks, focused web ESLint, and whitespace checks.
- Downloaded the PDF from the running app for the saved `lyrisoft/maiguard-api` report at `663420bb1162e8418bd61f6c171df85e2a6f3ba1`, assessment `a39e19d3-2b7b-4e7c-8ff7-ecaa5f4e61dc`. Its two findings and all 163 content blocks, including original AI classifications, were retained in the 10-page PDF. All pages were rendered and visually inspected after adding the supplied Preflyt logo. Text extraction confirmed content retention, and PDF metadata inspection confirmed A4 pages and no JavaScript.
- Rebuilt and started local Compose API, worker and web services; all were healthy. Confirmed the API image includes the logo and bundled fonts. Both download buttons are visible in the running app. Markdown HTTP/download behavior passed automated checks; a manual browser Markdown download was not completed.

No repository source was executed, no new model review was started, and no finding classification or saved assessment evidence was changed.
