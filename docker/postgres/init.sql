-- Runs once when the dev Postgres volume is created.
-- The app role is NOT a superuser: superusers bypass Row Level Security.
CREATE ROLE app LOGIN PASSWORD 'app';
CREATE DATABASE app OWNER app;
CREATE DATABASE app_test OWNER app;
