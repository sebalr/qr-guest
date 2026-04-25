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
docker compose up -d
```

- Frontend: http://localhost:80
- Backend API: http://localhost:3000

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
- Tenant records are created at signup and each tenant schema is initialized after registration.

## Tenant Schema Migrations

This project uses dynamic tenant schemas (`tenant_<tenantId>`). Prisma migrations update `public`, but tenant schemas are migrated with SQL files in [backend/prisma/tenant-migrations](backend/prisma/tenant-migrations).

```bash
cd backend

# Preview what would run per tenant schema
npm run tenant:migrate:dry

# Apply tenant migrations to all discovered tenant_* schemas
npm run tenant:migrate
```

Optional targeting:

```bash
cd backend
npm run tenant:migrate -- --schema tenant_<tenant-id>
```

When adding a column to tenant tables:

1. Add a new ordered SQL file in [backend/prisma/tenant-migrations](backend/prisma/tenant-migrations) (example: `0002_add_some_column.sql`).
2. Use idempotent SQL (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) where possible.
3. Run `npm run tenant:migrate` to apply it to existing tenants.
4. New signups will automatically get all tenant migration files during tenant initialization.

### Frontend

| Variable       | Description     |
| -------------- | --------------- |
| `VITE_API_URL` | Backend API URL |
