# Preflyt RBAC and resource authorization

**Status:** Organization memberships, predefined roles, repository grants and existing API resource checks implemented. Policy publication, managed ruleset activation and native-request permissions are implemented; native Docker/Kubernetes dispatch and organization AI administration are implemented behind deployment controls; reviewed policy exceptions are implemented; live native acceptance remains pending. **P0 foundational**, extended within existing phases. GitHub login, inherited organizations, verified owner onboarding and username-based grants are implemented behind a deployment flag under [ADR-0007](../architecture/ADR-0007-github-first-identity-and-organizations.md); explicit recent-proof legacy identity linking and ownerless recovery are implemented; clean deployment acceptance remains. See [OIDC ADR](../architecture/ADR-0003-oidc-user-authentication.md) and [roadmap](../roadmap/incremental-delivery.md).

## Authorization model

Use GitHub login for GitHub-connected workspaces, with OIDC retained as an explicit compatibility option during migration. Preflyt-owned, **server-enforced organization-scoped RBAC** remains authoritative for Preflyt actions. Authorization checks combine subject (user, team or service), action, resource (organization/repository/assessment/policy/environment), membership, explicit grants and policy constraints. Default deny. Platform administrator does not implicitly receive customer source or evidence access.

**Predefined roles:** Platform Administrator (installation operations only), Organization Owner (ownership and organization governance), Organization Admin (members/integrations and organization notification channels), Policy Manager (publish/enforce rules, approve others' exceptions), Security Engineer (security evidence and triage), Engineering Lead (assigned repositories), Developer (assigned repository assessments), Auditor (scoped read-only evidence/audit), Viewer (scoped dashboards). Owners/admins must still meet separation-of-duties requirements for sensitive approvals.

**Initial permission identifiers:** `organization.members.manage`, `organization.settings.update`, `repository.read`, `repository.connect`, `repository.manage`, `assessment.read`, `assessment.run`, `assessment.cancel`, `finding.read`, `finding.triage`, `policy.read`, `policy.draft`, `policy.publish`, `policy.enforcement.manage`, `policy.exception.request`, `policy.exception.approve`, `ai.provider.manage`, `ai.routing.manage`, `ai.usage.read`, `audit.read`, `execution.request`, `environment.read`, `performance.run`. Never infer authority from a frontend role label.

**Contributor permissions:** `contributors.read`, `contributors.activity.read`, `contributors.policy_evidence.read` are repository-scoped and require authorization to underlying GitHub evidence. Organization aggregates must exclude unauthorized private repositories. See [Engineering Contributors](engineering-contributors.md).

**Implemented team permissions:** `team.read`, `team.manage`, `team.import` and `team.policy.assign`. Team management covers local team creation and explicit repository policy scope; import covers GitHub discovery, import and synchronization; assignment covers impact preview and applying pinned standards. Imported GitHub team membership does not grant Preflyt permissions or private repository access. Team policy scope remains separate from RBAC grants. See [Teams and Policy Inheritance](teams-and-policy-inheritance.md).

**Implemented notification channel permission:** `notifications.manage` is granted only to organization Owner and Admin. It controls recipient-list visibility, named organization email channel creation/editing, pause/resume, removal and queued tests in Settings → Notifications. Fresh active organization and provider authorization applies. Personal inbox/email preferences remain independent. Super Admin deployment configuration controls the shared SMTP transport; platform administration alone does not substitute for current organization authority.

## Scope and security

- P0 supports organization membership and repository-level assignments. Implemented Teams group existing members and compose standards within explicitly approved repository policy scope; they do not grant workspace or repository access.
- In the GitHub-first target, repository access is the intersection of the user's verified GitHub repository rights, installed/selected scope and Preflyt role/grants. Even a Preflyt Owner/Admin cannot read private repository evidence outside their GitHub rights. Current OIDC deployments need the migration described in ADR-0007 before this additional provider-user bound is enabled.
- Session subject, active organization, repository ownership and permissions must be verified server-side on every request. Never trust organization IDs or permissions from browser, webhook, queue payload or AI output.
- Background jobs capture an authorized actor/service identity and resource context; reauthorize sensitive writes when executing. Services receive narrow independent identities.
- Separate permission to run an assessment from admission to execute untrusted code, access credentials, send source to external models or run load against an environment.
- No self-approval of policy exceptions or own enforcement bypass, including users with multiple roles. Audit changes, approvals, role assignments and denials.
- UI may hide unauthorized controls, but NestJS guards and resource-scoped queries are authoritative. Test cross-organization isolation, IDOR, revoked memberships and stale sessions.

## GitHub-first access target

- Connected GitHub organizations supply workspace identity; there is no separate manual organization creation in the normal flow. Retain internal records for tenant isolation, settings and history.
- Admins select existing active organization members or resolve a username to its stable GitHub account ID, then explicitly grant a Preflyt role and repositories. Listing a member or recording contributor activity never grants access.
- Read organization membership with Members read permission. No GitHub invitation or membership writes are required. Outside collaborators, bots and pending GitHub invitations are deferred.
- Existing local role changes apply on the next request. Signed provider events revoke affected access; reconcile missed events and require GitHub access evidence no older than five minutes. Unavailable/expired authorization evidence fails closed with a retryable error. Fresh checks protect privileged changes.
- Preserve independent approval, explicit Super Admin recovery and the separate privileged ruleset connection. Migration must prove account links without matching emails/usernames.

Full login, bootstrap, revocation, migration and acceptance contracts: [ADR-0007](../architecture/ADR-0007-github-first-identity-and-organizations.md).

## Phase-aligned deliverables (no reordering)

| Phase | RBAC capability | Completion evidence |
| --- | --- | --- |
| **P0** | GitHub login and verified organization-owner onboarding, inherited GitHub organizations, member selection, predefined roles and repository grants; preserve existing OIDC during migration | Unauthorized repo/organization access denied; owner can assign/revoke access; audit recorded |
| **P1** | Scope assessment, finding, imported CI artifact and audit visibility to authorized repositories | Cross-repo evidence access and forged job payload denied |
| **P2** | Separate policy draft/publish/enforce, exception request/approve, version-change authorization | Developer cannot enable blocking gate; requester cannot approve own exception |
| **P3** | Independent sandbox execution admission, tool permissions and worker identity | Authorized assessment user cannot escalate to unsafe code execution |
| **P4** | AI provider and model-routing administration, usage visibility, source-egress permissions | Developer cannot reveal/rotate provider secrets or bypass model egress policy |
| **P6–P7** | CLI user identity and QA/release-candidate permissions | Local identity cannot forge trusted server gate or QA sign-off |
| **P8–P10** | Performance target registration, test execution and high-impact approval | Unauthorized target, production load or quota bypass denied |
| **P11–P12** | Incident evidence scoping, policy proposal approvals and provider-specific permissions | Production recommendations cannot directly enforce policy |

**Delivery rule:** RBAC functionality required by a phase is included in that phase's deployable, usable acceptance criteria. Never add an independent phase or invalidate already completed tasks without implementation review.

## P0 acceptance tests

1. GitHub organization-owner onboarding is verified, atomic and audited; installation access alone grants no Preflyt ownership. Legacy OIDC bootstrap remains protected during migration.
2. Organization Admin can assign a Developer to repository A without granting repository B.
3. Viewer/Auditor cannot mutate policy, providers, integration or findings.
4. Direct API calls cannot bypass hidden UI controls; cross-tenant and IDOR probes fail.
5. Background work does not trust forged org/repository identifiers.
6. Role change/revocation takes effect according to documented session invalidation policy.
7. Deployment and rollback preserve membership/grant integrity.

**Later:** custom role designer, enterprise IdP group sync and environment-granular inheritance only after explicit design/security review.

## Current implementation

See [organization access and contributors](../operations/scoped-access-contributors.md) for shipped workflows, the explicit compatibility migration, live-request revocation behavior, contributor permission boundaries and remaining limitations. Scoped policy publication and managed ruleset activation permissions are implemented, as are separate native-request permissions and signed runtime preflight. Native Docker/Kubernetes dispatch and bounded advisory AI egress are implemented behind deployment controls. Organization baselines, explicit team scope and version-pinned inheritance are implemented. Explicitly reviewed nested scope is implemented; reviewed policy exceptions are implemented; live native acceptance remains pending. Preflight is not execution acceptance.

## Access Control interface

- **People:** search/filter workspace members and grant or edit a predefined role plus repository access in a side panel. GitHub-linked workspaces verify the entered username against active organization membership.
- **Roles & permissions:** inspect the eight built-in organization roles and their actual API permissions; choose a role without creating permission definitions.
- **Activity:** inspect recorded membership and role changes separately from member management.

An active local Super Admin may create and approve the same policy definition. The API records `SUPER_ADMIN_SELF_APPROVAL` and an audit event, and checks organization/repository permissions at approval and publication. This exception does not authorize self-approved policy waivers or enforcement bypass. All other publishers require independent definition approval. An active local Super Admin may approve and activate their own ruleset proposal. The API records `SUPER_ADMIN_SELF_APPROVAL` and `github.ruleset_super_admin_self_approved`, rechecks the active Super Admin role before the GitHub write, and still requires scoped ruleset/enforcement permissions, unchanged preview and live preflight. This ruleset exception does not permit self-approved waivers or enforcement bypass.

The GitHub members tab loads the active organization member directory, supports search and pagination, and provides **Sync members** and **Assign role** actions. Directory snapshots are cached for up to five minutes in Redis with a bounded local fallback; sync does not create identities or grant access. Assignment verifies active membership again before saving.

For GitHub-linked workspaces, **Grant access** uses a searchable member dropdown showing only users without active Preflyt access, including revoked members. Select the user, then choose a built-in role and repositories. Existing members are edited through their access record.

For a workspace that already has the GitHub App connected, use **Access Control → GitHub members → Link GitHub organization**. GitHub sign-in must be enabled and its callback registered first. The flow binds the request to the original authenticated workspace Owner session and verifies a GitHub organization owner before confirmation. It reuses the same internal organization and installation, preserves repositories, policies, grants and history, and grants that verified GitHub owner access with an audit record. It never moves an installation between workspaces or merges existing identities automatically.

### Native execution requests (P3)

`execution.run` is implemented separately from imported `assessment.run`. Owner and Admin have organization scope; Security Engineer needs an assigned repository. It permits durable request/cancellation only after fresh resource authorization. History uses `assessment.read`. Docker and Kubernetes dispatch are implemented behind deployment controls. Connected-repository requests remain blocked without a current independent isolation review; generated-fixture lifecycle acceptance does not authorize connected-source execution. This permission does not grant unsafe execution, cluster credentials, source egress or authority to publish a passing native result. See [native execution](../operations/native-execution.md).

### Standards authoring

`standards.manage` is available to the predefined Owner and Admin roles. It permits creating organization standards and adding a new version to an existing one, with fresh organization authority and audit. `policy.read` permits library/version inspection. Repository adoption continues to require its existing scoped policy permission. Platform administration alone does not grant organization standards authority; policy approval and enforcement permissions remain separate.


## Review skills permissions

| Built-in roles | Skills authority |
| --- | --- |
| Owner, Admin | Read, create versions, approve, enable/disable, retire and run reviews |
| Policy Manager, Security Engineer | Read, approve reviewed versions and run reviews |
| Engineering Lead, Developer | Read and run reviews |
| Auditor, Viewer | Read catalogue and authorized assessment results |

Identifiers are `ai.skills.read`, `ai.skills.manage`, `ai.skills.approve` and `ai.review.run`. Reviews additionally require live repository access; background workers recheck access and frozen configuration. Cancellation is limited to the requester or Owner/Admin. AI outputs have no policy publication, enforcement or GitHub write authority. See [review skills](../operations/review-skills.md).


## Teams permissions (implemented 2026-10-10)

Organization readers receive `team.read`. Owners/Admins receive `team.manage`, `team.import` and `team.policy.assign`; Policy Managers receive `team.policy.assign` within their repository grants. Backend checks require access to every assignment target, organization scope and an unchanged impact preview. Team membership grants no additional Preflyt or GitHub access. See [Teams operations](../operations/teams.md).


## Organization notification channel permissions

Channel APIs derive the organization from the active session and bind reads and writes to the organization displayed when the action began. Missing or mismatched `X-Preflyt-Organization` returns 409. Owners/Admins see only the current organization’s destination addresses; other organization roles cannot list or change them. Trusted-origin checks protect writes, and revisions protect edits, removal and tests from stale requests. A worker rechecks the current authority of a requesting test administrator and current channel/recipient/source scope before sending.

Channel recipients may be distribution lists or addresses without Preflyt identities. They receive generic sign-in links, not private repository evidence. Saving an address never creates a user, assigns a role or grants resource access. Channel audit entries exclude raw addresses. See [notifications operations](../operations/notifications.md).

Policy exceptions reuse current repository grants and explicit `policy.exception.request` / `policy.exception.approve` permissions. Only Owners/Admins/Policy Managers may approve, and no actor may approve their own request, including a linked historical identity or local Super Admin. See [policy exception operations](../operations/policy-exceptions.md).

## Engineering Lead and repository assignment edits

Engineering Lead can connect/select repositories, create and edit AI skills, and
create and edit organization standards. GitHub user rights, active installation
scope and current workspace membership remain required. Inventory discovery does
not grant assessment access. Explicitly selecting a repository creates an audited
Preflyt grant for that Engineering Lead and allows its initial assessment; other
repository evidence remains scoped to assigned grants. Developer is unchanged.
Skill approval, policy publication, provider administration and member management
remain separate permissions.

When editing a member, an Owner/Admin can preserve or remove an existing grant
that is no longer in their current repository picker. New grants must be currently
authorized and belong to the same organization. Preserving a grant never bypasses
GitHub, installation availability or current membership checks. The editor displays
these existing unavailable assignments explicitly rather than silently deleting them.
