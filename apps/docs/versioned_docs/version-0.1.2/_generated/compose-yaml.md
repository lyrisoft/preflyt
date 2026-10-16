```yaml title="compose.yaml"
# Preflyt standalone Docker Compose file.
# Generated from the project's docker-compose.yaml; do not edit by hand.
#
# Requires Docker Compose v2.23.1 or later (inline configs).
# Settings come from a .env file next to this file. See the Quick Start.
#
# PREFLYT_NODE_ENV=development and PREFLYT_COOKIE_SECURE=false are for a local
# http://localhost trial only. Never set them on a deployment others can reach.
name: preflyt

x-otel: &otel
  OTEL_SDK_DISABLED: ${OTEL_SDK_DISABLED:-true}
  OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-}
  OTEL_EXPORTER_OTLP_PROTOCOL: ${OTEL_EXPORTER_OTLP_PROTOCOL:-http/protobuf}
  OTEL_EXPORTER_OTLP_HEADERS: ${OTEL_EXPORTER_OTLP_HEADERS:-}
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: ${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-}
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: ${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:-}
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: ${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:-}
  OTEL_TRACES_EXPORTER: ${OTEL_TRACES_EXPORTER:-otlp}
  OTEL_METRICS_EXPORTER: ${OTEL_METRICS_EXPORTER:-otlp}
  OTEL_LOGS_EXPORTER: ${OTEL_LOGS_EXPORTER:-otlp}
  OTEL_RESOURCE_ATTRIBUTES: ${OTEL_RESOURCE_ATTRIBUTES:-service.namespace=preflyt}
  OTEL_TRACES_SAMPLER: ${OTEL_TRACES_SAMPLER:-parentbased_traceidratio}
  OTEL_TRACES_SAMPLER_ARG: ${OTEL_TRACES_SAMPLER_ARG:-0.1}
  OTEL_METRIC_EXPORT_INTERVAL: ${OTEL_METRIC_EXPORT_INTERVAL:-60000}
  OTEL_EXPORTER_OTLP_TIMEOUT: ${OTEL_EXPORTER_OTLP_TIMEOUT:-3000}
  OTEL_PROPAGATORS: ${OTEL_PROPAGATORS:-tracecontext,baggage}

services:
  db:
    image: postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4
    restart: unless-stopped
    environment:
      POSTGRES_USER: preflyt_owner
      POSTGRES_DB: preflyt
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in root .env}
      DATABASE_APP_PASSWORD: ${DATABASE_APP_PASSWORD:?Set DATABASE_APP_PASSWORD in root .env}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -h 127.0.0.1 -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
      interval: 5s
      timeout: 3s
      retries: 20
    mem_limit: 1g
    cpus: 1.0
    networks: [backend]
    configs:
      - source: db_init
        target: /docker-entrypoint-initdb.d/01-runtime-role.sh
        mode: 0o555

  migrate:
    image: ${PREFLYT_IMAGE_REGISTRY:-ghcr.io/lyrisoft}/preflyt-api-migration:${PREFLYT_VERSION:?Set PREFLYT_VERSION to a published release, vX.Y.Z or sha-<40-character commit ID>}
    environment:
      DATABASE_URL: postgresql://preflyt_owner:${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}@db:5432/${PREFLYT_DATABASE:-preflyt}
    depends_on:
      db:
        condition: service_healthy
    restart: 'no'
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 1g
    cpus: 1.0
    networks: [backend]

  # Dedicated nested engine: no host Docker socket, host paths or published ports.
  # Privileged mode is required by Docker-in-Docker, not granted to scanner jobs.
  health-engine:
    image: docker:29.8.2-dind@sha256:1e08cdb63405ca788aea94ef35b792d1e299607c667d33d7bcbcae1fd2611ced
    privileged: true
    restart: unless-stopped
    environment:
      DOCKER_TLS_CERTDIR: /certs
      DOCKER_TLS_SAN: DNS:health-engine
    volumes:
      - health_engine_data:/var/lib/docker
      - health_engine_certs:/certs
      - health_jobs:/var/lib/preflyt/health-jobs:ro
    healthcheck:
      test: [CMD, docker, --host=tcp://127.0.0.1:2376, --tlsverify, --tlscacert=/certs/client/ca.pem, --tlscert=/certs/client/cert.pem, --tlskey=/certs/client/key.pem, info]
      interval: 5s
      timeout: 5s
      retries: 24
      start_period: 15s
    mem_limit: 4g
    cpus: 2.0
    pids_limit: 2048
    networks: [health_engine, health_build]

  health-init:
    image: ${PREFLYT_IMAGE_REGISTRY:-ghcr.io/lyrisoft}/preflyt-health-scanner:${PREFLYT_VERSION:?Set PREFLYT_VERSION to a published release, vX.Y.Z or sha-<40-character commit ID>}
    user: '0:0'
    command: [node, dist/health/health-scanner-init.js]
    depends_on:
      health-engine:
        condition: service_healthy
    restart: 'no'
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    cap_add: [CHOWN, FOWNER, DAC_OVERRIDE]
    security_opt: [no-new-privileges:true]
    network_mode: none
    mem_limit: 128m
    pids_limit: 32
    volumes:
      - health_engine_certs:/engine-certs:ro
      - health_engine_client:/run/docker-tls
      - health_state:/var/lib/preflyt/health-scanner
      - health_jobs:/var/lib/preflyt/health-jobs
      - health_connection:/var/lib/preflyt/health-connection

  health-scanner:
    image: ${PREFLYT_IMAGE_REGISTRY:-ghcr.io/lyrisoft}/preflyt-health-scanner:${PREFLYT_VERSION:?Set PREFLYT_VERSION to a published release, vX.Y.Z or sha-<40-character commit ID>}
    command: [node, dist/health-scanner.js]
    user: '1000:1000'
    environment:
      DOCKER_HOST: tcp://health-engine:2376
      DOCKER_TLS_VERIFY: '1'
      DOCKER_CERT_PATH: /run/docker-tls
      HOME: /tmp
      HEALTH_SCANNER_HOST: 0.0.0.0
      HEALTH_SCANNER_ORIGIN: https://health-scanner:3011
      HEALTH_SCANNER_STATE_DIRECTORY: /var/lib/preflyt/health-scanner
      HEALTH_SCANNER_JOBS_DIRECTORY: /var/lib/preflyt/health-jobs
      HEALTH_SCANNER_CONNECTION_FILE: /var/lib/preflyt/health-connection/connection.json
    depends_on:
      health-init:
        condition: service_completed_successfully
      health-engine:
        condition: service_healthy
    init: true
    restart: unless-stopped
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    pids_limit: 128
    mem_limit: 512m
    cpus: 1.0
    volumes:
      - health_engine_client:/run/docker-tls:ro
      - health_state:/var/lib/preflyt/health-scanner
      - health_jobs:/var/lib/preflyt/health-jobs
      - health_connection:/var/lib/preflyt/health-connection
    healthcheck:
      test: [CMD, node, dist/health/health-scanner-readiness.js]
      interval: 15s
      timeout: 10s
      retries: 4
      start_period: 30m
    # BuildKit's credential-free client resolves public registry tokens during preparation.
    # The actual repository scanner containers still run with --network=none.
    networks: [health_engine, health_service, health_build]

  api:
    image: ${PREFLYT_IMAGE_REGISTRY:-ghcr.io/lyrisoft}/preflyt-api:${PREFLYT_VERSION:?Set PREFLYT_VERSION to a published release, vX.Y.Z or sha-<40-character commit ID>}
    init: true
    restart: unless-stopped
    environment:
      <<: *otel
      NODE_ENV: ${PREFLYT_NODE_ENV:-production}
      OTEL_SERVICE_NAME: preflyt-api
      API_HOST: 0.0.0.0
      API_PORT: '3000'
      HEALTH_SCANNER_CONNECTION_FILE: /run/preflyt-health/connection.json
      REDIS_URL: ${REDIS_URL:-redis://cache:6379/0}
      REDIS_CACHE_PREFIX: ${REDIS_CACHE_PREFIX:-preflyt:production:cache}
      QUEUE_REDIS_URL: ${QUEUE_REDIS_URL:-redis://queue:6379/0}
      QUEUE_PREFIX: ${QUEUE_PREFIX:-preflyt:production:queue}
      DATABASE_URL: postgresql://preflyt_app:${DATABASE_APP_PASSWORD:?Set DATABASE_APP_PASSWORD}@db:5432/${PREFLYT_DATABASE:-preflyt}
      WEB_ORIGIN: ${WEB_ORIGIN:?Set WEB_ORIGIN}
      COOKIE_SECURE: '${PREFLYT_COOKIE_SECURE:-true}'
      # Legacy application values below are imported once. Use Settings thereafter.
      OIDC_ISSUER: ${OIDC_ISSUER:-}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:-}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:-}
      OIDC_REDIRECT_URI: ${OIDC_REDIRECT_URI:-}
      BOOTSTRAP_TOKEN_SHA256: ${BOOTSTRAP_TOKEN_SHA256:-}
      SUPER_ADMIN_USERNAME: ${SUPER_ADMIN_USERNAME:-}
      SUPER_ADMIN_PASSWORD: ${SUPER_ADMIN_PASSWORD:-}
      AI_CONFIGURATION_ENABLED: ${AI_CONFIGURATION_ENABLED:-false}
      AI_REVIEWS_ENABLED: ${AI_REVIEWS_ENABLED:-false}
      CONFIGURATION_ENCRYPTION_KEY: ${CONFIGURATION_ENCRYPTION_KEY:?Set CONFIGURATION_ENCRYPTION_KEY}
      AI_PROVIDER_ENCRYPTION_KEY: ${AI_PROVIDER_ENCRYPTION_KEY:-}
      NOTIFICATIONS_ENABLED: ${NOTIFICATIONS_ENABLED:-false}
      NOTIFICATION_EMAIL_ENABLED: ${NOTIFICATION_EMAIL_ENABLED:-false}
      GITHUB_EVENTS_ENABLED: ${GITHUB_EVENTS_ENABLED:-false}
      GITHUB_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET:-}
      GITHUB_CHECK_PUBLICATION_ENABLED: ${GITHUB_CHECK_PUBLICATION_ENABLED:-false}
      NATIVE_TOOL_REVIEWS: ${NATIVE_TOOL_REVIEWS:-[]}
      NATIVE_PREFLIGHT_ENABLED: ${NATIVE_PREFLIGHT_ENABLED:-false}
      NATIVE_EXECUTION_ENABLED: ${NATIVE_EXECUTION_ENABLED:-false}
      NATIVE_RUNTIME_BACKEND: ${NATIVE_RUNTIME_BACKEND:-kubernetes}
      NATIVE_DOCKER_APPROVAL: ${NATIVE_DOCKER_APPROVAL:-}
      NATIVE_RUNTIME_APPROVAL: ${NATIVE_RUNTIME_APPROVAL:-}
      NATIVE_RUNTIME_REVIEW_KEYS: ${NATIVE_RUNTIME_REVIEW_KEYS:-[]}
      NATIVE_CONTROLLER_API_KEY: ${NATIVE_CONTROLLER_API_KEY:-}
      RULESET_INSIGHTS_SYNC_ENABLED: ${RULESET_INSIGHTS_SYNC_ENABLED:-false}
      RULESET_INSIGHTS_RETENTION_DAYS: ${RULESET_INSIGHTS_RETENTION_DAYS:-90}
      AUTOMATIC_CHECK_PUBLICATION_ENABLED: ${AUTOMATIC_CHECK_PUBLICATION_ENABLED:-false}
      CI_REPORT_PROOF_MODE: ${CI_REPORT_PROOF_MODE:-github-native}
      CI_ORGANIZATION_SIGNER_KEYS: ${CI_ORGANIZATION_SIGNER_KEYS:-}
      CI_EXECUTION_CONTRACTS: ${CI_EXECUTION_CONTRACTS:-}
      GITHUB_RULESET_ACTIVATION_ENABLED: ${GITHUB_RULESET_ACTIVATION_ENABLED:-false}
      GITHUB_LOGIN_ENABLED: ${GITHUB_LOGIN_ENABLED:-false}
      GITHUB_LOGIN_CALLBACK_URL: ${WEB_ORIGIN:?Set WEB_ORIGIN}/api/auth/github/callback
      GITHUB_USER_TOKEN_ENCRYPTION_KEY: ${GITHUB_USER_TOKEN_ENCRYPTION_KEY:-}
      GITHUB_APP_ID: ${GITHUB_APP_ID:-}
      GITHUB_APP_CLIENT_ID: ${GITHUB_APP_CLIENT_ID:-}
      GITHUB_APP_CLIENT_SECRET: ${GITHUB_APP_CLIENT_SECRET:-}
      GITHUB_APP_PRIVATE_KEY: ${GITHUB_APP_PRIVATE_KEY:-}
      GITHUB_APP_OAUTH_CALLBACK_URL: ${WEB_ORIGIN:?Set WEB_ORIGIN}/api/github/oauth/callback
    depends_on:
      migrate:
        condition: service_completed_successfully
      health-scanner:
        condition: service_healthy
    healthcheck:
      test: [CMD, node, -e, 'fetch("http://127.0.0.1:3000/health/ready",{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))']
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 1g
    cpus: 1.0
    volumes:
      - health_connection:/run/preflyt-health:ro
    networks: [backend, egress, health_service]

  worker:
    image: ${PREFLYT_IMAGE_REGISTRY:-ghcr.io/lyrisoft}/preflyt-api:${PREFLYT_VERSION:?Set PREFLYT_VERSION to a published release, vX.Y.Z or sha-<40-character commit ID>}
    command: [node, dist/worker.js]
    init: true
    restart: unless-stopped
    environment:
      <<: *otel
      NODE_ENV: ${PREFLYT_NODE_ENV:-production}
      HEALTH_SCANNER_CONNECTION_FILE: /run/preflyt-health/connection.json
      DATABASE_URL: postgresql://preflyt_app:${DATABASE_APP_PASSWORD:?Set DATABASE_APP_PASSWORD}@db:5432/${PREFLYT_DATABASE:-preflyt}
      AI_CONFIGURATION_ENABLED: ${AI_CONFIGURATION_ENABLED:-false}
      AI_REVIEWS_ENABLED: ${AI_REVIEWS_ENABLED:-false}
      CONFIGURATION_ENCRYPTION_KEY: ${CONFIGURATION_ENCRYPTION_KEY:?Set CONFIGURATION_ENCRYPTION_KEY}
      AI_PROVIDER_ENCRYPTION_KEY: ${AI_PROVIDER_ENCRYPTION_KEY:-}
      NOTIFICATIONS_ENABLED: ${NOTIFICATIONS_ENABLED:-false}
      NOTIFICATION_EMAIL_ENABLED: ${NOTIFICATION_EMAIL_ENABLED:-false}
      GITHUB_EVENTS_ENABLED: ${GITHUB_EVENTS_ENABLED:-false}
      GITHUB_CHECK_PUBLICATION_ENABLED: ${GITHUB_CHECK_PUBLICATION_ENABLED:-false}
      RULESET_INSIGHTS_SYNC_ENABLED: ${RULESET_INSIGHTS_SYNC_ENABLED:-false}
      RULESET_INSIGHTS_RETENTION_DAYS: ${RULESET_INSIGHTS_RETENTION_DAYS:-90}
      AUTOMATIC_CHECK_PUBLICATION_ENABLED: ${AUTOMATIC_CHECK_PUBLICATION_ENABLED:-false}
      CI_REPORT_PROOF_MODE: ${CI_REPORT_PROOF_MODE:-github-native}
      CI_ORGANIZATION_SIGNER_KEYS: ${CI_ORGANIZATION_SIGNER_KEYS:-}
      CI_EXECUTION_CONTRACTS: ${CI_EXECUTION_CONTRACTS:-}
      NATIVE_PREFLIGHT_ENABLED: ${NATIVE_PREFLIGHT_ENABLED:-false}
      NATIVE_EXECUTION_ENABLED: ${NATIVE_EXECUTION_ENABLED:-false}
      NATIVE_RUNTIME_BACKEND: ${NATIVE_RUNTIME_BACKEND:-kubernetes}
      NATIVE_DOCKER_APPROVAL: ${NATIVE_DOCKER_APPROVAL:-}
      NATIVE_RUNTIME_APPROVAL: ${NATIVE_RUNTIME_APPROVAL:-}
      NATIVE_RUNTIME_REVIEW_KEYS: ${NATIVE_RUNTIME_REVIEW_KEYS:-[]}
      NATIVE_TOOL_REVIEWS: ${NATIVE_TOOL_REVIEWS:-[]}
      NATIVE_CONTROLLER_API_KEY: ${NATIVE_CONTROLLER_API_KEY:-}
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_FROM: ${SMTP_FROM:-}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASSWORD: ${SMTP_PASSWORD:-}
      WEB_ORIGIN: ${WEB_ORIGIN:?Set WEB_ORIGIN}
      GITHUB_USER_TOKEN_ENCRYPTION_KEY: ${GITHUB_USER_TOKEN_ENCRYPTION_KEY:-}
      GITHUB_APP_ID: ${GITHUB_APP_ID:-}
      GITHUB_APP_PRIVATE_KEY: ${GITHUB_APP_PRIVATE_KEY:-}
      GITHUB_APP_CLIENT_ID: ${GITHUB_APP_CLIENT_ID:-}
      GITHUB_APP_CLIENT_SECRET: ${GITHUB_APP_CLIENT_SECRET:-}
      OTEL_SERVICE_NAME: preflyt-worker
      QUEUE_REDIS_URL: ${QUEUE_REDIS_URL:-redis://queue:6379/0}
      QUEUE_PREFIX: ${QUEUE_PREFIX:-preflyt:production:queue}
    depends_on:
      queue:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
      health-scanner:
        condition: service_healthy
    healthcheck:
      test: [CMD, node, -e, 'const fs=require("fs");try{process.exit(Date.now()-Number(fs.readFileSync("/tmp/preflyt-github-worker-heartbeat","utf8"))<20000?0:1)}catch{process.exit(1)}']
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 15s
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    # Bounded Health source export can include up to 64 MiB of verified files.
    mem_limit: 1g
    cpus: 1.0
    volumes:
      - health_connection:/run/preflyt-health:ro
    networks: [backend, egress, health_service]

  cache:
    image: valkey/valkey:7.2-alpine@sha256:c6c2f0020be34bbf684a53a0ef716ab16ff70295186d4d9f2518435beb7afbff
    command: [valkey-server, --maxmemory, 128mb, --maxmemory-policy, allkeys-lru, --save, '']
    restart: unless-stopped
    healthcheck:
      test: [CMD, valkey-cli, ping]
      interval: 5s
      timeout: 3s
      retries: 12
    mem_limit: 256m
    cpus: 0.5
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    read_only: true
    tmpfs: [/tmp]
    user: valkey
    networks: [backend]

  queue:
    image: valkey/valkey:7.2-alpine@sha256:c6c2f0020be34bbf684a53a0ef716ab16ff70295186d4d9f2518435beb7afbff
    command: [valkey-server, --appendonly, 'yes', --appendfsync, everysec, --maxmemory, 256mb, --maxmemory-policy, noeviction]
    restart: unless-stopped
    volumes: [queue_data:/data]
    healthcheck:
      test: [CMD, valkey-cli, ping]
      interval: 5s
      timeout: 3s
      retries: 12
    mem_limit: 512m
    cpus: 0.5
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: valkey
    read_only: true
    tmpfs: [/tmp]
    networks: [backend]

  otel-collector:
    profiles: [observability]
    image: otel/opentelemetry-collector-contrib:0.162.0@sha256:39923a8e431bd1f57be82411999d389fcfe40857492e4365456d97a4c1f74be6
    command: [--config=/etc/otelcol/config.yaml]
    environment:
      COLLECTOR_UPSTREAM_ENDPOINT: ${COLLECTOR_UPSTREAM_ENDPOINT:-}
      COLLECTOR_UPSTREAM_HEADERS: ${COLLECTOR_UPSTREAM_HEADERS:-{}}
    restart: unless-stopped
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 256m
    cpus: 0.5
    networks: [backend, egress]
    configs:
      - source: otel_collector
        target: /etc/otelcol/config.yaml
        mode: 0o444

  web:
    image: ${PREFLYT_IMAGE_REGISTRY:-ghcr.io/lyrisoft}/preflyt-web:${PREFLYT_VERSION:?Set PREFLYT_VERSION to a published release, vX.Y.Z or sha-<40-character commit ID>}
    restart: unless-stopped
    ports:
      - '127.0.0.1:${PREFLYT_HTTP_PORT:-8080}:8080'
    depends_on:
      api:
        condition: service_healthy
        restart: true
    healthcheck:
      test: [CMD, wget, -q, --spider, http://127.0.0.1:8080/healthz]
      interval: 10s
      timeout: 3s
      retries: 5
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 256m
    cpus: 1.0
    networks: [backend, ingress]

volumes:
  health_engine_data:
  health_engine_certs:
  health_engine_client:
  health_state:
  health_jobs:
  health_connection:
  postgres_data:
  queue_data:

networks:
  health_engine:
    internal: true
  health_service:
    internal: true
  health_build:
  backend:
    internal: true
  egress:
  ingress:
configs:
  db_init:
    content: |
      #!/bin/sh
      set -eu
      : "$${DATABASE_APP_PASSWORD:?DATABASE_APP_PASSWORD is required}"
      psql -v ON_ERROR_STOP=1 --username "$$POSTGRES_USER" --dbname "$$POSTGRES_DB" \
        --set=app_password="$$DATABASE_APP_PASSWORD" <<'SQL'
      SELECT format('CREATE ROLE preflyt_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L', :'app_password') \gexec
      GRANT CONNECT ON DATABASE preflyt TO preflyt_app;
      GRANT USAGE ON SCHEMA public TO preflyt_app;
      ALTER DEFAULT PRIVILEGES FOR ROLE preflyt_owner IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO preflyt_app;
      ALTER DEFAULT PRIVILEGES FOR ROLE preflyt_owner IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO preflyt_app;
      SQL
  otel_collector:
    content: |
      receivers:
        otlp:
          protocols:
            grpc:
              endpoint: 0.0.0.0:4317
            http:
              endpoint: 0.0.0.0:4318
      processors:
        memory_limiter:
          check_interval: 1s
          limit_mib: 160
          spike_limit_mib: 40
        batch:
          timeout: 1s
      exporters:
        otlphttp:
          endpoint: $${env:COLLECTOR_UPSTREAM_ENDPOINT}
          headers: $${env:COLLECTOR_UPSTREAM_HEADERS}
          timeout: 3s
          sending_queue:
            queue_size: 256
      service:
        pipelines:
          traces:
            receivers: [otlp]
            processors: [memory_limiter, batch]
            exporters: [otlphttp]
          metrics:
            receivers: [otlp]
            processors: [memory_limiter, batch]
            exporters: [otlphttp]
          logs:
            receivers: [otlp]
            processors: [memory_limiter, batch]
            exporters: [otlphttp]
```
