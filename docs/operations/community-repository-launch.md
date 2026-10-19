# Community repository ownership and launch

## Recommendation

Use this codebase as the canonical Community Edition repository. The current
remote is **https://github.com/lyrisoft/preflyt** and was verified private on
16 October 2026. Do not maintain a second public mirror with a separate issue,
release and contribution history.

For product branding, **preflytlabs/preflyt** matches `preflytlabs.com` better
than `preflylabs/preflyt` (which omits the product's `t`). This is a recommendation,
not an approved transfer. Neither account was returned by the authenticated API
on 16 October; a 404 does not prove a name can be registered. The authenticated
account currently has organization membership in `lyrisoft`, not either proposed
organization. Lyrisoft Technologies Limited can continue to be the copyright
holder/steward after a GitHub organization change.

Once the owner chooses and controls the branded organization, prefer transferring
this repository while it remains private. GitHub transfers preserve Git history,
issues, PRs, stars and watchers, and redirect the old repository URL. They also
retain webhooks/secrets, so a transfer is not a clean security reset. Do not reuse
the old owner/name and accidentally remove its redirects. See
[GitHub's transfer documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository).

If the history/exposure audit identifies material that must never become public,
keep this development repository private and prepare a reviewed, sanitized
Community repository instead. Do not erase source attribution or pretend the
new repository has the original contribution history. The recorded history scan
found no confirmed live credential; that is not clearance of registry caches,
screenshots or all non-secret confidential material.

## Transfer preparation

Before any transfer, record the source SHA, branches/tags, releases, package
ownership, GitHub App/OIDC trust, webhook and environment configuration, required
checks and maintainer permissions. Complete the release evidence record first.

After an explicitly authorized transfer, update and verify:

- Git remotes, README/community links, website/docs badges, edit links and issues.
- GHCR image references and permissions. Repository redirects do not prove
  container package migration or anonymous access. Maintain old release digests
  during any migration and qualify the new namespace before changing quick start.
- `PREFLYT_IMAGE_REGISTRY`, `PREFLYT_DOCS_REGISTRY`, release scripts and OCI source
  labels. Build new manifests in the approved namespace; do not silently move tags.
- The separate `lyrisoft/preflyt-action` repository, Marketplace listing and pinned
  workflow references. Its move is a separate decision; do not assume Actions
  redirect behavior is a supported long-term dependency.
- GitHub App repository/organization scope, webhooks, OAuth callbacks and server
  trust for OIDC `repository`/`repository_owner` claims.
- Required branch rules, Actions read-only defaults, environments, secrets,
  CODEOWNERS access, DCO, community checks and private reporting availability.
- Pages custom-domain configuration and DNS. GitHub Pages redirects differ from
  repository redirects; verify `docs.preflytlabs.com` independently.

## Prepared settings

The sole maintainer is @iampeters. The owner confirmed `support@lyrisoft.tech`
receives reports and that there is no backup maintainer. Publish that limitation
honestly; a second maintainer is desirable, not a fabricated launch requirement.

Hosted workflows are currently prepared as manual-only to conserve build
minutes; there are no automatic PR checks or Preflyt Action gate. Do not require
manual-only check contexts on every PR: they would block merging until explicitly
run. Record local verification before publication, as described in
[manual CI](../deployment/branch-ci.md). When automatic PR CI is restored, run its
exact contexts first and then require DCO, community and branch verification.

Protect both `main` and `development` against deletion/force push and require
PRs. With one maintainer, do not require an impossible independent approval for
their own PRs. Retain maintainer review for contributor PRs and add mandatory
independent review when another maintainer joins. Current GitHub rules do not yet
enforce checks; these local files do not change remote settings.

Repository transfer, package visibility, repository visibility and public release
are separate actions. This runbook authorizes none of them. Until the owner
chooses a namespace, all working links continue to use `lyrisoft/preflyt`.

## Repository review and Cloud source boundaries

The owner revised the edition decision on 18 October 2026: repository-aware security reviews and their issue #97 / P4.RI context foundation belong in open-source Community Edition. The [Strix local prototype](strix-repo-health.md) is not a production-qualified release. Managed remediation and draft fix PR implementation remain in private Cloud code. Existing Apache notices and rights remain in force. No remote issue or repository settings are changed by these local documents.
