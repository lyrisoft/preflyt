import type { HelpSection } from '@/components/page-help-drawer'

export const healthHelp: HelpSection[] = [
  {
    title: 'Security hotspot review',
    content:
      'The Security hotspots card counts findings detected and explained automatically by the analyzer. These indicate security-sensitive patterns, not confirmed vulnerabilities. Human review is optional and separate from the automatic assessment. Open a hotspot to inspect its exact source and record To review, In review, Reviewed: no change needed or Reviewed: fix required. Completed decisions require a rationale and finding management permission. Reviewed means either completed decision; reviewed-retained-hotspots-v1 calculates 100 × reviewed unique retained hotspots / total unique retained hotspots for this saved commit. Truncated or invalid hotspot output has no percentage; zero hotspots displays no hotspots rather than 100% reviewed. Decisions and audit history are separate from immutable scan evidence, never carry automatically to a later commit and do not grant merge permission.',
  },
  {
    title: 'Repository health and CI',
    content:
      'Selecting a repository starts a background assessment of its default branch. Choose another branch in the repository header to load its saved reports. The branch stays in the page URL across reloads. A branch without a report shows Not assessed; select Assess repository or Reassess to run analysis. Health inspects a fixed commit using approved analyzers. CI runs the existing tests and collects coverage with their normal dependencies and services. Preflyt verifies the submitted LCOV report against the exact commit and completed workflow execution. Open Test coverage details to inspect the measurement and CI run. Reports without verified execution remain unavailable. Health does not invoke AI or grant merge permission. Continuous CI checks are optional and separate.',
  },
  {
    title: 'Processing and completeness',
    content:
      'Queued means waiting for worker capacity. Running includes source inspection and approved analysis. Completed means a report was saved, even if analysis is partial. Failed means source access or analysis could not finish. Cancelled means the request stopped. Complete requires full recorded scope, valid outputs and confirmed cleanup. Partial identifies missing analysis, coverage or retained findings. Inspection only means no analyzer ran, so issue counts cannot establish health.',
  },
  {
    title: 'Findings and severity',
    content:
      'Findings are potential issues reported by a recorded analyzer, not independently proven defects or exploits. Severity is the analyzer’s level: critical, high, medium, low or unknown. Suppressed results are excluded. Duplicate findings from the same analyzer and location are counted once. Each analysis retains at most 20 findings and a bounded signed payload; a larger or invalid result makes the report partial.',
  },
  {
    title: 'Source locations',
    content:
      'Each finding opens a dedicated details page showing the analyzer’s file and line, with a saved, redacted source excerpt from the exact assessed commit after checking access. The line is highlighted only when it exists in that file. Some findings refer to a manifest or have no line. Secret findings hide their source excerpts and sensitive messages; obvious credentials in context are also hidden.',
  },
  {
    title: 'Freshness and history',
    content:
      'Current means the assessed SHA matches the selected branch head when last checked. Stale means that head has advanced. Freshness unverified means GitHub could not be checked or this is a historical branch report. Saved reports load first, while GitHub branch freshness is checked separately in the background. Current is shown only for a recent verified head check; older or failed checks show Freshness unverified. Head checks are cached for one minute. Changing branches creates a new report, never relabels history. Findings over time compares fully retained results from measured rule packs across the latest 30 completed reports on the displayed branch. The graph names compared packs and excludes other analyzer counts. Overall coverage can remain partial. Tools, configuration, plan and measured candidate/scanned file sets must match; skipped files, incomplete outcomes or truncated findings prevent comparison. Older reports retain their original complete-report comparison rule. The chart stays independent of history pagination and stops at the displayed report; it does not invent zero counts or infer health between assessments. View chart data lists UTC times, counts and links to each assessed commit. No longer reported does not independently prove a fix.',
  },
  {
    title: 'Available metrics and next steps',
    content:
      'Reported findings and high/critical counts require validated analyzer output. Analyses completed counts checks with validated successful or finding-bearing output, not files found during inspection. Files discovered counts repository inventory, not analyzed files. Candidate files analyzed shows measured scanner coverage for each recorded rule pack; missing accounting is unavailable. A dash on any metric card means no measured result is available, never zero. Review Analysis coverage for missing or failed analysis; the test coverage dash means a complete test coverage measurement is unavailable. The five Health cards show retained security, reliability and maintainability findings, measured duplication and test line coverage. Each card opens Findings for this repository and saved report, filtered by category; Test coverage opens its detail view with verified CI results. Security hotspots remain analyzer findings with optional triage, without a separate metric card. Partial analyzer output is not whole-repository health. Security counts come from supported Gitleaks, Semgrep and Trivy results. Reliability and maintainability use separate reviewed Semgrep rule packs for JavaScript, TypeScript and Python. Their fixed rules cover NaN comparisons, async Promise executors, broad exception catches, returns in finally, mutable Python defaults, debugger statements and dynamic execution; they do not establish overall code quality. Duplication uses jscpd with a fixed scope and shows unique duplicated physical lines divided by analyzed physical lines. Overlapping matches count once; ignored folders, unsupported formats and files outside the recorded limits are not included. Matches require at least five lines and fifty tokens and ignore comments and whitespace. Coverage comes from integrity-checked CI LCOV reports and server-verified workflow execution, matched to the displayed commit and run attempt. Deployments configured for organization-key proofs also require a valid report signature. Repository Health does not execute tests or configure their services. Missing reports are unavailable, never zero. Existing historical manual measurements retain their original formula and scope; new measurements use the files reported by CI. Complexity needs a qualified measured source. Overall health uses the latest selected-branch assessment: critical/high findings or failed required policy limits are Unhealthy; missing required analysis is Incomplete; complete advisory findings need attention; complete clean requirements are Healthy. A known blocking failure takes precedence over missing evidence. Captured policies currently support failed-check limits, not coverage or duplication percentage targets. Coverage is required only when recorded requirements say so. There is no blended health score. Ask the deployment operator to configure the reviewed runtime if analysis is unavailable. Reassess after fixing findings; manual requests are limited to 10 per repository per hour; full reassessments also have a one-minute branch cooldown.',
  },
]

/** Shared page-header help for the organization health summary and reports. */
export const healthPortfolioHelp: HelpSection[] = [
  {
    title: 'Repository health metrics',
    content:
      'Repositories assessed counts accessible selected repositories with a completed report, including partial reports. Queued or running counts active requests. High and critical findings counts retained, unsuppressed analyzer findings from the latest report on each selected branch; it is unavailable when no validated analysis exists and does not imply unassessed repositories have zero issues. Incomplete or failed counts partial reports and failed requests. These health metrics cover the latest saved reports across all time, independently of the PR and CI date filter.',
  },
  {
    title: 'Health tab and priority findings',
    content:
      'On Engineering Overview, Health replaces the activity metrics with health metrics. The repository selector filters every health count and finding. The date selector is hidden because this view uses latest saved reports. Assessment status separates complete and partial reports, active requests, failures, cancellations and repositories not yet assessed. Priority findings shows at most five retained high or critical findings, with critical first; each opens the exact saved report. Refresh reloads saved data without starting an assessment.',
  },
  ...healthHelp,
]
