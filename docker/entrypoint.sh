#!/bin/sh
set -e
# Only the web role sets RUN_MIGRATIONS=true, so migrations run once per deploy,
# before the new container starts receiving traffic (Kamal waits for /readyz).
if [ "$RUN_MIGRATIONS" = "true" ]; then
  node dist/migrate.js
fi
exec "$@"
