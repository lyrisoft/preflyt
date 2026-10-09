# Preflyt RBAC and resource authorization

**Status:** Organization memberships, predefined roles, repository grants and existing API resource checks implemented. Later enforcement/execution permissions remain pending. **P0 foundational**, extended within existing phases. GitHub-first identity, inherited organizations and member selection are accepted targets under [ADR-0007](../architecture/ADR-0007-github-first-identity-and-organizations.md), not shipped behavior. See [OIDC ADR](../architecture/ADR-0003-oidc-user-authentication.md) and [roadmap](../roadmap/incremental-delivery.md).

## Authorization model

Use GitHub login for GitHub-connected workspaces, with OIDC retained as an explicit compatibility option during migration. Preflyt-owned, **server-enforced organization-scoped RBAC** remains authoritative for Preflyt actions. Authorization checks combine subject (user, team or service), action, resource (organization/repository/assessment/policy/environment), membership, explicit grants and policy constraints. Default deny. Platform administrator does not implicitly receive customer source or evidence access.

**Predefined roles:** Platform Administrator (installation operations only), Organization Owner (ownership and organization governance), Organization Admin (members/integrations), Policy Manager (publish/enforce rules, approve others' exceptions), Security Engineer (security evidence and triage), Engineering Lead (assigned repositories), Developer (assigned repository assessments), Auditor (scoped read-only evidence/audit), Viewer (scoped dashboards). Owners/admins must still meet separation-of-duties requirements for sensitive approvals.

**Initial permission identifiers:** `organization.members.manage`, `organization.settings.update`, `repository.read`, `repository.connect`, `repository.manage`, `assessment.read`, `assessment.run`, `assessment.cancel`, `finding.read`, `finding.triage`, `policy.read`, `policy.draft`, `policy.publish`, `policy.enforcement.manage`, `policy.exception.request`, `policy.exception.approve`, `ai.provider.manage`, `ai.routing.manage`, `ai.usage.read`, `audit.read`, `execution.request`, `environment.read`, `performance.run`. Never infer authority from a frontend role label.

**Contributor permissions:** `contributors.read`, `contributors.activity.read`, `contributors.policy_evidence.read` are repository-scoped and require authorization to underlying GitHub evidence. Organization aggregates must exclude unauthorized private repositories. See [Engineering Contributors](engineering-contributors.md).

## Scope and security

- P0 supports organization membership and repository-level assignments, with team membership/inheritance if implemented; otherwise defer team management explicitly and do not pretend it works.
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
| **P5–P6** | CLI user identity and QA/release-candidate permissions | Local identity cannot forge trusted server gate or QA sign-off |
| **P7–P9** | Performance target registration, test execution and high-impact approval | Unauthorized target, production load or quota bypass denied |
| **P10–P11** | Incident evidence scoping, policy proposal approvals and provider-specific permissions | Production recommendations cannot directly enforce policy |

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

See [organization access and contributors](../operations/scoped-access-contributors.md) for shipped workflows, the explicit compatibility migration, live-request revocation behavior, contributor permission boundaries and remaining limitations. This slice does not implement team inheritance, policy enforcement/exception approval, independent sandbox admission or AI egress authorization.
