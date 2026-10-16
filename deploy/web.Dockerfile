# syntax=docker/dockerfile:1
FROM node:24.4.1-bookworm-slim@sha256:36ae19f59c91f3303c7a648f07493fe14c4bd91320ac8d898416327bacf1bbfa AS build
RUN npm install --global pnpm@10.26.2
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @preflyt/web... --frozen-lockfile --ignore-scripts
COPY apps/web apps/web
COPY release.json release.json
COPY deploy/nginx.conf deploy/nginx.conf
COPY deploy/nginx.website.conf deploy/nginx.website.conf
COPY scripts/deploy/license-bundle.mjs /opt/preflyt/license-bundle.mjs
ARG PUBLIC_SITE_URL=""
ARG PUBLIC_SITE_INDEXABLE=false
ARG VITE_WEBSITE_MODE=false
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL PUBLIC_SITE_INDEXABLE=$PUBLIC_SITE_INDEXABLE VITE_WEBSITE_MODE=$VITE_WEBSITE_MODE
RUN VITE_API_BASE_URL=/api pnpm --filter @preflyt/web build \
    && node /opt/preflyt/license-bundle.mjs /workspace/apps/web /workspace/apps/web/dist 'Web dependency graph (includes build tools)' --include-dev \
    && if [ "$VITE_WEBSITE_MODE" = true ]; then cp deploy/nginx.website.conf /opt/preflyt/nginx.conf; else cp deploy/nginx.conf /opt/preflyt/nginx.conf; fi

FROM nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236 AS runtime
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /usr/share/licenses/preflyt/
COPY apps/web/LICENSE /usr/share/licenses/preflyt/third-party/shadcn-admin-LICENSE
COPY apps/web/THIRD_PARTY_NOTICES.md /usr/share/licenses/preflyt/third-party/web-NOTICES.md
COPY apps/api/src/github-events/sarif-schema.LICENSE.md /usr/share/licenses/preflyt/third-party/sarif-schema-LICENSE.md
COPY apps/web/src/features/auth/assets/azure-pipelines.LICENSE.txt /usr/share/licenses/preflyt/third-party/azure-pipelines-LICENSE.txt
COPY --from=build /opt/preflyt/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY --from=build /workspace/apps/web/dist/third-party-licenses.txt /workspace/apps/web/dist/third-party-inventory.json /usr/share/licenses/preflyt/
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
