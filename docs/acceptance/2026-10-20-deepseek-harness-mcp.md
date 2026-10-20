# DeepSeek Harness MCP acceptance — 2026-10-20

The installed DeepSeek Harness desktop app completed a real MCP review against local Preflyt, using DeepSeek-V4.1-Flash with High reasoning. This was a source-only review of an existing public-repository finding, not a fabricated fixture or a runtime vulnerability reproduction.

| Item | Saved value |
| --- | --- |
| Repository | `lyrisoft/preflyt` (`1410129036`) |
| Health assessment | `db9aab9b-c16a-4831-97ab-f35c73b7e435` |
| Finding | `1b0cac311b310eb3f10d077617871a108dfe401d5d3d30e31c0b509c5c5b90db` |
| Assessed commit | `894d3c5528841e004adf71a6a7f312b45b7ca508` |
| Location | `apps/api/src/assessments/pipeline-processing.service.ts:27–31` |
| External evidence | `82625614-b0b8-41b3-952a-9fdff7622b72` |
| Outcome | `SUPPORTED` (maintainability observation) |
| Request key | `deepseek-mcp-e2e-20261020-1834` |

Observed in the real DSH session and Preflyt finding UI:

- Browser OAuth approval selected only the public `lyrisoft/preflyt` repository. The callback completed successfully and the MCP component became Running.
- `preflyt_list_repositories` exposed exactly that repository.
- `preflyt_get_finding` and `preflyt_get_source_context` read the exact finding and saved source at the assessed commit.
- DeepSeek identified the nested conditional and reported counterevidence and limitations. No shell commands, repository execution, current-branch check, patch, PR or merge was performed.
- One `preflyt_submit_verification` call saved the external report. A subsequent MCP read confirmed it. Independently opening Preflyt showed the attributed report and unchanged Needs review / Potential classification.
- The test connection was disconnected in Preflyt after completion, as the user requested. Its temporary DSH bundle was turned off. The saved report remained visible.

The first approval attempt expired while waiting for confirmation; reconnecting restarted the same scoped login. No credentials or authorization codes are retained in this record.

The review used the initial configuration-only desktop test bundle with pinned first-party MCP client and OAuth bridge. The subsequent ready-to-install connector removes manual configuration and npx by using DSH's bundled runtime. Its package-install and runtime checks are recorded separately below; the completed review above must not be misrepresented as a second review through a different package build.

## Ready-to-install connector

The final connector was checked in the same installed DSH desktop application:

- Copied the local Compose install URL into **Plugins → Add plugin**, without editing configuration or running a terminal command.
- DSH downloaded the archive and displayed **Installed**, version **1.0.0**, and a **Preflyt** plugin with its display description.
- **Enable now** loaded DSH's existing first-party MCP client and launched the pinned OAuth bridge using DSH's bundled runtime. Preflyt opened in the browser with **DeepSeek Harness**, the loopback callback, and an explicit, unselected repository list.
- Declined this additional approval: no second repository grant was authorized. The Preflyt connector and earlier test bundle were both off afterward. The original DeepSeek connection remained **Disconnected** in Preflyt.
- The rebuilt Preflyt page displayed the three installation steps and **Copy install link** instead of configuration snippets.

The public archive downloaded through the web proxy contained the expected seven files. Its only dependency was `mcp-remote@0.1.38`; installing that exact archive with lifecycle scripts disabled in a fresh temporary directory succeeded. The connector loads the MCP client already shipped with DSH, avoiding unpublished internal package dependencies.

Final focused checks: 28 API tests and 28 web tests passed, including the actual generated connector module, credential-free installer response, OAuth scope and revocation contracts, copied-task handoff, and narrow-screen light/dark layouts. API and web typechecks passed. Production API and web Compose images built successfully; API, worker and web were healthy after recreation.

The new installer was verified through its browser approval step. The saved real finding review described above remains the end-to-end evidence; no second model review was run with the final package.
