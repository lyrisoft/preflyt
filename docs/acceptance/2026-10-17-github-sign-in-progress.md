# GitHub sign-in progress

The GitHub sign-in control now uses a native GET form and submit button. On submission it becomes disabled, displays “Connecting to GitHub…” and replaces the arrow with a spinner. An immediate submission guard blocks repeated form submissions as well as repeated clicks. The existing backend login endpoint and safe return-path handling are preserved; no OAuth requests are fetched in the browser.

Browser `pageshow` resets the progress state so returning from GitHub through the back-forward cache restores sign-in. Callback errors keep the existing error handling and a fresh enabled control. SSO, setup and Super Admin recovery remain available.

Local verification: 46 tests passed across sign-in flow, setup and layout suites, including cookie-bearing method discovery, safe/unsafe return paths, disabled controls, spinner, repeated submission and Back navigation recovery. Web type checks, focused lint and diff whitespace checks passed. Provider navigation was intercepted in tests; no real GitHub login was initiated.
