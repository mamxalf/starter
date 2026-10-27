#!/bin/sh
# Runs once when the production Postgres volume is created.
# The app role is NOT a superuser: superusers bypass Row Level Security.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE app LOGIN PASSWORD '${APP_DB_PASSWORD}';
CREATE DATABASE app OWNER app;
SQL
