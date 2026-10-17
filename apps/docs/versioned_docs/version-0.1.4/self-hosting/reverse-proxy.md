---
id: reverse-proxy
title: Reverse proxy and TLS
sidebar_label: Reverse proxy and TLS
description: Put an HTTPS reverse proxy in front of Preflyt for production.
---

# Reverse proxy and TLS

Preflyt does not install a certificate or reverse proxy. For production, run your own HTTPS proxy in front of the web service.

## What to forward

The web service listens on **`127.0.0.1:8080`** (or `PREFLYT_HTTP_PORT`). Forward the **entire public origin** to it. Preflyt serves the app and forwards `/api/` to the API on the same origin, so you do not route the API separately.

Requirements:

- The public origin must match `WEB_ORIGIN` exactly: HTTPS, no trailing slash, no path.
- Preserve the original `Host` header. Preflyt's web service passes it through, and sets its own forwarded headers on the inner hop.
- Production forces secure cookies and requires HTTPS for OIDC endpoints and callbacks.
- Webhooks from GitHub reach `<WEB_ORIGIN>/api/github/webhooks`, so the proxy must accept inbound requests from GitHub.

## Example: Caddy

```text
preflyt.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Caddy obtains and renews the certificate automatically.

## Example: nginx

```nginx
server {
  listen 443 ssl;
  server_name preflyt.example.com;

  ssl_certificate     /etc/ssl/preflyt/fullchain.pem;
  ssl_certificate_key /etc/ssl/preflyt/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

:::note
These are starting points for your own proxy, not shipped configuration. Review header, body-size and timeout settings for your environment. Webhook bodies are limited to 1 MiB.
:::

## Log hygiene

Preflyt's web access logs omit query strings, because they can contain OAuth codes and setup state. If your own proxy logs requests, avoid recording full query strings on `/api/` paths.

## Check it works

After the proxy is up:

1. Open `<WEB_ORIGIN>` over HTTPS and confirm the sign-in page loads without mixed-content warnings.
2. Sign in at `<WEB_ORIGIN>/super-admin/login`.
3. In GitHub, open your App's **Advanced** tab and redeliver a recent webhook. You should see a `202`.
