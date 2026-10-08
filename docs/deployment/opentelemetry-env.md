# OpenTelemetry environment configuration for Preflyt

**Status:** Required deployment contract; implementation pending

Preflyt must expose **standard OpenTelemetry SDK environment variables** through the root `.env.example` and Docker Compose services. Operators can export traces, metrics and logs to any compatible OTLP collector/APM without changing source code. SigNoz is an optional destination, **not a required hard-coded backend**.

## Root `.env.example` section

~~~dotenv
# OpenTelemetry / APM
OTEL_SDK_DISABLED=false

# Shared application resource metadata.
# Each service has its own OTEL_SERVICE_NAME set by docker-compose.yml.
OTEL_RESOURCE_ATTRIBUTES=service.namespace=preflyt,deployment.environment.name=production

# Choose http/protobuf (OTLP HTTP usually port 4318) or grpc (usually 4317).
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Your OTLP collector or vendor endpoint; no application code changes required.
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318

# Provider-specific authorization headers when needed.
# Format follows OTel environment-variable header encoding; check vendor docs.
OTEL_EXPORTER_OTLP_HEADERS=

OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp

OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_METRIC_EXPORT_INTERVAL=60000
OTEL_PROPAGATORS=tracecontext,baggage

# Optional signal-specific overrides. When set, use the complete signal endpoint
# URL required by the destination (for OTLP/HTTP, often ending in /v1/traces etc.).
# OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=
# OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=
# OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=
~~~

**Example endpoint only:** `otel-collector` resolves inside Compose **only when the optional collector profile is enabled**. For the normal deployment, the operator must set `OTEL_EXPORTER_OTLP_ENDPOINT` to a reachable external collector/APM endpoint, or explicitly set `OTEL_SDK_DISABLED=true`. Do not default to a non-existent service and then claim observability is healthy.

## Container wiring

Use a shared Compose environment anchor or equivalent to pass the standard OTEL variables into `api`, `worker`, `intelligence-worker`, `execution-controller` and other first-party services. **Override `OTEL_SERVICE_NAME` per service** (`preflyt-api`, `preflyt-worker`, `preflyt-intelligence-worker`, `preflyt-execution-controller`). Set environment/resource attributes by deployment. Never pass arbitrary OTEL authentication headers or model-provider API keys into untrusted repository sandboxes.

For HTTP/protobuf, `OTEL_EXPORTER_OTLP_ENDPOINT` is the base URL (the SDK appends signal paths); for grpc it is the gRPC endpoint. If using per-signal `OTEL_EXPORTER_OTLP_*_ENDPOINT`, supply the destination-specific full signal URL for OTLP/HTTP. Respect upstream SDK conventions and test both protocols.

OpenTelemetry Node.js SDK initialization must occur **before** NestJS, HTTP, DB and BullMQ worker instrumentation is loaded. Wire supported traces, metrics, and logs exporters; do not claim the app exports all three until verified in integration tests. Instrument outgoing model gateway and Git operations with secret-redacted spans and stable correlation identifiers.

## Optional included collector

Provide an **opt-in** OpenTelemetry Collector Compose profile with configurable pipelines/exporters and sane defaults. A direct APM endpoint must not require running the collector. Avoid bundling a complete SigNoz stack into the mandatory core Compose deployment. If local collector is enabled, choose compatible `4318` HTTP or `4317` gRPC URL and include a tested collector configuration.

## Deployment acceptance

- [ ] Root `.env.example` documents standard OTEL variables, endpoint/protocol, auth headers, sampling and resource metadata.
- [ ] Every first-party service can export to one configured OTLP-compatible backend without code changes.
- [ ] Per-service resource identity is distinct; traces across API, queue/worker and integration calls correlate when context is propagated.
- [ ] A test receiver/collector confirms trace, metric and log signal delivery (or documents missing signal support explicitly).
- [ ] SDK-disabled mode runs application normally without exporter errors.
- [ ] Invalid/unreachable APM endpoint produces diagnostics without taking down core service functionality.
- [ ] Auth headers and sensitive span/log attributes do not leak to browser, CLI or untrusted sandbox processes.
- [ ] Compose supports both optional bundled collector and externally managed OTLP destination.
- [ ] The complete supported release starts from versioned images using root `.env` and `docker compose up -d`, without installing Node.js/Postgres/Redis on host.
