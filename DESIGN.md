# Preflyt Design System

## Theme Summary

Enterprise engineering control center: dark-first navy neutrals with a complete light theme, restrained steel-blue branding and precise information hierarchy. Keep the existing React/Vite, Shadcn UI and TanStack foundations.

## Color

Use semantic variables from `apps/web/src/styles/theme.css`. Primary is `#29465b` in light mode and `#a3bacb` in dark mode. Status badges use the shared StatusBadge: success green, failure red, attention amber, information blue and inactive neutral. Decorative brand color never claims an outcome.

## Typography

Use the existing Inter/Manrope stack. Compact 13px button labels, readable body text and distinct title/section/metadata levels. Avoid oversized controls and repeated headings.

### Public website and documentation

Keep Geist on the public website and Inter with JetBrains Mono in the docs. Use rem-based sizes that respect browser text preferences: 16px body, 18px lead, 14px navigation/actions, and 12px short metadata at the default browser size. Use 400 for body, 500 for emphasis and 600 for headings/actions.

Website headings use a 20px card level, fluid 28–36px section level and fluid 36–64px display level. Docs use 20px H3, 28px H2 and 32px H1, with a 32–40px landing title. Body line height is 1.6–1.65 and reading lines are capped around 65–72 characters. Do not shrink body copy on mobile. Allow controls to grow with text and collapse navigation before it becomes crowded. Public typography stays scoped away from workspace components and embedded application previews.

Public layouts use a shared responsive content column and consistent section spacing. Keep primary actions before release metadata, use 8px button corners, and indicate the active navigation section. Capability headings scale from 32–52px to fit their split layout. The website footer groups Product, Resources and Community links, with license/contact details below; the docs footer groups Start, Operate, Understand and Community. Footer links wrap on phones. Avoid repeated logo panels and competing calls to action.

## Layout and Components

Use an 8px spacing rhythm, modest radius, subtle borders and restrained shadows. Workspace headers follow the shared Integrations-style PageHeader; cards reuse SurfaceIcon and shared action conventions. Forms have explicit labels, stable actions, useful loading/error/retry states and no horizontal overflow at 320px.

## Sign-in Illustration

Organization and Super Admin sign-in share a centered developer-tool composition: graphite surfaces in dark mode, a crisp light theme, a header-free entry surface with the Preflyt logo centered above the form, rounded frosted-glass forms with readable theme-specific contrast and an opaque fallback, rounded controls, restrained monospace metadata, broad rounded code bands with curved bends, thicker source/commit branch linework, and faded GitHub, GitHub Actions and Azure Pipelines icons. Authentication stays dominant; avoid split marketing heroes, large decorative shields, isometric artwork or resemblance to MaiGuard. Keep forms and readable copy stationary. Decorative geometry and tool icons never represent live code, connected integrations or assessment results. On mobile, prioritize the form and hide the animated illustration. GitHub onboarding and first Owner setup keep their existing layout.

## Motion

Animate only the illustration with a brief entrance of no more than five seconds, then leave the complete artwork static. Do not add a page header or animation controls. Reduced motion shows the complete static artwork immediately. No animation delays authentication or changes form geometry.

Canonical visual guidance: [Enterprise UI Guidelines](docs/design/enterprise-ui-guidelines.md). This file is a context summary, not a second set of component rules.
