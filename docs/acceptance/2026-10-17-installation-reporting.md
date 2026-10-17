# Installation reporting and optional country reporting

Implemented and verified locally on 2026-10-17. No commit, push or production deployment.

## Behavior

- Deployment administrators manage Installation reporting as its own option in Settings → Configuration. No workspace banner is rendered.
- Basic installation reporting is enabled by default, with a persistent opt-out and authoritative environment override. No production receiver URL is bundled; an unconfigured destination sends nothing.
- **Include installation country** is a separate, persistent, administrator-only opt-in, off by default. `PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED=false` enforces off. The main reporting switch stops all reports.
- The report contains only schema version, random installation ID, version, deployment type and boolean country permission. Legacy clients without the permission field are treated as opted out.
- The receiver uses an operator-provided local Country MMDB and stores only a validated country code. No IP address, city, coordinates or raw address cache is persisted. Private/reserved addresses and failed lookups remain unknown; there are no third-party lookup requests.
- Forwarded addresses require an explicitly configured exact immediate proxy IP and an overwritten X-Real-IP header. Arbitrary forwarded chains and supplied country claims are ignored. Proxy/CDN/monitoring logs must separately avoid addresses.
- Country opt-out schedules the next report promptly; receiver acceptance clears the saved country even inside the hourly duplicate-report window. If all reporting is disabled/offline, previously collected data remains until 90-day inactivity expiry. An in-flight request can finish.
- A dedicated receiver process/database exposes bearer-protected aggregate statistics including byCountry. Development builds are excluded. Public installation IDs are spoofable, so counts are approximate.
- First-start installation creation uses a conflict-safe database insert; leases and scheduling prevent duplicate reports across API replicas. Preference changes are audited and revision-protected.

## Local verification

- API integration tests: **13 passed**, using disposable local databases. Covers exact payloads, legacy compatibility, defaults, administrator authorization, foreign origins, stale revisions, persistent switches, environment veto, replica concurrency, retries, receiver limits, retention, country opt-out clearing, spoofed/private IP rejection, unknown lookup handling, and the real MMDB reader.
- Browser tests: **47 passed** across installation-reporting settings, configuration selection, organization settings and status badges. Includes country-control opt-in/disabled states, mutation payloads, and 320px light/dark screenshots.
- API and web TypeScript checks and focused web ESLint passed. Full documentation build and deployment/version checks passed. Additive migration applied to the terminal development database without resetting data.
- Rebuilt four API-related ARM64 images and the web image. Updated ignored local Compose project preflyt-ce-local on port 8081, preserving existing volumes. Receiver uses a separate collector database on loopback port 8093.
- Running-container smoke verified actual sender acceptance, stable installation ID after restart, country preference persistence, development exclusion, synthetic GB resolution with a local MMDB, immediate country removal on opt-out, and a receiver schema containing no IP column. Synthetic smoke record removed; country preference restored to off. All services healthy.
- The local receiver mounts the upstream synthetic Country test fixture solely for verification. It is not a production geolocation database and is not bundled into runtime images. Its upstream license notices and source checksum accompany the fixture.

## Production configuration still needed

Host the receiver and configure its HTTPS URL. For optional country reporting, supply and maintain a licensed Country MMDB using docs/deployment/installation-reporting/compose.country.yaml; configure trusted proxy IPs and address-free logging as documented in docs/operations/installation-reporting.md. Upgrade the receiver before senders. No public endpoint or real installation geolocation was contacted by local verification.
