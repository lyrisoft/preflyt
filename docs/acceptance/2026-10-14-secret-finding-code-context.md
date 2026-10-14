# Secret finding code context — 14 October 2026

Secret findings now use the existing code viewer instead of a blanket hidden-source message. Health and CI findings show numbered surrounding lines, the exact assessed commit and a highlighted reported range. GitHub links still point to that same revision and line range.

Because saved receipts omit credential values and match columns, the entire reported range is replaced with `[Potential credential redacted]`. Existing credential redaction also applies to context. Unknown detector formats are masked too. No raw secret range is persisted in the secret excerpt. Secret excerpts have a separate versioned cache identity and cannot reuse an ordinary finding's cached code. Missing or invalid coordinates fail closed. AI left-side source retains its separate revision semantics and applies the same reported-range masking when identified as sensitive.

Current repository authorization is checked before and after retrieval. Source remains verified against the exact commit and blob hash; existing size, regular-file and path restrictions remain intact. No GitHub permission changes are needed.

## Verification

- 74 focused API tests passed across source access, persisted excerpts, Health integration, report/guidance and AI finding source tests. This includes secret cache separation, masking before persistence, restart retrieval, unsupported paths, revoked access and recognized CI credential detectors.
- API TypeScript check passed.
- Live browser verified the existing MaiGuard finding in `docs/fintech_api_usage_guide.md` at commit `6d3a4faa9c421e40e5422afe121f0f59fc3efe07`: lines 291–302 are visible; lines 296–297 are masked and highlighted. The reported range and exact-commit GitHub link remain visible. Source capture succeeded through the regular API after an earlier transient fetch retry delay.
- Historical assessment results were not rewritten; the requested redacted source excerpt was captured normally on opening the existing finding.
- Local audit and commit only. No push or GitHub Actions run.
