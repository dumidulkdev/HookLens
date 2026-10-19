FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --fetch-retries=1 --fetch-timeout=30000

FROM dependencies AS build
COPY apps/api apps/api
ENV DATABASE_URL=postgresql://hooklens:build-only@localhost:5432/hooklens?schema=public
RUN npm run db:generate --workspace @hooklens/api \
    && npm run build --workspace @hooklens/api

FROM build AS migrate
ENV NODE_ENV=production
CMD ["node", "apps/api/scripts/container-entrypoint.cjs", "migrate"]

FROM node:24-bookworm-slim AS production-dependencies
WORKDIR /app
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace @hooklens/api --workspace @hooklens/web --fetch-retries=1 --fetch-timeout=30000

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --chown=node:node apps/api/scripts/container-entrypoint.cjs ./apps/api/scripts/container-entrypoint.cjs
USER node
EXPOSE 3000
CMD ["node", "apps/api/scripts/container-entrypoint.cjs", "api"]
