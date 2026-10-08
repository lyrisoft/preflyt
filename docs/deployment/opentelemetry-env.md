# OpenTelemetry configuration

**Status:** Implemented for the current API and GitHub event worker. Future intelligence/execution services remain planned. Published release images depend on a successful publishing workflow; local Compose source builds are available now.

The canonical root `.env.example` includes the complete application and deployment configuration. Compose passes shared OTEL settings to API/worker with distinct `preflyt-api` and `preflyt-worker` service names. Telemetry defaults to disabled until an endpoint is configured. SigNoz is one optional OTLP destination; no backend is hard-coded.

## Direct OTLP destination

```dotenv
OTEL_SDK_DISABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector.example.com
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20<token>
OTEL_RESOURCE_ATTRIBUTES=service.namespace=preflyt,deployment.environment.name=production
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_METRIC_EXPORT_INTERVAL=60000
OTEL_EXPORTER_OTLP_TIMEOUT=3000
OTEL_PROPAGATORS=tracecontext,baggage
```

Use `grpc` with the destination's gRPC endpoint when required (commonly 4317; HTTP commonly 4318). HTTP shared endpoint is a base URL; exporters append `/v1/traces`, `/v1/metrics`, `/v1/logs`. Optional `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` and `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` override complete per-signal URLs. Exporters support `otlp` or `none`; configure the shared protocol consistently. Header values follow the SDK's percent-encoded comma-separated format. Do not put credentials in resource attributes or endpoint URLs.

API/worker entry modules initialize the Node SDK before dynamically importing NestJS, HTTP, database or BullMQ. HTTP, outgoing fetch and PostgreSQL calls produce redacted spans; application request/operation counters and duration metrics are exported alongside structured lifecycle/operation logs. Arbitrary NestJS errors and console output are not forwarded as OTLP logs. Worker spans resume the accepted webhook's W3C trace parent persisted in PostgreSQL, preserving context when Redis is unavailable at receipt. Sampling may omit traces; use `always_on` during a controlled verification.

Only allowlisted attributes leave the service: method/status, database system/operation, fixed component/outcome, and delivery identifier. Query strings, headers, request/response bodies, SQL statements, exception text, span events and links are removed from exported spans/metric attributes. Environment/process-argument auto-detection is disabled. OTEL headers stay in first-party server containers; they are absent from the browser image and must never be passed to future repository sandboxes.

SDK-disabled mode uses no exporters. Missing/invalid configuration produces a static warning and leaves core functionality available. Exporter outages are bounded by timeouts (maximum 10 seconds per export), batching and bounded queues; they do not fail application requests. Trace/metric export failures emit throttled static diagnostics without endpoint/header/error content. Graceful shutdown flushes pending telemetry; forced termination can lose buffered telemetry.

## Optional bundled collector

The `observability` profile contains a pinned collector with HTTP/gRPC receivers and all three pipelines. Configure `COLLECTOR_UPSTREAM_ENDPOINT` as the external OTLP HTTP base URL and `COLLECTOR_UPSTREAM_HEADERS` as a JSON object. Applications use `http://otel-collector:4318` or gRPC `http://otel-collector:4317`. The name resolves only with that profile enabled. Direct export does not require it. See the [Compose runbook](../operations/docker-compose.md).

## Verification

Focused integration tests use real HTTP/protobuf and gRPC receivers to confirm all three signals, configured headers, worker identity, parent trace ID, and redaction. Separate child-process tests verify disabled, unreachable and invalid configuration modes. Deployment tests verify server-only secrets, service identities and queue/cache separation. The collector configuration is validated against its pinned binary; Compose startup and migrations are rehearsed in a disposable project. Vendor dashboards and live external APM delivery remain operator checks.

References: [OpenTelemetry Node SDK](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) and [OTLP exporters](https://opentelemetry.io/docs/languages/js/exporters/).
