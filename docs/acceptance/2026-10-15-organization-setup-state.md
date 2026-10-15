# Organization setup state

## Problem

A signed-in user without an active organization could open Teams, Findings,
Standards, AI Intelligence and Skills. Each page interpreted missing organization
scope differently: permission denied, access denied or a generic load failure.
Some pages also displayed controls that could not work before setup.

## Change

The authenticated layout now checks the existing navigation session before
mounting organization-scoped pages. Without an active organization, every such
page retains its destination heading and shows the existing **Connect your
organization** prompt. That prompt offers GitHub sign-in, deployment
configuration for a Super Admin, or administrator guidance according to the
configured sign-in methods and the current session.

Pending and failed session checks have distinct loading and retry states. A
session check failure does not imply that GitHub is unconfigured. Pages with an
active organization retain their current API authorization and permission errors,
including legacy workspaces without a GitHub link.

Identity settings, notifications, deployment configuration and the Super Admin's
existing Access Control workspace creation flow remain reachable without an
active organization. Sidebar destinations are unchanged. No backend permissions
or authentication checks have changed.

## Local verification

- Chromium: 72 checks passed across eight files covering the new boundary,
  existing setup prompt, workspace modules, sidebar/command navigation,
  organization settings and Teams.
- The new regression checks cover all organization-scoped sidebar destinations,
  nested repository/contributor links, blocked page mounting before setup,
  pending and failed session checks, retry, ordinary-user guidance, configured
  GitHub sign-in and legacy organizations.
- Setup is visible, focusable and free of horizontal overflow at a 320px
  viewport in light and dark themes.
- TypeScript and ESLint passed for the change.
- Production web build and public-page prerender passed.

This verifies source changes locally. The installed v0.1.1 web image requires a
new release to include them; the user's Compose configuration was not changed.
