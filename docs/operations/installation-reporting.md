# Installation reporting operations

Installation reporting is optional and enabled by default, which is **opt-out**, not opt-in. Settings → Configuration contains the disclosure, persistent switch, last accepted report time and exact report contents. Reporting controls do not add a banner to normal workspace pages.

## What is sent

The version 1 JSON envelope contains only `countryReporting` (an explicit permission flag), `schemaVersion`, a random `installationId`, Preflyt `version` and `deploymentType` (`compose`, `kubernetes`, `linux`, `development` or `unknown`). No names, emails, organization or repository identifiers, source code, findings, account tokens or host identifiers are sent. A stable installation ID is pseudonymous: it distinguishes deployments without identifying the operator. Network peers necessarily see transport addresses, but the receiver does not store IP addresses or emit access logs. Its rate limiter uses an ephemeral salted address hash held in memory.

One installation ID is generated and stored per application database. All API replicas share it. The sender attempts an initial report at startup, then every 24 hours plus up to 15 minutes of jitter. Failures back off from one minute to one hour without blocking application startup or requests. Disabling stops future reports; a request already in flight may finish. Existing collected records are not retracted by the off switch. Records inactive for 90 days are deleted by the receiver.

`PREFLYT_INSTALLATION_REPORTING_ENABLED=false` disables reporting before the first startup and overrides the UI switch. It is independent of OpenTelemetry and the release checker. No destination is bundled yet: an unset/invalid `PREFLYT_INSTALLATION_REPORTING_URL` sends nothing and is shown as Not configured. Production endpoints must use HTTPS, have the exact `/v1/installations` path, and contain no credentials, query string or fragment. Redirects are rejected. The explicit local HTTP override is accepted only outside production.

## Host the receiver once

A full backoffice is not required. The API image also includes a standalone receiver process; it does not start the Preflyt product API, workers or OpenTelemetry. Use `docs/deployment/installation-reporting/compose.yaml` on infrastructure controlled by Preflyt's maintainers, with a separate collector database. Do not include it in customer quick starts.

1. Choose a receiver hostname you control. It does not need to be the product or API hostname.
2. Set `PREFLYT_VERSION` to a published image containing this feature, `COLLECTOR_DATABASE_PASSWORD` to a fresh hexadecimal password and `COLLECTOR_ADMIN_TOKEN` to a fresh 32+ character secret. Protect the environment file (`chmod 600`). Generate each secret independently with `openssl rand -hex 32`.
3. Start the receiver with `docker compose -f docs/deployment/installation-reporting/compose.yaml --env-file /private/path/collector.env up -d --wait`.
4. Configure an HTTPS reverse proxy to `127.0.0.1:8093`. Disable proxy/CDN access logs for ingestion to avoid retaining client IP addresses, and add edge request limits. Leave `/v1/statistics` private or access-controlled in addition to its bearer token. Do not place the administrator token in customer images, browser configuration or sender environment.
5. After the receiver is reachable, set `PREFLYT_INSTALLATION_REPORTING_URL=https://YOUR_RECEIVER_HOST/v1/installations` on reporting installations and restart their APIs. A production default hostname can be added to publication configuration once the endpoint is deployed and confirmed; no hostname has been invented or contacted by this implementation.

The standalone receiver initializes only its `preflyt_installations` table and index. It stores the random ID, version, deployment type, optional country code and server-generated first/last seen times. It accepts at most 2 KiB, rejects fields outside the envelope and throttles repeated updates to one per installation per hour. It uses parameterized queries, bounded database connections and basic in-memory request limiting. This is not an attestation protocol: a public sender can spoof IDs. Use the statistics as approximate adoption signals, not verified customer counts.

## Read counts without a backoffice

`GET /v1/statistics` requires `Authorization: Bearer <COLLECTOR_ADMIN_TOKEN>` and returns only aggregates:

- known installations within retained data,
- installations active in the last 30 days,
- first-seen installations in the last 30 days,
- active version, deployment-type and country distributions. Country aggregates include only resolved, opted-in reports; they are not a breakdown of all installations.

Development versions and deployments are excluded from adoption counts. Reinstalls, cloned databases, disabled reporting and offline installations can overcount or undercount. "Known installations" is not an all-time total because inactive records are pruned after 90 days. The endpoint can feed a future internal dashboard without changing the client protocol. Keep its token in a server-side secret manager or password manager, not in a frontend bundle or shell history.

## Local verification

Local Compose can run the sender against a separate receiver/database using an explicit development HTTP override. Production remains unconfigured until a real endpoint is hosted. Tests use disposable databases and mocked outbound requests; live smoke verification uses only the local receiver. No reporting destination outside this machine is contacted by those tests.

## Optional installation country

Settings → Configuration → Installation reporting contains **Include installation country**, a separate administrator-only switch, **off by default**. Turning the main reporting switch off stops country reports too; it does not silently reset the saved country preference. `PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED=false` enforces country reporting off before startup, regardless of the saved preference. Leaving this variable empty does not opt anyone in. The report carries only a boolean permission flag: the sender does not resolve or send an IP or country value itself. Legacy reports without the flag mean no permission.

The standalone receiver resolves the transport IP with a local MMDB country database. It makes no third-party geolocation request and retains only a validated ISO country code. No address lookup cache or access logs are created. The operating system keeps the peer address for the lifetime of the TCP connection; the receiver does not persist it after lookup. Its short-lived rate-limit key is a salted hash, never a raw address. Private, reserved, malformed, unresolved addresses and lookup failures produce no country. Only the database's geographic country is used, never registered-network country. Server egress location can differ from the team's location because of hosting, VPNs or proxies.

Host configuration:

1. Obtain and maintain a GeoIP2/GeoLite2 **Country** MMDB under its provider's license. Preflyt does not bundle or download this database at runtime. Database credentials belong only in the operator's update process. Check the [MaxMind database documentation](https://dev.maxmind.com/geoip/docs/databases/) for acquisition and updates.
2. Set `COLLECTOR_COUNTRY_DATABASE` to its absolute file path and add `-f docs/deployment/installation-reporting/compose.country.yaml` after the receiver's base Compose file. Restart the receiver after atomically replacing the database. An explicitly configured unreadable/corrupt file fails startup; with no database configured reports still work and countries stay unknown.
3. Directly connected receivers use only the TCP peer. Behind a proxy, set `COLLECTOR_TRUSTED_PROXIES` to the comma-separated **exact immediate proxy IPs** as observed by the receiver (no wildcards/CIDRs). Restrict receiver access to these proxies. The proxy must overwrite, not append or forward, `X-Real-IP` using its verified client address, for example Nginx `proxy_set_header X-Real-IP $remote_addr;`. `X-Forwarded-For` and client-supplied country headers are ignored. Do not trust all Docker gateways or unverified upstream headers. Keep reverse-proxy/CDN access logging off for ingestion; also ensure error logs and monitoring do not capture client addresses, request headers or report bodies.

Turning country reporting off schedules the next report promptly (the sender checks every minute). On acceptance, the receiver clears any previous country immediately even within its hourly deduplication window. It does not retract a request already in flight, and it cannot erase a receiver record while the whole reporting feature or network is disabled. In that case previous country data expires with the record after 90 days of inactivity. Countries are excluded from ordinary product audits: those record preference changes only, not network addresses. `/v1/statistics` returns `byCountry` aggregates to authenticated operators only; development records remain excluded.
