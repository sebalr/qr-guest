# Tiqra — Offline-First QR Event Management System

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
- **QR codes** — compact HMAC-authenticated tokens, checked offline against server-provided SHA-256 fingerprints
- **Role-based access** — owner, admin, scanner
- **Plans** — Free: one lifetime event and 50 complimentary QRs per workspace. Personal: unlimited events after the first QR purchase, USD 1.30 per extra QR, no subscription.
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

### Local Rename Transition (from qrguest defaults)

If you already have a local database created with the old `qrguest` naming, set these values in your root `.env` before running compose:

- `APP_DB_NAME=qrguest`
- `APP_DB_USER=qrguest_app`
- `APP_DB_PASSWORD=<your-existing-password>`

This keeps your existing local data working while the project defaults now use Tiqra names.

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
| POST   | /admin/tenants/:id/upgrade   | Upgrade tenant to Personal          |
| POST   | /admin/tenants/:id/downgrade | Downgrade tenant to free       |

## CI/CD

GitHub Actions automatically build and push Docker images to GHCR on pushes to `main`:

- Changes in `backend/` → builds `ghcr.io/<owner>/tiqra/backend:latest`
- Changes in `frontend/` → builds `ghcr.io/<owner>/tiqra/frontend:latest`

## Environment Variables

### Backend

| Variable              | Description                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string                                                      |
| `SHADOW_DATABASE_URL` | Shadow DB connection for `prisma migrate dev`                                     |
| `JWT_SECRET`          | Secret for auth JWTs                                                              |
| `QR_SECRET`           | Secret for QR ticket JWTs                                                         |
| `PORT`                | HTTP port (default: 3000)                                                         |
| `FRONTEND_URL`        | Public frontend URL used in verification links                                    |
| `CORS_ORIGINS`        | Comma-separated allowed browser origins for API CORS (defaults to `FRONTEND_URL`) |
| `RESEND_API_KEY`      | Resend API key for auth emails                                                    |
| `RESEND_FROM_EMAIL`   | Verified sender address used for auth emails                                      |
| `APP_DB_NAME`         | Local Docker database name (default: `tiqra`)                                     |
| `APP_DB_USER`         | Runtime DB role used by backend in Docker                                         |
| `APP_DB_PASSWORD`     | Runtime DB role password in Docker                                                |

For the existing live installation and remaining setup, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Coolify Production Setup

Production compose file: [docker-compose.coolify.yml](docker-compose.coolify.yml)

The production setup assumes an external PostgreSQL instance managed by Coolify or your provider.

Security goal in production:

- backend runtime uses a low-privilege role (`tiqra_app`)
- migrations run with a separate elevated role (`tiqra_migrator`) used only by the one-shot migrate job
- no shadow DB credentials are stored in production runtime services

### 1) Create production DB roles

Create a low-privilege runtime role and a separate migrator role.

Run this SQL once on your production database (replace passwords):

```sql
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tiqra_app') THEN
		CREATE ROLE tiqra_app LOGIN PASSWORD 'REPLACE_WITH_STRONG_RUNTIME_PASSWORD';
	ELSE
		ALTER ROLE tiqra_app WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_RUNTIME_PASSWORD';
	END IF;

	IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tiqra_migrator') THEN
		CREATE ROLE tiqra_migrator LOGIN PASSWORD 'REPLACE_WITH_STRONG_MIGRATOR_PASSWORD';
	ELSE
		ALTER ROLE tiqra_migrator WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_MIGRATOR_PASSWORD';
	END IF;
END
$$;

ALTER ROLE tiqra_app NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
ALTER ROLE tiqra_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;

GRANT CONNECT ON DATABASE tiqra TO tiqra_app;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE tiqra TO tiqra_migrator;

GRANT USAGE ON SCHEMA public TO tiqra_app;
GRANT USAGE, CREATE ON SCHEMA public TO tiqra_migrator;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tiqra_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO tiqra_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tiqra_migrator;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO tiqra_migrator;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tiqra_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
	GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO tiqra_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tiqra_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
	GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO tiqra_migrator;
```

### 2) Configure Coolify environment variables

Set at least:

- `DATABASE_URL=postgresql://tiqra_app:<runtime-password>@<host>:<port>/tiqra`
- `MIGRATION_DATABASE_URL=postgresql://tiqra_migrator:<migrator-password>@<host>:<port>/tiqra`
- `JWT_SECRET=<strong-secret>`
- `QR_SECRET=<strong-secret>`
- `FRONTEND_URL=<public-frontend-url>`
- `CORS_ORIGINS=<public-frontend-url[,additional-allowed-origin]>`
- `RESEND_API_KEY=<resend-key>`
- `RESEND_FROM_EMAIL=<verified-email>`

Production note:

- Do not set `SHADOW_DATABASE_URL` in production. It is only for local `prisma migrate dev` workflows.
- Do not run `npm run prisma:migrate` against production if it would use your local dev database flow. Production should use `prisma migrate deploy` with the migrator role.
- Keep runtime and migration credentials separate to reduce blast radius.

If you need to run migrations manually against the production database, use the migrator role and the deploy command:

```bash
DATABASE_URL="$MIGRATION_DATABASE_URL" npx prisma migrate deploy
```

In Coolify, this is already handled by the one-shot `migrate` service in [docker-compose.coolify.yml](docker-compose.coolify.yml).

### 3) Run migrations in production

Use the migrate service before (or during) release:

```bash
docker compose -f docker-compose.coolify.yml run --rm migrate
```

If Coolify deploys from compose services, run the `migrate` service as a one-shot job before deploying/restarting `backend`.

The migrate service should use `MIGRATION_DATABASE_URL` while backend uses `DATABASE_URL`.

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

| Variable         | Description                                  |
| ---------------- | -------------------------------------------- |
| `VITE_API_URL`   | Backend API URL                              |
| `VITE_TIQRA_URL` | Tiqra website URL shown in generated QR PDFs |

`VITE_TIQRA_URL` is a frontend build-time variable. Set it in the environment where the frontend is built or served:

- Local development: add it to [frontend/.env.example](frontend/.env.example) or your local `frontend/.env`.
- Coolify: set it on the frontend service environment.
- GitHub Actions: only set it there if your workflow builds the frontend image or static bundle in CI.

Do not place it in backend env files.


## Pricing, payments, and invitation templates

See [SPEC.md](SPEC.md) for numbered requirements, evidence, and verification limits.

- The first 50 tickets are complimentary **once per tenant/workspace**, shared across its events. Personal unlocks after the first approved purchase. Paid credits belong to the selected event, do not expire, and do not transfer. Cancellation/deletion never restores credits. Re-exporting an existing ticket costs nothing.
- Ticket creation requires an `Idempotency-Key` header. Reuse the same key and payload after a network failure; a different payload with that key returns 409. Both single and bulk creation atomically debit credits. Event capacity remains a separate limit.
- The event page shows complimentary, paid, available, and issued counts. It includes a quantity-based purchase flow and a Custom-plan contact form. Super admins see contact requests for the selected tenant.
- PDF settings support PNG/JPEG uploads and one Personal-only, single-page PDF template per event (maximum 10 MB). The QR occupies a fixed 50 × 50 mm white square, including a four-module quiet zone. Drag it or use arrow keys; Shift moves ten PDF points. Saved coordinates use points from the **displayed crop box's top-left**, accounting for page rotation. Uploaded assets are stored in PostgreSQL; include them in backups.

### Mercado Pago configuration

Set these **backend-only** values in local environment or Compose/Coolify:

| Variable | Purpose |
| --- | --- |
| `MP_ACCESS_TOKEN` | Merchant access token for Checkout Pro and payment lookup |
| `MP_MERCHANT_ID` | Expected collector/merchant ID; payments must match it |
| `MP_WEBHOOK_SECRET` | Secret used to validate Mercado Pago `x-signature` notifications |
| `MP_WEBHOOK_URL` | Public HTTPS URL ending in `/billing/webhooks/mercadopago` |
| `MP_SANDBOX` | `true` for test checkout URLs, `false` for production |
| `PAYMENT_RECONCILE_MS` | Reconciliation interval in milliseconds; default 60000 |
| `FRONTEND_URL` | Public frontend origin for checkout return URLs |

Configure payment webhooks in the Mercado Pago application and use test seller/buyer credentials for sandbox validation. Redirects show order status but never grant credits. The server verifies the notification, fetches the payment, and matches reference, amount, currency, and merchant. Duplicate approvals cannot grant twice. Refunds/chargebacks reverse credits; a resulting deficit blocks new issuance until replenished. Already issued tickets remain usable.

DolarAPI's `/v1/dolares/oficial` **selling** rate is used; this is not a BNA-specific quote. The cache refreshes after 15 minutes and can fall back to the last successful fetch for up to 24 hours during an outage. Each quote records its rate/source timestamp and expires after 15 minutes. Accepted checkouts retain their agreed ARS amount even if payment settles later. Missing credentials or an unusable exchange rate stop checkout; no payment is simulated in production code.

Provider integration is isolated in `backend/src/billing/providers.ts`. Implement the provider contract (checkout, signed notifications, payment lookup/search and merchant identity), register it for the desired country, and add its webhook route. Credits and order reconciliation remain provider-independent. Argentina/Mercado Pago is the initial supported combination.

### Offline scanner behavior

Download an event while online before using it offline. Its signed permit lasts through event end plus 24 hours, capped at seven days; an undated event gets 24 hours. Expired login sessions can open only the scanner, which checks that permit before admission. Sign in as the original user to upload pending attempts after authentication expires. Local databases are isolated by tenant, event **and user**, so changing accounts never uploads someone else's attempts.

Online admission waits up to two seconds for an authoritative response. Connection failures use the downloaded roster and record an offline admission. Automatic sync runs every five seconds in the foreground, on reconnect and when returning to the app, with failure backoff up to 60 seconds. Sync network requests do not hold the local scanning lock. A local-clear generation marker discards responses that arrive after deletion.

Two disconnected devices can admit the same QR. Synchronization records conflicts; it cannot undo physical entry. Known duplicates require an explicit second-entry override, and the server serializes admissions to enforce at most two accepted entries. Recent conflicts appear in the scanner.

Use a modern browser with camera access, Web Locks, IndexedDB, and Ed25519 Web Crypto support over HTTPS (localhost is allowed for development). The PWA caches the app and PDF worker; authenticated API responses are never stored in a shared service-worker cache. New worker versions wait for a subsequent app session rather than forcing a scanner reload.

### Migration and verification

Run `npm run prisma:migrate` with the migration role, then regenerate/build. The migration preserves existing tickets, counts them against the complimentary allowance, maps Pro to Personal, and removes legacy 10/500 capacity defaults. It introduces RLS policies and append-only ledger/scan triggers. No existing database is reset automatically. Older unscoped development IndexedDB data is left untouched; download events into the new scoped store.

New tables need the same runtime grants as existing tenant tables. When using a separate migration role, configure its default table/sequence privileges for the runtime role, or grant them after migration.

```bash
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix backend
npm run build --prefix frontend
npm run test:e2e --prefix frontend
```

Browser tests require Chrome (`CHROME_PATH` overrides `/usr/bin/google-chrome`), and print-rendering tests require `pdftoppm`. They run against the production preview with controlled API fixtures; they do not make real payments.

For the PostgreSQL suite, migrate a disposable database named `tiqra_test`, grant a non-superuser/non-BYPASSRLS runtime role table access, and set **both** `DATABASE_URL` and `TEST_DATABASE_URL` to it before running backend tests. The suite rejects other database names and verifies the runtime role cannot bypass RLS. It creates isolated test tenants; discard the test database afterward.

### Public pricing simulator

The bilingual landing page includes Free, Personal and Custom plans and an event-cost calculator. Visitors can simulate 1–100,000 guests, adjust their remaining lifetime complimentary allowance (0–50), and see USD and estimated ARS costs. `GET /billing/pricing` publicly exposes the shared DolarAPI official selling rate and timestamp. When unavailable, USD estimates remain usable. The simulator estimates new ticket needs without subtracting existing paid event credits; it does not create an order or grant credits. Checkout still requires an authenticated owner/admin and a server-issued quote.

### Release using GitHub-built images in Coolify

1. Set GitHub Actions repository variable `VITE_API_URL` to the public HTTPS API origin and, when enabled, `VITE_RECAPTCHA_SITE_KEY`. These are frontend **build-time** values.
2. Push the release to `main`. Wait for both `Deploy Backend` and `Deploy Frontend` workflows to publish their images.
3. Use `docker-compose.coolify.images.yml` for a registry-based stack and set `IMAGE_TAG` to the matching `sha-…` tag published by both workflows. The source-building alternative is `docker-compose.coolify.yml`; it requires the Vite variables as build arguments in Coolify.
4. Configure backend environment variables and both database connections. The migration role must own existing application tables to alter them. Back up the database before releasing. Do not reset it.
5. Connect the stack to the database's internal network. Assign HTTPS domains to frontend port 80 and backend port 3000 in Coolify. These Compose files expose container ports without binding host ports used by Coolify's proxy.
6. Deploy only after the images exist. The one-shot migration service must succeed before the backend starts; the frontend waits for backend health. On later releases, verify migration logs for the selected image tag before considering deployment complete.
7. Verify `/health`, `/billing/pricing`, login, invitation export, scanner sync, and a Mercado Pago test payment before switching to live payment credentials.

For tables created by `tiqra_migrator`, set future runtime grants as that role (or as a database administrator):

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE tiqra_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tiqra_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tiqra_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO tiqra_app;
```

These creator-specific privileges supplement the grants for existing tables above. Changing frontend runtime variables does not rewrite an already-built Vite bundle; rebuild and release a new image when its API origin changes.
