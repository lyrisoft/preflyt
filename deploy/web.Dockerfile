# syntax=docker/dockerfile:1
FROM node:24.4.1-bookworm-slim@sha256:36ae19f59c91f3303c7a648f07493fe14c4bd91320ac8d898416327bacf1bbfa AS build
RUN npm install --global pnpm@10.26.2
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @preflyt/web... --frozen-lockfile --ignore-scripts
COPY apps/web apps/web
COPY deploy/nginx.conf deploy/nginx.conf
ARG PUBLIC_SITE_URL=""
ARG PUBLIC_SITE_INDEXABLE=false
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL PUBLIC_SITE_INDEXABLE=$PUBLIC_SITE_INDEXABLE
RUN VITE_API_BASE_URL=/api pnpm --filter @preflyt/web build

FROM nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236 AS runtime
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
