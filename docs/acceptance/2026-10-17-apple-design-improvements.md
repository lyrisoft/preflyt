# Apple Design improvements

Implemented and verified locally on 2026-10-17 following the Apple Design review.

## Delivered

- Shared desktop buttons retain their default density, use a 0.8125rem action font token and neutral tracking, and grow/wrap for larger text. Table pagination groups wrap with enlarged labels.
- Primary, outline, ghost, secondary, link and destructive actions have immediate pressed feedback, with click/release still owning the action. Disabled and pending behavior is preserved.
- Coarse pointers receive 44px action/selector/menu-item targets. Switches and checkboxes reserve space around expanded hit regions; dismiss buttons have real 32px desktop and 44px touch boxes. The collapsed coarse-pointer sidebar has enough width for its targets.
- Shared 150ms small-surface and 220ms panel tokens replace the slower sheet entry. Portals keep their existing origins and enter/exit directions. Dismiss/reopen and keyboard focus return are covered.
- Shared reduced-motion rules cover dialogs, alert dialogs, sheets, menus, selects, popovers, tooltips, mobile/desktop sidebars, collapsibles, switches, checkboxes and skeletons. Static loading surfaces and existing status text remain visible.
- Sidebar width changes and disclosure layout changes are immediate. Disclosure content fades instead of animating its height. Stable sidebar skeleton widths replace render-time randomness.
- Custom expiry validates complete values while editing and empty values on blur, rejecting invalid calendar dates, past timestamps and normalized spring-forward gaps. A localized date/time, offset and IANA timezone preview makes the interpretation explicit. Required reasons, API/server validation and expected revisions remain intact.

## Performance evidence

A headless Chromium fixture with a chart and 500 table rows recorded **22** ResizeObserver callbacks during sidebar collapse before the change. A disclosure fixture recorded **37** during opening. The updated regressions require a real resize and no more than **two** callbacks for either operation. Both pass. This is bounded layout-resize evidence, not a measured frame-rate guarantee or a low-powered-hardware benchmark.

## Local verification

- Follow-up header logo sizing: 176px desktop, 144px mobile and 136px on narrow phones. Real-browser checks at 320px and 390px confirm separate logo/action bounds with the install guide and menu visible. Six public website/theme cases pass; the final pre-merge control/expiry/marketing rerun passes all 23 cases.

- Complete normal web suite: 96 files / 687 cases exercised. 95 files and 679 cases passed initially; eight public hydration cases compared against an older website-mode dist. After regenerating production assets, all nine hydration cases passed in the final 26-case focused rerun, together with the final control/layout/expiry tests. No failures remain in the verified coverage.
- Coarse-pointer + reduced-motion + America/New_York browser profile: **24 passed**, covering targets, keyboard selection, pointer feedback, enlarged text, dynamic motion-preference changes while a sheet is open, dismiss/focus/reopen, local expiry/DST behavior, and installation-reporting switches.
- Light/dark 320px control screenshots inspected; 200% root text uses the scaled 26px action font without overflow. Finding-review mobile screenshots remain usable in both themes.
- TypeScript passed. Focused ESLint including otherwise ignored UI files has zero errors; two existing Fast Refresh export-pattern warnings remain in button/sidebar primitives.
- Local production build passed, prerendering seven public routes and 404. The ARM64 web image was rebuilt and recorded in ignored local Compose evidence.
- Updated only the local Compose web image. Other service images, data volumes, reporting preferences and credentials remain unchanged.

## Operational checks

The final rollout checks the web container content ID against build evidence, fetches the served CSS/JavaScript, verifies homepage and API readiness over localhost, and confirms Compose health. The local web-only tag is `preflyt-local/preflyt-web:apple-design-20261017-arm64`.

Test-only browser controls are configured through PREFLYT_TEST_TOUCH, PREFLYT_TEST_REDUCED_MOTION and PREFLYT_TEST_TIMEZONE plus a narrowly scoped media-preference command. They do not change production behavior. Safari and representative low-powered-device profiling are not claimed by this acceptance.
