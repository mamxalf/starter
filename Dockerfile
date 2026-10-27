# syntax=docker/dockerfile:1.7
# One image runs the API (which also serves the dashboard SPA), the worker and migrations.
#   web role:    node dist/server.js
#   worker role: node dist/worker.js
#   migrations:  node dist/migrate.js (run by the entrypoint when RUN_MIGRATIONS=true)

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# Dependency layers come first so source edits do not reinstall: `pnpm fetch` depends only on the
# lockfile, and `install --offline` on the workspace manifests. Add a COPY line when you add a package.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY package.json ./
COPY apps/api/package.json apps/api/
COPY apps/site/package.json apps/site/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/i18n/package.json packages/i18n/
COPY packages/platform/package.json packages/platform/
COPY packages/ui/package.json packages/ui/
# The root `prepare` script installs git hooks and the image has no git, so lifecycle scripts are
# skipped; esbuild is the one dependency that needs its install script (it bundles the API).
RUN pnpm install --frozen-lockfile --offline --ignore-scripts && pnpm rebuild esbuild

COPY . .

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
