# syntax=docker/dockerfile:1
FROM node:24.4.1-bookworm-slim@sha256:36ae19f59c91f3303c7a648f07493fe14c4bd91320ac8d898416327bacf1bbfa AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.26.2
WORKDIR /workspace
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /usr/share/licenses/preflyt/
COPY apps/web/LICENSE /usr/share/licenses/preflyt/third-party/shadcn-admin-LICENSE
COPY apps/web/THIRD_PARTY_NOTICES.md /usr/share/licenses/preflyt/third-party/web-NOTICES.md
COPY apps/api/src/github-events/sarif-schema.LICENSE.md /usr/share/licenses/preflyt/third-party/sarif-schema-LICENSE.md

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @preflyt/api... --frozen-lockfile --ignore-scripts
COPY apps/api apps/api
COPY scripts/deploy/package-runtime.mjs scripts/deploy/license-bundle.mjs /opt/preflyt/
# Generation needs a syntactically valid URL, not a live database or build secret.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @preflyt/api build \
    && node /opt/preflyt/package-runtime.mjs /workspace/apps/api /opt/api api \
    && node /opt/preflyt/package-runtime.mjs /workspace/apps/api /opt/migration migration \
    && node /opt/preflyt/package-runtime.mjs /workspace/apps/api /opt/scanner scanner

# Build tools and package managers stay outside the shipped runtime.
FROM node:24.4.1-bookworm-slim@sha256:36ae19f59c91f3303c7a648f07493fe14c4bd91320ac8d898416327bacf1bbfa AS runtime-base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules /opt/yarn* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=base /usr/share/licenses/preflyt /usr/share/licenses/preflyt

FROM runtime-base AS migration
WORKDIR /workspace/apps/api
COPY --from=build --chown=node:node /opt/migration/ ./
COPY apps/api/prisma.config.ts ./
COPY apps/api/prisma ./prisma
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM runtime-base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN install -d -o node -g node -m 0700 /var/lib/preflyt-health-sources
WORKDIR /app
COPY --from=build --chown=node:node /opt/api/ ./
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --chown=node:node apps/api/resources/preflyt-companion.mjs ./resources/preflyt-companion.mjs
COPY --chown=node:node apps/api/resources/preflyt-deepseek-LICENSE.txt ./resources/preflyt-deepseek-LICENSE.txt
COPY --chown=node:node apps/api/resources/report-fonts ./resources/report-fonts
COPY --chown=node:node apps/api/resources/preflyt-logo-color.png ./resources/preflyt-logo-color.png
ARG PREFLYT_BUILD_VERSION=development
ARG PREFLYT_BUILD_SHA=unknown
ENV PREFLYT_BUILD_VERSION=$PREFLYT_BUILD_VERSION PREFLYT_BUILD_SHA=$PREFLYT_BUILD_SHA
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

# Dedicated native controller only. API and integration worker keep the runtime target.
FROM docker:29-cli@sha256:1a4c7cb63513f349bdad01fcc6e0f3f2f67d37b9da86f14dc0d4a0942eecda00 AS docker-cli
FROM runtime AS native-docker-controller
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
CMD ["node", "dist/execution-controller.js"]

# Standalone Dockerfiles remain the source of truth. Regenerate with:
# node scripts/deploy/scanner-stages.mjs
# BEGIN GENERATED SCANNER STAGES
FROM zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f AS bundle-gitleaks-tool
FROM node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS bundle-gitleaks
COPY --from=bundle-gitleaks-tool /usr/bin/gitleaks /usr/local/bin/gitleaks
COPY docs/deployment/native-runner/runner.mjs docs/deployment/native-runner/semgrep-locations.mjs docs/deployment/native-runner/source-verification.mjs docs/deployment/native-runner/source-initializer.mjs docs/deployment/native-runner/adapters.json /opt/preflyt/
COPY docs/deployment/native-runner/config /opt/preflyt/config
COPY docs/deployment/native-runner/licenses /usr/share/licenses/preflyt-scanners
USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/node", "/opt/preflyt/runner.mjs"]

FROM node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS bundle-semgrep-node
FROM semgrep/semgrep@sha256:93963d9295a366f59e4850127b1550400ee7b388f04fe144e4a1f6325d96e01b AS bundle-semgrep-ce-rootfs
# The vendor image also includes Semgrep Code. Preflyt uses only CE.
RUN rm /usr/lib/python3.12/site-packages/semgrep/bin/semgrep-core-proprietary \
    && test -x /usr/lib/python3.12/site-packages/semgrep/bin/semgrep-core
COPY docs/deployment/native-runner/licenses /usr/share/licenses/preflyt-scanners
COPY --from=bundle-semgrep-node /usr/local/bin/node /usr/local/bin/node
COPY --from=bundle-semgrep-node /usr/lib/libstdc++.so.6 /usr/lib/libstdc++.so.6
COPY --from=bundle-semgrep-node /usr/lib/libgcc_s.so.1 /usr/lib/libgcc_s.so.1
COPY docs/deployment/native-runner/runner.mjs docs/deployment/native-runner/source-verification.mjs docs/deployment/native-runner/source-initializer.mjs docs/deployment/native-runner/adapters.json /opt/preflyt/
COPY docs/deployment/native-runner/config /opt/preflyt/config
COPY docs/deployment/native-runner/semgrep-measure.mjs /opt/preflyt/semgrep-measure.mjs
COPY docs/deployment/native-runner/semgrep-locations.mjs /opt/preflyt/semgrep-locations.mjs
RUN ln -s /usr/bin/semgrep /usr/local/bin/semgrep
# Flatten the sanitized filesystem so the proprietary binary is absent from every
# shipped layer, including the standalone scanner image.
FROM scratch AS bundle-semgrep
COPY --from=bundle-semgrep-ce-rootfs / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    SEMGREP_IN_DOCKER=1 SEMGREP_USER_AGENT_APPEND=Docker PYTHONIOENCODING=utf8 PYTHONUNBUFFERED=1
USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/node", "/opt/preflyt/runner.mjs"]

FROM node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS bundle-duplication
WORKDIR /opt/preflyt/duplication
COPY docs/deployment/native-runner/duplication/package.json docs/deployment/native-runner/duplication/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY docs/deployment/native-runner/duplication/scan.mjs docs/deployment/native-runner/duplication/compact-store.mjs ./
COPY docs/deployment/native-runner/runner.mjs docs/deployment/native-runner/semgrep-locations.mjs docs/deployment/native-runner/source-verification.mjs docs/deployment/native-runner/source-initializer.mjs docs/deployment/native-runner/adapters.json /opt/preflyt/
COPY docs/deployment/native-runner/licenses /usr/share/licenses/preflyt-scanners
USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/node", "/opt/preflyt/runner.mjs"]

FROM aquasec/trivy@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa AS bundle-trivy-tool
FROM bundle-trivy-tool AS bundle-trivy-database
ARG PREFLYT_DATABASE_EPOCH=source-build
RUN trivy image --download-db-only --cache-dir /opt/preflyt/trivy-cache
FROM node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS bundle-trivy-base
COPY --from=bundle-trivy-tool /usr/local/bin/trivy /usr/local/bin/trivy
COPY docs/deployment/native-runner/runner.mjs docs/deployment/native-runner/semgrep-locations.mjs docs/deployment/native-runner/offline-database.mjs docs/deployment/native-runner/source-verification.mjs docs/deployment/native-runner/source-initializer.mjs docs/deployment/native-runner/adapters.json /opt/preflyt/
COPY docs/deployment/native-runner/config /opt/preflyt/config
COPY docs/deployment/native-runner/licenses /usr/share/licenses/preflyt-scanners
USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/node", "/opt/preflyt/runner.mjs"]

# Build with --target dependencies; the default target stays database-free for IaC.
FROM bundle-trivy-base AS bundle-trivy-dependencies
COPY --from=bundle-trivy-database /opt/preflyt/trivy-cache/db /opt/preflyt/trivy-cache/db
FROM bundle-trivy-base AS bundle-trivy

FROM aquasec/trivy@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa AS bundle-dependencies-tool
FROM bundle-dependencies-tool AS bundle-dependencies-database
ARG PREFLYT_DATABASE_EPOCH=source-build
RUN trivy image --download-db-only --cache-dir /opt/preflyt/trivy-cache
FROM node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS bundle-dependencies-base
COPY --from=bundle-dependencies-tool /usr/local/bin/trivy /usr/local/bin/trivy
COPY docs/deployment/native-runner/runner.mjs docs/deployment/native-runner/semgrep-locations.mjs docs/deployment/native-runner/offline-database.mjs docs/deployment/native-runner/source-verification.mjs docs/deployment/native-runner/source-initializer.mjs docs/deployment/native-runner/adapters.json /opt/preflyt/
COPY docs/deployment/native-runner/config /opt/preflyt/config
COPY docs/deployment/native-runner/licenses /usr/share/licenses/preflyt-scanners
USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/node", "/opt/preflyt/runner.mjs"]

# Build with --target dependencies; the default target stays database-free for IaC.
FROM bundle-dependencies-base AS bundle-dependencies
COPY --from=bundle-dependencies-database /opt/preflyt/trivy-cache/db /opt/preflyt/trivy-cache/db
# END GENERATED SCANNER STAGES

FROM base AS scanner-bundles
COPY scripts/deploy/package-scanner.mjs /opt/preflyt/package-scanner.mjs
ARG TARGETARCH
RUN --mount=from=bundle-gitleaks,target=/scanner-root,ro node /opt/preflyt/package-scanner.mjs /scanner-root /bundles gitleaks "$TARGETARCH"
RUN --mount=from=bundle-semgrep,target=/scanner-root,ro node /opt/preflyt/package-scanner.mjs /scanner-root /bundles semgrep "$TARGETARCH"
RUN --mount=from=bundle-duplication,target=/scanner-root,ro node /opt/preflyt/package-scanner.mjs /scanner-root /bundles duplication "$TARGETARCH"
RUN --mount=from=bundle-trivy,target=/scanner-root,ro node /opt/preflyt/package-scanner.mjs /scanner-root /bundles trivy "$TARGETARCH"
RUN --mount=from=bundle-dependencies,target=/scanner-root,ro node /opt/preflyt/package-scanner.mjs /scanner-root /bundles dependencies "$TARGETARCH"

# Dedicated fixed Health scanners; no application credentials or engine socket in API/worker.
FROM runtime-base AS health-scanner
WORKDIR /app
COPY --from=build --chown=node:node /opt/scanner/ ./
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
COPY docs/deployment/native-runner /opt/preflyt/scanner-tools
COPY --from=scanner-bundles /bundles /opt/preflyt/scanner-bundles
ENV HEALTH_SCANNER_TOOLS_DIRECTORY=/opt/preflyt/scanner-tools HEALTH_SCANNER_BUNDLES_DIRECTORY=/opt/preflyt/scanner-bundles
ENV NODE_ENV=production
USER node
EXPOSE 3011
CMD ["node", "dist/health-scanner.js"]
