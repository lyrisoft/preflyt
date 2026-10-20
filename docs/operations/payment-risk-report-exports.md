# Payment Risk Review exports

The saved Payment Risk Review offers **Download PDF** for reading and **Download Markdown** (`.md`) for prompting. Both formats use the same content model and include all eight report sections, repository, branch, full commit and assessment ID, source paths and line ranges, finding IDs, likelihood/impact scores, reasoning, preconditions, counterevidence, remediation, current human decisions and original AI classifications. Review gaps and the source-only, unexecuted-test limitations remain visible.

The PDF uses the supplied Preflyt logo in every page header, bundled Noto Sans fonts, A4 pages and page numbers. Generation reads local assets only. Markdown escapes report-supplied markup so report text cannot create new document headings or active HTML. Neither format starts another model request or reruns an assessment.

The existing authenticated `GET /github/repositories/:repositoryId/health/:id/payment-risk-report` endpoint accepts `format=pdf` or `format=md`. Omitting `format` preserves the internal JSON response used by the UI. Exports pass through the same assessment and repository permission checks and use `Cache-Control: no-store` with attachment filenames bound to the assessment. Unsupported formats return 400. The browser checks the response type before saving and reports denied access or download failures.

API runtime images must contain `resources/report-fonts/` and `resources/preflyt-logo-color.png`. Font licenses and source attribution are retained with the assets and in the project third-party notices.
