---
id: observability
title: Observability
sidebar_label: Observability
description: Send Preflyt traces, metrics and logs to an OpenTelemetry endpoint.
---

# Observability

Preflyt emits traces, metrics and structured logs using **OpenTelemetry**. Telemetry is **off by default** until you supply an endpoint. No particular backend is bundled or required.

The API and the worker report under different service names, so you can tell them apart.

## Send telemetry directly

In `.env`:

```bash
OTEL_SDK_DISABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf   # or grpc
```

Optional settings:

- per-signal endpoints (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `…_METRICS_ENDPOINT`, `…_LOGS_ENDPOINT`; HTTP URLs include `/v1/traces`, `/v1/metrics`, `/v1/logs`),
- exporter headers for authentication (`OTEL_EXPORTER_OTLP_HEADERS`),
- sampling (`OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`; the default samples 10% of new traces),
- resource attributes (`OTEL_RESOURCE_ATTRIBUTES`).

All variables are listed in the [configuration reference](configuration.md#telemetry).

## Use the optional collector

If you would rather have applications send to a local collector that forwards upstream:

1. Set the upstream in `.env`:

   ```bash
   COLLECTOR_UPSTREAM_ENDPOINT=https://otlp.example.com
   COLLECTOR_UPSTREAM_HEADERS={"Authorization":"Bearer <token>"}
   ```

2. Point the applications at the collector:

   ```bash
   OTEL_SDK_DISABLED=false
   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318   # HTTP
   # or http://otel-collector:4317 with OTEL_EXPORTER_OTLP_PROTOCOL=grpc
   ```

3. Start the profile:

   ```bash
   docker compose --env-file .env --profile observability up -d
   ```

Leave the application exporter headers empty when only the collector needs upstream credentials. The collector's ports are private to the Compose network, and its bounded in-memory queue is telemetry buffering, not durable storage.

## Webhook trace context

Each GitHub webhook delivery stores its W3C trace context (without request bodies or authentication headers), so you can follow a delivery from receipt through worker processing.

## Health checks

| Check | What it tells you |
| --- | --- |
| `GET /healthz` on the web service | The web container is up. |
| API readiness | The API can reach PostgreSQL. |
| Worker health | A heartbeat updated every five seconds after a successful PostgreSQL reconcile and queue probe. |

Compose health checks use these to order startup and to report `docker compose ps`.
