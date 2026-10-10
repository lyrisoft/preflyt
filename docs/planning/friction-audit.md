# Preflyt friction audit: setup to daily use

**Status:** Proposal for review. Not an implementation commitment.
**Date:** 2026-10-10
**Scope:** Every step and page a new organization meets, from first download to routine use.

## Summary

Preflyt is hard to set up, moderate to use, and slow to show its full value. The trust model (nothing turns green without verified evidence) is a strength. Most friction comes from Preflyt asking people to do work software could do, and from showing every caveat on the first screen instead of on demand.

**Target experience:** run one command, open the URL, create the admin account, click **Connect GitHub**, pick repositories, and see real results within 15 minutes, without reading documentation.

### The ten biggest sources of friction

| # | Friction | Where | Fix | Effort |
| --- | --- | --- | --- | --- |
| 1 | The GitHub App is created by hand: about 20 fields, two callbacks, six permissions, three events and one setting that must stay off | GitHub, then Settings → Configuration | GitHub App Manifest flow: one **Create GitHub App** button | M |
| 2 | Every connection change needs a manual restart of API and worker | Settings → Configuration | Hot-reload connection settings | M |
| 3 | Super Admin lands on pages that say "You do not have access to this resource" with no next step | Overview, Standards, Settings | First-run setup checklist | S |
| 4 | Install needs four hand-generated secrets, an encryption key and a 49-variable template | `.env` | `preflyt init` generates everything | M |
| 5 | Selecting a repository does nothing visible; profile, standards and assessment are three more manual steps | Repositories, repository page | Auto-profile and auto-adopt Recommended on selection | S |
| 6 | Verified results need attestations, a pinned GitHub CLI, Sigstore roots and JSON contracts | CI activity, deployment env | Official attested Preflyt GitHub Action, trusted by default | L |
| 7 | Most results stay **Config found** or **INCOMPLETE**, with no path shown to "verified" | Repository Overview, Assessments, Quality Gates | "Path to verified" on each control | M |
| 8 | Governance is a multi-step chain across Teams, Standards, Policies and Quality Gates, each needing a second approver | Teams → Policies → Quality Gates | Guided adoption flow with one review screen | M |
| 9 | Eleven coverage states, five gate outcomes and three trust levels shown up front | Everywhere | Four plain states, detail behind "Why?" | M |
| 10 | Webhooks cannot reach a local trial, so CI evidence never appears when evaluating | Local install | Polling fallback | S |

Effort: **S** about a week or less, **M** a few weeks, **L** a larger project.

### How this was assessed

- A fresh Docker Compose build was run and used as Super Admin. The local override failed at startup; that was fixed in `06cea22`.
- First-run screens were captured in the real app.
- The user-facing text of every page was read from `apps/web/src/features`.
- Setup steps were taken from the deployment and operations documentation and checked against the code while writing `apps/docs`.
- The GitHub App, installation and GitHub sign-in steps were **not** run live, because that needs a real GitHub App.

---

## Stage 1: Before installing

### 1.1 Deciding whether and how to install

**Today**

- The README opens with a long status paragraph full of phase codes and caveats.
- Operations documents are named by delivery phase ("P1.2a", "P4 acceptance").
- There is no hosted trial or demo.

**Friction**

- An evaluator cannot tell in a minute what Preflyt does for them or what it costs to try.
- "Is it ready?" is answered with implementation detail.

**Make it go away**

- Lead the README with three lines: what it does, the one-command install and the docs link. The user documentation site (`apps/docs`) now exists.
- Offer a read-only demo instance with seeded data, as the Databasement reference site does.
- Move phase-coded documents under a contributor section.

**Effort:** S · **Impact:** Medium

---

## Stage 2: Installation

### 2.1 Getting images

**Today**

- No published images are confirmed yet.
- Evaluators build from source, which took several minutes on a developer laptop.

**Friction**

- Slow first contact and a large download.
- Docker build failures are the user's problem to diagnose.

**Make it go away**

- Publish versioned images on every release tag. The workflow already exists.
- Make `docker compose pull && up` the default path, and source builds the exception.

**Effort:** S · **Impact:** High

### 2.2 The environment file

**Today**

- Copy `.env.example` (49 variables).
- Generate two database passwords and `CONFIGURATION_ENCRYPTION_KEY` by hand.
- Set `WEB_ORIGIN` and the Super Admin username and password (24 to 128 characters).
- GitHub sign-in later needs a second key (`GITHUB_USER_TOKEN_ENCRYPTION_KEY`), and AI a third (`AI_PROVIDER_ENCRYPTION_KEY`).

**Friction**

- Four required values block startup with errors such as `Set CONFIGURATION_ENCRYPTION_KEY`.
- Most of the 49 variables are advanced trust and telemetry controls, but they sit in the same file as the essentials.
- There is no key rotation, so losing a key loses saved credentials.

**Make it go away**

- Add a `preflyt init` command (or install script) that asks only for the domain, generates every password and key, writes `.env` with mode 600 and starts the stack.
- Split the template: a ten-line `.env.example` for essentials and an `.env.advanced.example` for trust, telemetry and native execution.
- Generate the three encryption keys together on first boot if they are absent. Show a one-time **Download recovery kit** prompt in the UI so backup is guided, not assumed.

**Effort:** M · **Impact:** High

### 2.3 Starting the stack

**Today**

- `docker compose ... up -d --build --wait`.
- The local override set `NODE_ENV=production`, so the API and worker crashed on `http://localhost` callbacks. Fixed in `06cea22`, but nothing in CI exercises this path.

**Friction**

- The documented trial path broke unnoticed.
- Two compose files and long flags to remember.

**Make it go away**

- Run `compose.local.yaml` plus `scripts/deploy/smoke.mjs` in CI on every change to compose, configuration or authentication.
- Wrap the commands: `preflyt up`, `preflyt down`, `preflyt logs`, `preflyt upgrade`.

**Effort:** S · **Impact:** High

### 2.4 HTTPS and reverse proxy

**Today**

- Preflyt binds to `127.0.0.1:8080`.
- The operator must supply a TLS reverse proxy for anything beyond localhost.

**Friction**

- An extra component to configure before teammates or GitHub webhooks can reach Preflyt.

**Make it go away**

- Add an optional bundled Caddy profile with automatic certificates: `preflyt init --domain preflyt.example.com`.
- Keep bring-your-own proxy as the advanced option.

**Effort:** S · **Impact:** Medium

---

## Stage 3: First sign-in

### 3.1 Sign-in page (`/sign-in`)

**Today**

On a fresh install the page reads: *"Organization sign-in is not configured. Contact your Preflyt administrator."* A small **Super Admin access** link sits below.

**Friction**

- The person reading this usually *is* the administrator, so the message points them at themselves.
- The working path is the smallest element on the page.

**Make it go away**

- On a fresh install, replace the card with **Set up Preflyt**, which leads straight into first-run setup.
- After setup, show only the sign-in methods that are actually enabled.

**Effort:** S · **Impact:** High

### 3.2 Super Admin login (`/super-admin/login`)

**Today**

- Credentials come from environment variables set before first start.

**Friction**

- The password must be chosen and stored before the product has been seen.
- Changing it means editing `.env` and restarting.

**Make it go away**

- On first visit, let the operator create the admin account in the browser, protected by a one-time setup code printed in the API log.
- Keep environment-seeded credentials as a recovery option.

**Effort:** M · **Impact:** Medium

### 3.3 Landing as Super Admin

**Today**

- **Engineering Overview** shows "Connect your first repository" with a **Connect and select repositories** button.
- The sidebar shows **Select organization / Organization setup**.
- **Engineering Standards** and the Settings **Workspace** tab show *"You do not have access to this resource. Ask your administrator for access."*

**Friction**

- The Super Admin is told to ask an administrator for access.
- The next step (configure GitHub, then sign in with GitHub as an organization owner) is not mentioned anywhere in the product.
- Sidebar items lead to dead ends.

**Make it go away**

- Show a first-run **Setup checklist** with live status:
  1. Connect GitHub
  2. Install on your organization
  3. Create your workspace
  4. Select repositories
  5. Review your first results
- Hide or disable workspace-only navigation until a workspace exists, with a tooltip saying why.
- Replace "Ask your administrator" with the specific missing step whenever the viewer is the administrator.

**Effort:** S · **Impact:** Very high

---

## Stage 4: Connecting GitHub

### 4.1 Creating the GitHub App (in GitHub)

**Today**

- The operator creates the App by hand in GitHub settings, entering: name, homepage, two callback URLs, a setup URL, a webhook URL and secret, six permissions and three event subscriptions.
- They must enable "Expire user authorization tokens" and keep "Request user authorization during installation" **off**.
- Then they create a client secret and generate a private key.

**Friction**

- This is the single largest source of setup failure.
- Any typo surfaces later as a confusing install or sign-in error.
- The "must stay off" setting goes against what most guides recommend.

**Make it go away**

- Use GitHub's **App Manifest flow**. Preflyt builds the manifest (permissions, callbacks, events, webhook URL from `WEB_ORIGIN`), the admin clicks **Create GitHub App**, confirms on GitHub, and GitHub returns the App ID, client secret, private key and webhook secret to Preflyt automatically.
- Offer two variants: "Read-only (recommended)" and "With readiness checks" (adds Checks: write).

**Effort:** M · **Impact:** Very high

### 4.2 Settings → Configuration → GitHub

**Today**

- Super Admin pastes App ID, Client ID, Client secret, Private key and Webhook secret.
- They confirm two callback URLs and toggle **GitHub sign-in** and **GitHub event ingestion**.
- After **Save changes**, both API and worker must be restarted from the command line.
- GitHub sign-in also needs `GITHUB_USER_TOKEN_ENCRYPTION_KEY` in `.env`, so the operator edits a file and restarts again.

**Friction**

- Configuration is split between the UI and `.env` for one feature.
- The restart step is easy to miss, and until then the old connection keeps working, which looks like "my change did nothing".

**Make it go away**

- With the manifest flow, this form becomes read-only confirmation.
- Hot-reload connection settings in API and worker.
- Failing that, add a **Restart now** action that reports when both processes are back.
- Generate the GitHub user-token key at first boot (see 2.2) so sign-in needs no file edit.
- Add a **Test connection** button that checks App credentials, installation access and webhook reachability.

**Effort:** M · **Impact:** High

### 4.3 Installing the App and creating the workspace (`/github-onboarding`)

**Today**

- The admin installs the App in GitHub.
- Then they sign out of Super Admin, choose **Continue with GitHub**, and pick their organization on **Choose your organization**. Only a GitHub organization owner can connect a new workspace.
- Access Control also offers **Create legacy workspace** for identity-provider deployments.
- OIDC deployments use `/setup` with a bootstrap token whose SHA-256 must be precomputed into `.env`.

**Friction**

- Three different workspace-creation paths.
- Signing out of one identity and into another mid-setup is disorienting.
- The person doing setup may not be a GitHub organization owner, which blocks them with no alternative.
- The bootstrap-token flow requires hashing a secret by hand.

**Make it go away**

- Fold installation into the checklist: **Install on GitHub** opens the install page and returns to Preflyt, which detects the installation.
- Let the Super Admin create the workspace for a detected installation, then invite the organization owner, instead of requiring a sign-out and sign-in.
- Hide **Create legacy workspace** unless OIDC is configured.
- Generate the OIDC bootstrap token in the UI and show it once, instead of asking for its hash in `.env`.

**Effort:** M · **Impact:** High

### 4.4 Webhooks during a local trial

**Today**

- GitHub cannot deliver to `localhost`, so a local evaluation never receives pull request or CI events.

**Friction**

- The CI evidence, pull request and gate features look empty during evaluation, the moment Preflyt most needs to impress.

**Make it go away**

- Fall back to periodic polling of GitHub's checks and workflow APIs when no webhook has been received recently.
- Show "Using polling (webhooks not reachable)" in the health panel.

**Effort:** S · **Impact:** High

---

## Stage 5: Choosing repositories

### 5.1 Repositories (`/apps`)

**Today**

- Summary tiles, an inventory chart, GitHub connections and repository cards.
- Owners and Admins tick a checkbox on each card to select it.
- Only selected repositories link to a page.
- Other roles see the inventory with no explanation of why they cannot select.

**Friction**

- Selecting a repository changes nothing visible. The user must then open it and run three more steps (5.2 to 5.4).
- A large organization means ticking many boxes one at a time.

**Make it go away**

- **Selecting a repository starts work:** profile it immediately and adopt the Recommended standards for its detected stack (observe mode, editable). The card shows progress, then the first result.
- Add **Select all**, filter-then-select and "select repositories matching…" for bulk choice.
- For non-admins, replace missing checkboxes with "Ask an Owner or Admin to select repositories" and a list of who those people are.

**Effort:** S · **Impact:** Very high

---

## Stage 6: The repository page

### 6.1 Overview tab: profile

**Today**

- An unprofiled repository shows **Discover profile**.
- Results include a summary band, a **Control register** filtered by **All / Needs review / Config found**, Stack, Tooling and Snapshot.
- Controls read **Configuration found**, **Not found** or **Unknown**.

**Friction**

- A manual first step.
- "Config found" sounds like success, but it only means a file exists.
- No control says what would make it better.

**Make it go away**

- Profile automatically on selection and on every push to the default branch, so the **Discover profile** button disappears.
- Plain labels: "Set up (not yet proven to run)", "Missing", "Couldn't tell".
- Every non-passing control gets a **Fix** action that opens a pull request with a reviewed template (CODEOWNERS, lockfile, secret scanning workflow and so on) and a **Why?** link.

**Effort:** M · **Impact:** Very high

### 6.2 Standards tab

**Today**

- **Choose packs** opens a sheet with an **Adoption profile** (Default, Recommended, Strict) and pack checkboxes, then **Save selection**.
- When new pack versions exist: "Use Edit selection to choose them, then publish a new policy revision to adopt the changes."

**Friction**

- The user must choose a profile before they know what it changes.
- Pack updates need a second, separate publishing step in another place.

**Make it go away**

- Pre-select Recommended with the packs matching the detected stack (already computed), so the default is one click or zero.
- Show a live preview: "This adds 4 required controls; 2 are already set up."
- Make pack upgrades a single **Update to latest** action with a diff preview, publishing as part of the same flow.

**Effort:** S · **Impact:** Medium

### 6.3 Assessments tab

**Today**

- **New assessment** opens a sheet asking for a 40-character commit SHA (pre-filled with the profiled commit).
- Optionally, the user associates a CI result with each control, then chooses **Create assessment**.
- Details include coverage, a controls table and **Source and verification details**.

**Friction**

- "Assessment", "snapshot", "freeze" and "associate" are concepts users must learn before they get value.
- Associations are recorded as unverified, so the manual effort rarely improves the outcome.

**Make it go away**

- Create assessments automatically for every default-branch push and pull request head (pull requests already do this). Keep **New assessment** as an advanced action.
- Remove manual CI association from the default form; rely on approved sources (6.4).
- Rename in the UI: "Assessment" becomes **Check run in Preflyt** or "Report". Keep the API term.

**Effort:** M · **Impact:** High

### 6.4 CI activity tab: CI results, sources, reports and provenance

**Today**

- CI results with a row menu (**Delivery details**, **Import JUnit report**, **Import SARIF report**).
- Approving a CI source asks for a **GitHub App ID**, **Exact check name** and **Workflow ID**, or a recorded source.
- Verified provenance needs deployment-managed attestation settings (GitHub CLI path and hash, Sigstore root path and hash, workflow allowlist, execution contracts).

**Friction**

- The hardest wall in the product. Getting a verified result needs DevSecOps expertise and server file access.
- The UI states "Approving a source does not prove that its test or scanner ran" without saying what would.

**Make it go away**

- Ship an **official Preflyt GitHub Action** (reusable workflow) that runs the standard checks at pinned versions, emits SARIF and JUnit, and attests them with GitHub artifact attestations. Preflyt trusts its own Action identity by default, so results are verified with zero configuration.
- A **Turn on verified checks** button opens a pull request adding the workflow.
- Auto-suggest source bindings from observed check names ("We saw `test` and `lint`; use them for these controls?").
- Keep custom workflows, organization signing keys and manual identifiers as advanced options.

**Effort:** L · **Impact:** Very high

---

## Stage 7: Workspace pages

### 7.1 Engineering Overview (`/`)

**Today**

- Summary metrics, an assessment-activity calendar, repository status, pull requests requiring attention, and a "Data sources and limits" section.
- The copy carries several caveats, for example "A darker or brighter cell indicates assessment volume, not passing checks or merge readiness."

**Friction**

- The page explains what its charts do *not* mean instead of saying what to do next.
- With no data, everything is empty at once.

**Make it go away**

- Lead with a ranked to-do list: "3 repositories need attention: add secret scanning to `api` …", with Fix actions.
- Move caveats into the existing Help drawer.
- Use the empty state as the setup checklist (3.3).

**Effort:** M · **Impact:** High

### 7.2 Assessments (`/assessments`)

**Today**

- Activity, tracked commits and pull requests per repository, behind a repository picker.

**Friction**

- It overlaps with the repository page's Assessments tab, and the difference is not stated.

**Make it go away**

- Make this the cross-repository view (all recent results, filterable), and link each row to the repository tab.
- Or merge it into the Overview.

**Effort:** S · **Impact:** Low

### 7.3 Findings (`/findings`)

**Today**

- Reported issues and "Missing or unverified results".
- Empty until assessments with failed checks or imported SARIF or JUnit reports exist.
- The empty state says: "Create an assessment from a repository to collect check outcomes and findings from imported reports."

**Friction**

- The page is empty during evaluation, and filling it needs manual assessments and report imports.

**Make it go away**

- Populate automatically from the official Action's SARIF output (6.4) and from profile gaps.
- Group by severity and repository, with Fix actions and assignees.

**Effort:** M (after 6.4) · **Impact:** High

### 7.4 Contributors (`/contributors`)

**Today**

- Activity by contributor and repository from pull request and commit events, with a Help drawer.

**Friction**

- Low. It relies on GitHub activity Preflyt has received, so it starts empty after a new install and stays sparse in local trials without webhooks (see 4.4).

**Make it go away**

- Backfill from the GitHub API on selection so it is populated immediately.

**Effort:** S · **Impact:** Medium

---

## Stage 8: Governance

### 8.1 Engineering Standards (`/standards`)

**Today**

- **Organization standards** and **Built-in standards**.
- **New standard**, versions and adoption, supported checks, and **Add AI Review**, which requires a skill that is already approved and enabled.

**Friction**

- Creating a custom standard requires understanding checks, versions and AI skills together.
- Adding an AI Review dead-ends if no skill is approved ("Approve and enable a skill to add an AI Review. Open Skills").

**Make it go away**

- Start from **Copy a built-in standard** as the default way to create one.
- Allow an AI Review to be added inline with a built-in skill, with skill approval as part of the same flow.

**Effort:** M · **Impact:** Medium

### 8.2 Teams (`/teams`)

**Today**

- Create or import teams from GitHub, approve repository scope, then assign standards.
- After saving: "Assignment saved. Review, approve and publish the repository drafts in Policies."

**Friction**

- One intent ("this team follows these standards") takes four pages: Teams, Standards, Policies and Quality Gates.

**Make it go away**

- One guided flow: choose team, choose standards, review the impact (repositories and controls affected), then request approval.
- The approver gets a single review screen and notification.

**Effort:** M · **Impact:** High

### 8.3 Policies (`/policies`)

**Today**

- Branch policy revisions per repository.
- "Approval requires a different authorized reviewer."
- "These policies do not block merges or change assessment results."

**Friction**

- Policies that do not block anything, plus a second-person approval, make the purpose unclear.
- Solo evaluators cannot complete the flow, because only Super Admin may self-approve, with an audited exception.

**Make it go away**

- Say what a policy *does* in one line ("defines what a passing readiness check requires on `main`").
- Allow self-approval in **evaluation mode**, clearly labelled and audited, for workspaces with a single admin.
- Show the approval request inline with a **Notify approver** action.

**Effort:** S · **Impact:** Medium

### 8.4 Quality Gates (`/quality-gates`)

**Today**

- Saved gate results (observe-only), GitHub rulesets (drafts, insights, deployments) and the readiness check.
- The readiness check panel says: "Publication is disabled in this deployment. Enable `GITHUB_CHECK_PUBLICATION_ENABLED` on the API and grant the GitHub App Checks: write permission."

**Friction**

- Rulesets, drafts, insights, deployments and publications are many concepts on one page.
- The publication message tells users to set an environment variable, but check publication is now a switch in **Settings → Configuration → Governance**. The instruction is stale.

**Make it go away**

- Fix the message to point at the Governance switch and the App permission. With the manifest flow (4.1), offer **Add Checks permission** directly.
- Present the page as one question: "What should block a merge on `main`?", with a preview of current results, then **Activate**.

**Effort:** S (message) / M (flow) · **Impact:** Medium

---

## Stage 9: Intelligence

### 9.1 AI Intelligence (`/intelligence`)

**Today**

- If AI is off: "AI is disabled for this deployment. Your deployment administrator can enable AI settings."
- With AI on, admins add models with provider, model name and API key.
- They set budget rates in "cents per million tokens", input and output token limits, a daily cost limit in US cents, and per-stage routing in a **Model router**.

**Friction**

- Two administrators involved (deployment, then organization).
- Pricing in cents per million tokens must be looked up and typed by hand.
- Routing per SDLC stage is a power-user concept shown to everyone.

**Make it go away**

- Ship known provider presets with current list prices and sensible limits pre-filled.
- Hide the Model router behind **Advanced**, with one default model for all stages.
- When AI is disabled, the Super Admin sees **Enable AI** directly.

**Effort:** S · **Impact:** Medium

### 9.2 Skills (`/skills`)

**Today**

- Create, review and approve Markdown skill files.
- Third-party imports.
- Skills must be approved before they can be assigned to standards.

**Friction**

- The value of skills is unclear until they are assigned, and assignment happens elsewhere (8.1).

**Make it go away**

- Ship the 12 built-in skills pre-approved and assignable, and show which standards use each.
- Keep custom and third-party skills behind review.

**Effort:** S · **Impact:** Medium

---

## Stage 10: Administration

### 10.1 Access Control (`/access-control`)

**Today**

- Tabs: **People**, **GitHub members**, **Roles & permissions**, **Activity**.
- Eight built-in roles.
- **Give access**, plus GitHub member sync and role assignment.

**Friction**

- Eight roles is a lot to choose from when inviting one person.
- Non-admins see "An Owner or Admin role is required to manage people."

**Make it go away**

- When giving access, suggest three common roles (Admin, Engineer, Viewer) with the rest under **More roles**.
- Let teammates request access from their sign-in screen, with a one-click approve for admins.

**Effort:** S · **Impact:** Medium

### 10.2 Integrations (`/integrations`)

**Today**

- A catalogue: GitHub App connection and GitHub check results and workflow runs.

**Friction**

- Low. It largely duplicates Repositories and CI activity.

**Make it go away**

- Merge GitHub status into the Settings health panel (11.2), and keep this page for future non-GitHub integrations.

**Effort:** S · **Impact:** Low

### 10.3 Notifications and channels (`/notifications`, Settings → Notifications)

**Today**

- The inbox shows "Notifications are disabled for this deployment" until Super Admin enables them and configures SMTP in Settings → Configuration.
- Organization email channels then show "Email delivery is not ready" until SMTP works.

**Friction**

- Three gates (deployment switch, SMTP, channel) before one email arrives.

**Make it go away**

- Enable in-app notifications by default.
- Add SMTP presets (Gmail, SES, SendGrid) and a **Send test** step inside the SMTP form.
- Make the channel page offer **Set up email** for Super Admin instead of a blocked state.

**Effort:** S · **Impact:** Low

### 10.4 Settings (`/organization-settings`)

**Today**

- Tabs: **Workspace**, **Notifications**, **Appearance**, **Configuration**.
- Configuration has six sections (GitHub, Governance, Single sign-on, Notifications, Intelligence, Native execution).
- The sidebar label is "Settings" while the route is `/organization-settings`, and personal settings live at `/settings`.

**Friction**

- Deployment-wide and workspace settings sit side by side.
- Two different "Settings" areas.

**Make it go away**

- Separate **Deployment** (Super Admin only) from **Workspace**.
- Merge personal preferences into the profile menu.

**Effort:** S · **Impact:** Low

---

## Stage 11: Running Preflyt

### 11.1 Routine operations

**Today**

- Connection changes need restarts.
- A failed webhook delivery can only be retried by editing PostgreSQL (`FAILED` to `RECEIVED`).
- Upgrades are a manual sequence of backup, build, migrate, start and smoke test.

**Friction**

- Routine maintenance needs shell and database access and careful reading.

**Make it go away**

- Hot reload (4.2).
- A **Retry** button on failed deliveries.
- `preflyt upgrade` performs backup, pull, migrate, start and smoke test, and rolls back automatically on failure.

**Effort:** M · **Impact:** Medium

### 11.2 Knowing whether it is healthy

**Today**

- Container health checks and logs.
- Problems surface as restarts or silent feature switch-offs (for example a configuration decryption failure disables live switches).

**Friction**

- Diagnosis requires the command line.

**Make it go away**

- A **Health** page for Super Admin: database, queue, worker heartbeat, GitHub App, webhook reachability, SMTP, AI provider and encryption keys. Each shows a status, the last error and the fix.

**Effort:** M · **Impact:** Medium

---

## Cross-cutting friction

| Pattern | Today | Make it go away |
| --- | --- | --- |
| Caveat-first copy | Most pages explain what results do *not* mean | Put caveats in the Help drawer; lead with the next action |
| Vocabulary | Assessment, snapshot, profile, coverage (11 states), gate outcome (PASS, WARN, BLOCK, INCOMPLETE), trust levels | Four user-facing states: **Passing**, **Failing**, **Needs attention**, **Not checked yet**. Detail behind **Why?** |
| Dead-end permissions | "You do not have access to this resource. Ask your administrator for access." | Say which role is needed, who holds it, and offer **Request access** |
| Split configuration | Some settings in `.env`, some in the UI, some on organization pages | Generate infrastructure secrets; everything else in the UI |
| Manual steps the system could do | Discover profile, choose packs, create assessment, associate CI results | Do them automatically on selection and on events; keep manual actions as advanced |
| Two-person rules everywhere | Policy approval needs a second reviewer | Keep for production, with an audited evaluation mode for single-admin workspaces |

## What must not be simplified

- **Meaning of green.** "Passing" only ever means verified evidence at that commit.
- **AI stays advisory.** It never decides a gate result.
- **Nothing executes code or blocks merges without explicit approval.**
- **Selection stays explicit.** Preflyt only reads repositories someone chose.

Simplicity should come from defaults, automation and progressive disclosure, never from relaxing these rules.

## Suggested order of work

| Order | Change | Sections | Effort | Why first |
| --- | --- | --- | --- | --- |
| 1 | First-run setup checklist and admin-aware empty states | 3.1, 3.3 | S | Removes every dead end on day one |
| 2 | Auto-profile and auto-adopt Recommended on selection | 5.1, 6.1, 6.2 | S | Real results on the first screen |
| 3 | GitHub App Manifest flow and hot-reload configuration | 4.1, 4.2 | M | Removes the largest setup failure point |
| 4 | Polling fallback and API backfill | 4.4, 7.4 | S | Evaluations show data without public URLs |
| 5 | `preflyt init` with generated secrets and published images | 2.1, 2.2, 2.3 | M | One-command install |
| 6 | Four plain states with **Why?** detail and caveats moved to Help | Cross-cutting, 7.1 | M | Removes most of the learning curve |
| 7 | Fix-by-pull-request actions | 6.1, 7.1, 7.3 | M | Turns findings into progress |
| 8 | Official attested Preflyt Action, trusted by default | 6.4, 7.3 | L | Verified results without specialist work |
| 9 | Guided governance flow and evaluation-mode approval | 8.2, 8.3, 8.4 | M | Makes enforcement reachable |
| 10 | Health page, retry button, `preflyt upgrade` | 11.1, 11.2 | M | Low-effort operations |

Items 1 to 4 together would bring a new organization from install to useful results in under 15 minutes.

### Quick fixes (under a day each)

- Correct the readiness check message to point at **Settings → Configuration → Governance** (8.4).
- Add the local Compose smoke test to CI (2.3).
- Show the setup path on the fresh-install sign-in page (3.1).
- Hide **Create legacy workspace** unless OIDC is configured (4.3).
