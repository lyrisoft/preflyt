# Preflyt Design System

## Theme Summary

Enterprise engineering control center: dark-first navy neutrals with a complete light theme, restrained steel-blue branding and precise information hierarchy. Keep the existing React/Vite, Shadcn UI and TanStack foundations.

## Color

Use semantic variables from `apps/web/src/styles/theme.css`. Primary is `#29465b` in light mode and `#a3bacb` in dark mode. Status badges use the shared StatusBadge: success green, failure red, attention amber, information blue and inactive neutral. Decorative brand color never claims an outcome.

## Typography

Use the existing Inter/Manrope stack. Compact 13px button labels, readable body text and distinct title/section/metadata levels. Avoid oversized controls and repeated headings.

## Layout and Components

Use an 8px spacing rhythm, modest radius, subtle borders and restrained shadows. Workspace headers follow the shared Integrations-style PageHeader; cards reuse SurfaceIcon and shared action conventions. Forms have explicit labels, stable actions, useful loading/error/retry states and no horizontal overflow at 320px.

## Sign-in Illustration

Organization and Super Admin sign-in share a centered developer-tool composition: graphite surfaces in dark mode, a crisp light theme, a compact masthead, restrained monospace metadata and abstract source/commit branch linework. Authentication stays dominant; avoid split marketing heroes, large decorative shields, isometric artwork or resemblance to MaiGuard. Keep forms and readable copy stationary. Decorative geometry never represents live code or assessment results. On mobile, prioritize the form and hide the animated illustration. GitHub onboarding and first Owner setup keep their existing layout.

## Motion

Animate only the illustration, with slow path signals and subtle commit-point pulses. Provide a pause control; pause when the page is hidden or the illustration is offscreen. Reduced motion shows the complete static artwork immediately. No animation delays authentication or changes form geometry.

Canonical visual guidance: [Enterprise UI Guidelines](docs/design/enterprise-ui-guidelines.md). This file is a context summary, not a second set of component rules.
