# QR Guest — Offline-First QR Event Management System

A multi-tenant, offline-first event management system with QR-based tickets, React PWA (admin + scanner), and a Node.js/Express backend with PostgreSQL.

## Architecture

```
frontend/   — React PWA (Vite + TypeScript + Dexie.js + Workbox)
backend/    — Node.js/Express API (TypeScript + Prisma + PostgreSQL)
```

## Features

- **Offline-first scanning** — works without internet using IndexedDB
- **Append-only scan logs** — no overwrites, no deletions
- **Delta sync** — efficient sync with versioned tickets and timestamp cursors
- **Duplicate handling** — prompts user when ticket already scanned
- **QR codes** — signed JWT tokens, verified offline
- **Role-based access** — owner, admin, scanner
- **Plan restrictions** — free (max 10 tickets) vs pro (unlimited)
- **Super admin back-office** — manage tenants and plans

## Quick Start

### With Docker Compose

```bash
cp .env.example .env   # edit secrets
docker compose up -d db db-bootstrap
cd backend
cp .env.example .env   # local backend env for npm scripts
npm install
npm run prisma:migrate
cd ..
docker compose up -d backend frontend
```

- Frontend: http://localhost:80
- Backend API: http://localhost:3000

### Local Setup (Recommended Order)

Use this order to avoid role/bootstrap timing issues:

```bash
# 1) Start postgres and role bootstrap
docker compose up -d db db-bootstrap

# 2) Run migrations from host (uses backend/.env)
cd backend
npm install
npm run prisma:migrate

# 3) Start backend and frontend
cd ..
docker compose up -d backend frontend
```

To fully reset local data and start clean:

```bash
docker compose down -v --remove-orphans
docker compose up -d db db-bootstrap
cd backend && npm run prisma:migrate
```

### Development

```bash
# Backend
cd backend
cp .env.example .env   # set DATABASE_URL etc.
npm install
npm run prisma:migrate
npm run dev

# Prisma Client is generated explicitly in Prisma v7.
# npm run dev and npm run build handle that automatically.

# Frontend
cd frontend
cp .env.example .env   # set VITE_API_URL
npm install
npm run dev
```

## API Endpoints

| Method | Path                         | Description                    |
| ------ | ---------------------------- | ------------------------------ |
| POST   | /auth/register               | Create tenant + owner account  |
| POST   | /auth/login                  | Login                          |
| POST   | /auth/resend-verification    | Resend verification email      |
| POST   | /auth/verify-email           | Verify email with token        |
| POST   | /auth/forgot-password        | Send password reset email      |
| POST   | /auth/reset-password         | Reset password with token      |
| POST   | /auth/accept-invitation      | Accept invited user account    |
| GET    | /events                      | List events                    |
| POST   | /events                      | Create event                   |
| POST   | /events/:id/tickets/bulk     | Bulk create tickets            |
| GET    | /events/:id/tickets          | List tickets with scan counts  |
| POST   | /tickets/:id/cancel          | Cancel a ticket                |
| GET    | /tickets/:id/qr              | Get QR JWT for a ticket        |
| POST   | /scan                        | Record a scan (append-only)    |
| POST   | /sync                        | Delta sync                     |
| GET    | /events/:id/stats            | Event statistics               |
| GET    | /admin/tenants               | List all tenants (super admin) |
| POST   | /admin/tenants/:id/upgrade   | Upgrade tenant to pro          |
| POST   | /admin/tenants/:id/downgrade | Downgrade tenant to free       |

## CI/CD

GitHub Actions automatically build and push Docker images to GHCR on pushes to `main`:

- Changes in `backend/` → builds `ghcr.io/<owner>/qr-guest/backend:latest`
- Changes in `frontend/` → builds `ghcr.io/<owner>/qr-guest/frontend:latest`

## Environment Variables

### Backend

| Variable            | Description                                    |
| ------------------- | ---------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string                   |
| `JWT_SECRET`        | Secret for auth JWTs                           |
| `QR_SECRET`         | Secret for QR ticket JWTs                      |
| `PORT`              | HTTP port (default: 3000)                      |
| `FRONTEND_URL`      | Public frontend URL used in verification links |
| `RESEND_API_KEY`    | Resend API key for auth emails                 |
| `RESEND_FROM_EMAIL` | Verified sender address used for auth emails   |
| `APP_DB_USER`       | Runtime DB role used by backend in Docker      |
| `APP_DB_PASSWORD`   | Runtime DB role password in Docker             |

## Coolify Production Setup

Production compose file: [docker-compose.coolify.yml](docker-compose.coolify.yml)

The production setup assumes an external PostgreSQL instance managed by Coolify or your provider.

### 1) Create an RLS-safe app role in production DB

Run this SQL once on your production database (replace password):

```sql
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'qrguest_app') THEN
		CREATE ROLE qrguest_app LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
	ELSE
		ALTER ROLE qrguest_app WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
	END IF;
END
$$;

ALTER ROLE qrguest_app NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE qrguest TO qrguest_app;
GRANT USAGE, CREATE ON SCHEMA public TO qrguest_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qrguest_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO qrguest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qrguest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO qrguest_app;
```

### 2) Configure Coolify environment variables

Set at least:

- `DATABASE_URL=postgresql://qrguest_app:<password>@<host>:<port>/qrguest`
- `JWT_SECRET=<strong-secret>`
- `QR_SECRET=<strong-secret>`
- `FRONTEND_URL=<public-frontend-url>`
- `RESEND_API_KEY=<resend-key>`
- `RESEND_FROM_EMAIL=<verified-email>`

### 3) Run migrations in production

Use the migrate service before (or during) release:

```bash
docker compose -f docker-compose.coolify.yml run --rm migrate
```

If Coolify deploys from compose services, run the `migrate` service as a one-shot job before deploying/restarting `backend`.

### 4) Start app services in production

```bash
docker compose -f docker-compose.coolify.yml up -d backend frontend
```

## Prisma Fresh Start (Pre-Production)

Use this flow when you want to completely reset the database and migration history during development.

```bash
cd backend

# 1) Make sure schema and migration files are up to date
npm run prisma:generate
npm run prisma:status

# 2) Destructive reset: drops all data and reapplies migrations
npm run prisma:reset

# 3) Confirm migration state
npm run prisma:status
```

Notes:

- This is destructive and should only be used before production.
- The current baseline is a single initial migration in [backend/prisma/migrations](backend/prisma/migrations).
- Tenant records are created at signup.
- Tenant isolation is implemented in shared tables via `tenant_id` + PostgreSQL RLS policies.

## Multi-Tenant Isolation

All tenant-owned data lives in shared tables in `public`, with a required `tenant_id` column and PostgreSQL Row Level Security policies on:

- `events`
- `tickets`
- `scans`
- `guests`
- `sync_state`
- `device_event_debug_data`

The API sets request-scoped DB context (`app.current_tenant_id` and `app.bypass_rls`) inside transactions.
Only super admins can request RLS bypass.

Important: the backend runtime must not connect as a PostgreSQL superuser (or any role with `BYPASSRLS`), otherwise Postgres ignores RLS and tenants can see each other data.

In Docker Compose, a `db-bootstrap` service ensures the app role exists and has `NOBYPASSRLS` on every startup, including when reusing an existing Postgres volume.

### Frontend

| Variable       | Description     |
| -------------- | --------------- |
| `VITE_API_URL` | Backend API URL |
