# syntax=docker/dockerfile:1.7
# One image runs the API (which also serves the dashboard SPA), the worker and migrations.
#   web role:    node dist/server.js
#   worker role: node dist/worker.js
#   migrations:  node dist/migrate.js (run by the entrypoint when RUN_MIGRATIONS=true)

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Vite inlines VITE_* at build time.
ARG VITE_AUTH_PROVIDER=clerk
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN pnpm turbo run build --filter=@starter/api --filter=@starter/web

# The API is bundled; only packages that cannot be bundled are installed at runtime.
RUN mkdir -p /out && cp -r apps/api/dist /out/dist && cp -r apps/web/dist /out/public \
  && node -e "const p=require('./apps/api/package.json');require('fs').writeFileSync('/out/package.json',JSON.stringify({type:'module',dependencies:{'@sentry/node':p.dependencies['@sentry/node']}}))"

FROM node:22-slim AS runtime
ENV NODE_ENV=production WEB_DIST=/app/public PORT=3000
WORKDIR /app
COPY --from=build /out/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /out/dist ./dist
COPY --from=build /out/public ./public
COPY docker/entrypoint.sh /entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--enable-source-maps", "dist/server.js"]
