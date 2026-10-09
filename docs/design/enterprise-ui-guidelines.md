# Preflyt Enterprise UI Guidelines

**Status:** Required visual and interaction guidance for shipped MVP screens.  
**Companion:** [MVP Product Experience](../product/mvp-product-experience.md).

## Visual direction

Preflyt is an **enterprise engineering control center**: precise, restrained, information-dense and operational. Continue using the imported Shadcn Admin React/Vite source, existing layout/theme primitives and Preflyt branding; **do not replace the frontend foundation**.

- Dark-first with a complete light theme; charcoal/navy neutrals, restrained brand accent, semantic status colors only for actual outcomes.
- Consistent type hierarchy: page heading, section title, data value, metadata; compact labels and legible dense tables.
- 8px spacing rhythm, subtle borders, modest radius, minimal shadows. No decorative 3D charts, marketing heroes, huge empty cards or invented KPI values.
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
