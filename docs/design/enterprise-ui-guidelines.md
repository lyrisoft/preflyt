# Preflyt Enterprise UI Guidelines

**Status:** Required visual and interaction guidance for shipped MVP screens.  
**Companion:** [MVP Product Experience](../product/mvp-product-experience.md).

## Visual direction

Preflyt is an **enterprise engineering control center**: precise, restrained, information-dense and operational. Continue using the imported Shadcn Admin React/Vite source, existing layout/theme primitives and Preflyt branding; **do not replace the frontend foundation**.

- Dark-first with a complete light theme; charcoal/navy neutrals, restrained brand accent, semantic status colors only for actual outcomes.
- Consistent type hierarchy: page heading, section title, data value, metadata; compact labels and legible dense tables.
- 8px spacing rhythm, subtle borders, modest radius, minimal shadows. Shared cards use 16px outer/content padding, 12–16px section gaps and 12px above bordered action footers. Place icons beside titles; avoid separate decorative header rows or fixed minimum heights that leave empty space. No decorative 3D charts, marketing heroes, huge empty cards or invented KPI values.
- Layout: persistent/collapsible desktop sidebar, compact sticky global header, content max-width appropriate for data tables, responsive single-column mobile.
- Tables: sortable/filterable/paginated when data requires it; explicit timestamps, source, status, ownership, accessible empty/error/loading states and row navigation.
- Charts: evidence-backed, labeled axes/legend, time windows, denominators, comparable datasets and accessible textual alternatives. Use existing compatible chart components rather than another UI framework.
- Status vocabulary: PASS, WARN, BLOCK, INCOMPLETE, NOT_APPLICABLE; distinguish data ingestion failures and unavailable external services. Do not use green for unassessed/unknown.
- Interaction: contextual actions with confirmation for destructive/privileged changes; clear progress, retry, undo where possible, stable deep links, toasts for completed outcomes only.
- Security: role-aware navigation and controls; server RBAC remains authoritative. Never render credentials or unredacted evidence in client logs.
- Accessibility: keyboard navigation, focus visibility, WCAG AA contrast targets, semantic labels, screen reader descriptions, reduced motion and usable 320px layouts.

## Component inventory

Build/reuse Preflyt-owned wrappers for AppShell, SidebarGroup, Breadcrumbs, PageHeader, MetricCard, StatusIndicator, EvidenceTable, FindingRow, GateDecision, RepositoryBadge, PolicyPackCard, EmptyState, ErrorState, PermissionDenied and ChartPanel.

Use existing shadcn/ui and TanStack patterns where available. Reuse one routing/data-fetch architecture; avoid one-off styling or duplicate UI frameworks.

## Shared headers, cards and actions

- Use `apps/web/src/components/page-header.tsx` for workspace page headers. Follow Integrations: restrained tinted surface, section label, 44px icon tile, title, description and grouped actions. Keep the title and actions on separate rows on small screens. Do not build a competing header on each page.
- Use `SurfaceIcon` for card identity: 40px tile with a 20px icon, rounded-xl border and a shared category accent from `lib/surface-tones.ts`. Header tiles are 44px; compact inline sections may use 32px tiles. Provider logos fit the same tile geometry. Small inline metadata and control icons retain their existing compact sizes.
- Cards use the shared Card primitive with a clear title, quieter metadata, grouped content and aligned action footers. Use category colors to identify sections; use status colors only for results. Avoid arbitrary card heights, decorative gradients or coloring entire cards.
- Primary create, activate, save and apply actions use the brand-filled Button. Secondary navigation, refresh, edit and cancel use outline or ghost. Destructive actions use destructive styling. Keep buttons compact and content-sized; align card actions to the right.
- Badges use `StatusBadge` and `lib/status-tones.ts`: completed/healthy green, failure red, pending/stale amber, information blue and inactive neutral. Never infer success from configuration, missing data or a category accent.
- Review both themes after color transitions finish. Verify keyboard controls and 320px layouts with the real page padding, and preserve permissions, links and mutation behavior when changing presentation.

## Design review checklist

- [ ] Page answers an actionable engineering question, not just displaying numbers.
- [ ] No dead-end nav, dummy metrics or placeholder charts in production routes.
- [ ] Clear difference between observed evidence and AI interpretation.
- [ ] Metrics reconcile with underlying rows and explain unknown/missing evidence.
- [ ] Appropriate loading, empty, error, unauthorized and stale states.
- [ ] Mobile/keyboard/theme testing and design consistency with existing Preflyt shell.


## Page help pattern

Use the shared `PageHelpDrawer` for explanatory notes. Put a labeled Help button at the top right of the page, after Refresh when present. Open a right-side, scrollable drawer with grouped metric definitions, data sources, counting rules, interpretation and limitations. Contributor pages implement this pattern. Reuse it for new and updated pages rather than adding scattered helper paragraphs or help accordions.

Keep actual results, denominators, chart axes/legends, dates, permission-denied states, errors, empty states and actionable incomplete-data warnings beside the relevant data. Move explanations, not the information needed to assess a result. Preserve accessible chart data and keyboard navigation. Side-by-side summary cards should stretch to equal height on desktop and stack naturally on smaller screens.

### Global action notifications

Reuse the root Sonner toaster in `apps/web/src/routes/__root.tsx`; do not mount another toaster on feature pages. Mutation failures without a local error handler use the shared global handler, preserving API and fetch error messages. Simple completed mutations can set `meta: { successMessage: 'Saved changes' }`; operations with partial outcomes must report their verified result explicitly. Keep persistent inline errors when users need details or recovery actions. Toasts are temporary feedback, not the persisted notification inbox.
## Table pagination

Workspace tables use the shared `Table` component and `TablePagination`. Default to 10 rows and offer 10, 25, 50 and 100 in a labeled Rows per page dropdown. Changing the size returns to the first page. Keep the row range and Previous/Next controls together in one responsive footer. Server-paginated tables pass the selected size to the API and include it in the query key; never paginate an already paginated response a second time. Static marketing illustrations do not expose working table controls.

## Interaction standards

- Shared actions use the rem-based `--ui-action-font-size` token (13px at the default root size), neutral small-text tracking and minimum heights. Labels can wrap when larger text needs room; pagination/action groups must wrap with them.
- Pointer-down feedback is immediate and semantic-color based. Actions still commit on release; a pressed appearance never claims server success. Keep keyboard focus and disabled states intact.
- Coarse pointers get at least 44px targets for shared actions, selectors and dismiss buttons. Switches/checkboxes reserve layout space around their expanded targets so neighbors do not overlap. Desktop controls retain their dense visual size.
- Interaction timing comes from `styles/interactions.css`: 150ms small surfaces, 220ms sheets, restrained ease-out. Do not add arbitrary spring or bounce effects to ordinary dialogs.
- Reduced-motion handling belongs to shared primitives and applies to portalled content too. Prefer immediate state changes or gentle fades; preserve meaningful loading/status text.
- Desktop sidebar and disclosure layout changes occur immediately; content may fade briefly. Do not animate chart/table container width or disclosure height through many intermediate layouts. Loading skeleton geometry must remain stable.
- Custom expiry inputs validate complete dates during editing and empty/partial values on blur, show the interpreted local timestamp and timezone, and retain server-side validation as the final authority.
