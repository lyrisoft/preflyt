---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: Diagnose common Preflyt installation and configuration problems.
---

# Troubleshooting

## Look at the logs first

```bash
docker compose --env-file .env ps
docker compose --env-file .env logs --tail=100 migrate api worker cache queue web
```

:::caution Do not share resolved configuration
`docker compose config` and container environment dumps contain resolved secrets. Do not paste them into tickets or chats.
:::

## The stack will not start

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `Set POSTGRES_PASSWORD in root .env` (or `DATABASE_APP_PASSWORD`, `WEB_ORIGIN`, `CONFIGURATION_ENCRYPTION_KEY`) | A required value is missing. | Set it in `.env` and run `up` again. See [Docker Compose](docker-compose.md). |
| `migrate` exits with an error | A migration failed. The API and web will not start. | Read the `migrate` logs. Keep the volume and your backup. Do not reset the database. |
| `api` restarts at boot | Invalid or partial OIDC configuration, failed issuer discovery, or a configuration decryption error. | Provide all OIDC fields or none. Check `CONFIGURATION_ENCRYPTION_KEY` is the original key. |
| `worker` stays unhealthy | It waits for the API's initial configuration import. | Fix the API first, then check the worker. |
| Changing `.env` passwords has no effect | Credentials only initialize roles on a fresh volume. | Plan a database-role change. See [Upgrades and backups](upgrades-and-backups.md). |

## Sign-in

| Symptom | What to check |
| --- | --- |
| You can't reach `/super-admin/login` | `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` were both set before first start, and the password is 24 to 128 characters. |
| "Sign-in failed" | Wrong username or password. The login is rate-limited, so wait before retrying. |
| "Sign-in expired. Start again." | The sign-in attempt timed out. Start from the sign-in page again. |
| You're signed out unexpectedly | Super Admin sessions last 24 hours and other sessions eight. Activity does not extend them. |
| Login loops locally | Use the same hostname throughout. `localhost` and `127.0.0.1` have separate cookies. For a local trial on plain `http://localhost`, set `PREFLYT_NODE_ENV=development` and `PREFLYT_COOKIE_SECURE=false` in `.env`, as in the [Quick Start](../getting-started/quick-start.md), then run `docker compose up -d`. |
| **Reconnect to Preflyt** appears | The browser can't confirm your session, usually during an API outage. Use **Retry connection**. Preflyt does not log you out for transient errors. |

## GitHub

| Symptom | What to check |
| --- | --- |
| The install redirect fails | The App's **Setup URL** and callback URLs match `WEB_ORIGIN` exactly, and "Request user authorization during installation" is **off**. |
| GitHub sign-in is not offered | The sign-in switch is on in Settings, `GITHUB_USER_TOKEN_ENCRYPTION_KEY` is set, the login callback is registered, and the saved GitHub connection has refreshed. Deployment encryption-key changes require recreating the affected services. |
| Repositories are missing | The App is installed on that organization and has access to the repository. |
| No events appear | Event ingestion is on in Settings, the webhook URL is `<WEB_ORIGIN>/api/github/webhooks`, and the App is subscribed to **Pull request**, **Check run** and **Workflow run**. GitHub can't reach `localhost`. |
| A delivery returns `401` | The webhook secret differs between GitHub and Preflyt. |
| A delivery returns `503` | Event ingestion is off or not configured. |
| A delivery shows **Processing failed** | The worker gave up after five attempts. Fix the cause, then an administrator can move that delivery's state in PostgreSQL from `FAILED` back to `RECEIVED` and clear its `reason` and `processedAt`. There is no button for this yet. |
| A delivery shows **Not processed** | Repository access changed before the worker processed it. |

## Settings changes do not take effect

Saved GitHub and governance connections refresh without a restart, as do feature switches. OIDC and SMTP connection changes still require restarting both the API and worker.

If a switch suddenly turns off by itself, check the API logs for a configuration read or decryption error. When that happens Preflyt disables live switches rather than falling back to old values.

## Notifications

Email needs SMTP configured in **Settings → Configuration** by Super Admin. `SMTP_ALLOW_INSECURE_LOCAL` only helps with a loopback test server in development and is ignored in production.

## Still stuck?

Collect the service logs above (without secrets) and the exact time of the problem, and open an issue in the [Preflyt repository](https://github.com/lyrisoft/preflyt/issues).
