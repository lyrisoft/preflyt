# S5 usability review

Date: 2026-10-10
Scope: current implementation and source review. Applied directly on the running branch. No tests, builds, browser scenarios or GitHub Actions were run.

## Changes applied

- Integrations opens GitHub details immediately. Active accounts offer Manage repositories; unavailable accounts offer Reconnect GitHub for authorized administrators. Installation IDs are under Connection details.
- AI Models explains three steps: connect and test a model with prices, assign a stage and budget, then approve a skill and attach it to a standard. AI is optional; source sharing and automated publishing remain explicit choices.
- Model Router preserves Primary connection / Fallback connection. Shared custom selectors replace native selects; daily cost stays visible and token limits move to Advanced limits. Limits remain part of the saved form when collapsed.
- Repository checks replaces Control register. Related files found is informational, not a pass. The page explains where to find execution outcomes.
- Prior requested improvements remain: the assessment activity graph appears above list tabs, reports have their own detail view, standard details open in drawers, and Policies separates Branch policies from CI jobs.

## Journey review

| User | Current path | Source review finding | Validation still needed |
| --- | --- | --- | --- |
| New organization admin | Integrations → Connect GitHub → Manage repositories → repository → assessment | Connection setup and recovery are visible; no extra catalogue click is needed. | Observe a new admin reach a real report without coaching. |
| Developer | Assessments → report → check → evidence | List comparison and dedicated reports reduce clutter. File detection is explicitly separate from execution results. | Observe the user identify the issue and next action; check deep links and narrow layouts. |
| Engineering lead | Findings → severity/status filters → issue → triage | Priority is visible in the list; ownership is managed in the issue drawer. Owner names are not currently a column in the list. | Observe whether opening a drawer to identify ownership causes friction before adding another data dependency. |
| Organization admin enabling AI | Models → Model Router → Skills → Standards → policy | Setup order is explicit; budgets and source-sharing choices remain visible. AI stays optional. | Exercise a real tested model, missing rates, stale test, disabled execution and role restrictions. |

## Unmeasured acceptance

Completion time, errors and requests for assistance are **not measured**. This is a source review, not evidence that users completed the journeys. S4 implementation and S5 review are recorded; final usability acceptance remains pending. Run one batched local regression and representative usability sessions when the user requests validation.

Large installation changes from the friction audit remain separate follow-ups. This review does not expand execution permissions, activate merge enforcement, publish a policy, send code to a model or claim P0–P3 acceptance is complete.
