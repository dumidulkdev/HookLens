FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --fetch-retries=1 --fetch-timeout=30000
COPY apps/web apps/web
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build --workspace @hooklens/web

FROM nginx:alpine AS runtime
COPY apps/web/docker/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/docker/entrypoint.sh /usr/local/bin/hooklens-entrypoint
RUN chmod +x /usr/local/bin/hooklens-entrypoint
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/hooklens-entrypoint"]
