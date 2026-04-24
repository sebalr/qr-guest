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
npx prisma migrate deploy
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

| Variable       | Description                  |
| -------------- | ---------------------------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`   | Secret for auth JWTs         |
| `QR_SECRET`    | Secret for QR ticket JWTs    |
| `PORT`         | HTTP port (default: 3000)    |

### Frontend

| Variable       | Description     |
| -------------- | --------------- |
| `VITE_API_URL` | Backend API URL |
