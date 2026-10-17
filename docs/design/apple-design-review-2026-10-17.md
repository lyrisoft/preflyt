# Preflyt Apple Design review

Reviewed on 2026-10-17 using the installed `apple-design` skill from [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/apple-design). This is an improvement review, not authorization to implement the recommendations.

## Scope and evidence

Reviewed the shared workspace controls, sidebar, drawers, typography and finding-review flow; sampled the public website and documentation motion rules. Inspected the running authenticated finding-details page and opened/closed its Help drawer. Live DOM measurements confirmed a 16 × 16 CSS-pixel Help close button, 32px-high Help action, 36px notification control and 0.5s Help opening animation. The drawer was closed after inspection. No findings or settings were changed.

Other observations below are source-backed opportunities, not measured frame-rate claims or a complete accessibility certification. No new tests/builds were run for this review. The preceding finding-review implementation was separately tested and deployed to local Compose.

## Prioritized opportunities

### 1. High: make small controls easier to hit on touch screens

**Evidence:** `apps/web/src/components/ui/sheet.tsx:72` gives the close control only its 16px icon dimensions. `apps/web/src/components/ui/button.tsx:24` defines 32/36px actions, and `apps/web/src/components/ui/switch.tsx:13` defines an approximately 18px-high switch. Live measurements confirm the Help drawer close target. `apps/web/src/styles/index.css:117` already has a 44px coarse-pointer hit-area utility, but these shared controls do not use it.

**Change:** enlarge the close button hit box and adopt at least 44px touch targets for compact controls on coarse pointers, keeping their visible desktop geometry compact. Account for labels and neighboring controls so expanded hit areas do not overlap. Start with drawer/dialog close buttons, switches, icon actions and pagination.

**Apple principle:** flexibility, agency and forgiving interaction boundaries.

**Verify:** coarse-pointer phone testing, keyboard focus, edge taps, adjacent-control separation and both themes. This is an ergonomic target recommendation, not a blanket claim that every control fails WCAG.

### 2. High: enforce reduced-motion behavior in the shared primitives

**Evidence:** `apps/web/src/components/ui/dialog.tsx:62` scales dialogs; `select.tsx:66` scales/slides menus; `sheet.tsx:58` slides sheets; `sidebar.tsx:218` animates width; `apps/web/src/styles/index.css:64` animates collapsible height. These definitions lack a shared reduced-motion fallback. PageHelpDrawer applies its own override, charts are gated by motion preference, and the marketing site has a broad reduced-motion rule, creating inconsistent behavior across surfaces.

**Change:** define preference handling once at the primitive/token level. Replace spatial transitions with short fades or immediate state changes, preserve focus and loading/status feedback, and remove switch-thumb travel when the preference requests it. Keep consumer-specific overrides only for meaningful exceptions.

**Apple principle:** flexibility and predictable, accessible feedback.

**Verify:** exercise dialog, dropdown, select, mobile sidebar, collapsible and switch with reduced motion enabled, including a preference change while a surface is open. Do not remove functional busy/error feedback along with motion.

### 3. Medium: add an immediate pressed state to shared buttons

**Evidence:** `apps/web/src/components/ui/button.tsx:7` defines hover/focus/disabled states and 150ms transitions, but no shared active/pressed treatment. Some sidebar controls already provide active backgrounds, so feedback varies by component.

**Change:** give primary, outline and ghost buttons a distinct pointer-down background or inset treatment; apply it instantly and commit the action on release. A subtle scale can be evaluated for isolated buttons, but should not be applied indiscriminately to table actions, links or reduced-motion users. Retain accessible focus and proper disabled states.

**Apple principle:** response and causality.

**Verify:** mouse down/up, keyboard activation, touch cancellation, disabled actions and pending mutations. Feedback must not imply a server action has succeeded.

### 4. Medium: make drawers quicker and consistently reversible

**Evidence:** `apps/web/src/components/ui/sheet.tsx:58` specifies a 500ms entry and 300ms exit with ease-in-out. The live Help sheet reports a 0.5s entry. Shared dialogs use 200ms, and the website's panel entry uses 200ms.

**Change:** define explicit panel timing/easing tokens. Evaluate a roughly 200–250ms ease-out entry for frequently used Help and settings panels with a compatible return path. Test rapid open/close/reopen before introducing a spring. Gesture-driven dragging and spring physics are not needed for ordinary desktop Help.

**Apple principle:** response, spatial consistency and interruptibility.

**Verify:** repeated opening, reversal during entry, Escape dismissal and focus return, plus reduced-motion behavior. Existing enter/exit directions and Radix origins are already useful foundations.

### 5. Medium: validate custom expiry before the final submit

**Evidence:** the newly refined `apps/web/src/features/findings/finding-ignore.tsx:165` evaluates a custom expiry inside the submit handler. An expired date is rejected safely, but feedback arrives only after the user tries to save.

**Change:** validate on blur or when a complete date changes; keep the inline message associated with the field and clear it when corrected. Show the interpreted local date/time and timezone for a custom expiry. Preserve server validation, required review reasons and revision checks.

**Apple principle:** understanding, agency and feedback at the point of action.

**Verify:** incomplete date entry, past dates, timezone/DST boundaries, keyboard correction, long reasons, rejected saves and reopen behavior.

### 6. Medium: make small typography follow text-size preferences

**Evidence:** shared buttons use fixed `text-[13px]` and negative tracking at `apps/web/src/components/ui/button.tsx:7`. The public website already uses rem-based typography tokens. Fixed pixel button text will not grow with a changed root text-size preference as rem-based layout dimensions do.

**Change:** preserve the existing Inter/Manrope identity and current default density, but use a shared 0.8125rem action token and size-specific tracking rather than a fixed pixel rule. Evaluate neutral tracking on small labels. Allow wrapped or stacked action groups where enlarged text needs room.

**Apple principle:** typography as size/weight/leading together, and flexible layouts.

**Verify:** browser preferred text-size changes and 200% zoom on table footers, headers, settings actions and long translated labels. The source establishes the risk; a full enlarged-text review is still needed before declaring failures.

### 7. Lower priority: profile layout-changing sidebar and collapsible motion

**Evidence:** `apps/web/src/components/ui/sidebar.tsx:218` animates width, and `apps/web/src/styles/index.css:71` animates collapsible height. Both can require layout work during a transition, unlike the transform/opacity chart animations already present.

**Change:** profile sidebar collapse on a page with charts and large tables before deciding whether to keep it. Consider an immediate layout resize with a short content fade, or an isolated transformed navigation layer where appropriate. Preserve document flow, scroll position, focus and navigation semantics.

**Apple principle:** frame-level smoothness and restraint.

**Verify:** performance traces on representative low-powered hardware. No dropped-frame measurement was made during this review; this is a performance investigation opportunity.

## Preserve these strengths

- Semantic StatusBadge colors and shared PageHeader/SurfaceIcon geometry.
- Trigger-based transform origins already present in menus, popovers and selects.
- Required review reasons, explicit ignore/reopen, and revision-protected saves.
- Persistent error messages alongside temporary completion feedback.
- Chart and marketing motion that already respects reduced-motion preferences.
- The new compact finding-review hierarchy and progressive disclosure of custom expiry.

## Suggested implementation order

1. Shared touch targets and reduced-motion coverage.
2. Pressed-state feedback and drawer timing, verified with an interactive primitive gallery.
3. Expiry feedback and rem-based small-text tokens.
4. Profile sidebar/collapsible transitions before changing their architecture.

Keep Preflyt's enterprise visual language. Do not add translucent panels throughout, replace its fonts, animate every card, or add drag gestures to normal dialogs merely to resemble a native Apple app. The useful adoption is better feedback, clarity, accessibility and control.

## Implementation follow-up

The user subsequently authorized these improvements on 2026-10-17. The implementation, local verification and Compose rollout are recorded in [Apple Design acceptance](../acceptance/2026-10-17-apple-design-improvements.md). The review above remains the historical baseline.
