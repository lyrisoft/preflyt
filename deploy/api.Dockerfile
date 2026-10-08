# syntax=docker/dockerfile:1
FROM node:24.4.1-bookworm-slim@sha256:36ae19f59c91f3303c7a648f07493fe14c4bd91320ac8d898416327bacf1bbfa AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.15.1
WORKDIR /workspace

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @preflyt/api... --frozen-lockfile --ignore-scripts
COPY apps/api apps/api
# Generation needs a syntactically valid URL, not a live database or build secret.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @preflyt/api build \
    && pnpm --filter @preflyt/api deploy --legacy --prod /opt/api

FROM base AS migration
COPY package.json pnpm-workspace.yaml ./
COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY apps/api/package.json apps/api/prisma.config.ts /workspace/apps/api/
COPY apps/api/prisma /workspace/apps/api/prisma
USER node
CMD ["pnpm", "--filter", "@preflyt/api", "prisma:migrate"]

FROM base AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /opt/api/node_modules ./node_modules
COPY --from=build --chown=node:node /opt/api/dist ./dist
COPY --from=build --chown=node:node /opt/api/package.json ./package.json
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
