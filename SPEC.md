# Tiqra specification and implementation audit

Status: implementation complete; local automated verification passed on 2026-09-15. Provider sandbox verification remains pending configuration. A checked requirement means implemented, not independently certified for every device or payment method.

## Requirements

- [x] S01 Tenant/event-isolated offline storage and atomic paginated synchronization.
- [x] S02 Authenticated offline QR fingerprints; initial download and expiring signed access permit.
- [x] S03 Durable idempotent scan attempts, authoritative online decisions, two-entry maximum with explicit override, offline conflict reconciliation.
- [x] S04 Five-second foreground sync, reconnect/visibility triggers, bounded retries and persistent pending records.
- [x] S05 Support-only debug confirmation; pending-count deletion warning, sync-first action and exact `delete` confirmation.
- [x] B01 Free: one lifetime event and 50 lifetime complimentary tickets per tenant. Personal: first approved purchase, unlimited events, no subscription.
- [x] B02 Event-specific non-expiring paid credits; complimentary credits consumed first; atomic/idempotent issuance. Cancellation never restores credits.
- [x] B03 USD 0.10 per QR converted using DolarAPI official selling rate; 15-minute quotes/cache, 24-hour outage fallback.
- [x] B04 Provider interface, Mercado Pago checkout and authenticated payment lookup/webhooks; exactly-once credits, reconciliation and reversals.
- [x] B05 Visible balances, purchase/status flows, Custom contact requests and super-admin follow-up.
- [x] P01 Basic image upload/text invitations on all plans.
- [x] P02 Personal-only single-page PDF per event, persistent asset/placement, fixed 50 mm QR, pointer/keyboard positioning and four-module quiet zone.
- [x] P03 Original-page PDF export; invalid/encrypted/multi-page/oversized uploads rejected, English/Spanish UI.
- [x] V01 Unit, PostgreSQL concurrency/isolation, build and browser verification; deployment/configuration documentation.

## Baseline review

Offline storage and paginated sync existed, but cursors were global and pending scans crossed event boundaries. Online scan errors were ignored after success feedback. Offline tokens were parsed without authentication. Debug/delete dialogs existed but lacked required safeguards. Legacy plan defaults were 10/500 tickets. Billing, uploads, credit accounting and custom PDF storage were absent. Baseline: 41 backend and 9 frontend tests passed.

## Acceptance criteria

- Concurrent issuance never spends the same credit twice; retries return the original tickets. Free limits survive event deletion.
- A forged redirect/webhook cannot grant credits; duplicate approvals grant once; reversals cannot silently create spendable credit.
- Every scan is durable before admission feedback. A server rejection is visible. Offline attempts reconcile individually without losing evidence.
- No tenant/event can read or clear another scope's data. Cursor and data commits are atomic.
- Deletion requires fresh pending counts and exact `delete` only when pending data exists; cancellation has no side effect.
- A saved single-page PDF reloads with the same QR coordinates; exported codes decode and cannot be resized in the UI.

## Fundamental limitation

Two disconnected scanners can admit the same QR before reconnecting. Offline operation detects known local repeats; reconciliation records cross-device conflicts. It cannot guarantee global uniqueness without connectivity.

## Verification and external prerequisites

| Check | Result / evidence |
| --- | --- |
| Backend suite | **62 passed**, including nine real PostgreSQL integration cases (`backend/tests/postgres.integration.test.ts`) |
| Frontend unit suite | **11 passed** (`scannerLogic.test.ts`, `customPdf.test.ts`) |
| Chromium/PDF suite | **12 passed** (`frontend/e2e/`): actual camera decoding, offline reload/persistence, permit expiry, debug/delete decisions, online rejection, PDF upload/locking, mouse/keyboard/touch positioning, save/reload, and QR decoding after print rendering at 0/90/180/270 degrees |
| Backend/frontend production builds | Passed; PDF libraries split into cacheable bundles and worker included in PWA precache |
| Database migration | Applied from scratch to a disposable PostgreSQL 16 database with a non-superuser/non-BYPASSRLS runtime role |
| Schema consistency | Prisma comparison between migrated database and schema returned an empty migration |
| Provider integration tests | Controlled provider responses test checkout retries, forged/valid signed notifications, duplicate approval, failed-payment retry, partial/full refunds and delayed notifications after reversal |
| Exchange-rate tests | Decimal rounding, validation, fresh cache, refresh, outage fallback and stale-rate rejection |

### Implemented evidence

| Requirements | Implementation |
| --- | --- |
| S01, S04 | `frontend/src/db.ts`, `frontend/src/pages/ScannerPage.tsx`, `backend/src/routes/sync.ts`; databases additionally isolate users, local changes commit atomically, and clear-generation markers reject late sync responses |
| S02 | `backend/src/lib/offlinePermit.ts`, `backend/src/lib/qrToken.ts`, `frontend/src/lib/offlineAccess.ts`; compact token fingerprints and Ed25519-signed event/user/tenant permits |
| S03 | `backend/src/lib/scanAdmission.ts`; serialized, append-only outcomes, stable retry IDs, monotonic scan timestamps and event-wide ticket versions |
| S05 | Scanner dialogs and English/Spanish strings; diagnostic payload allowlist excludes tokens, raw ticket data and secrets |
| B01, B02 | `backend/src/billing/credits.ts`, ticket/event routes, RLS-backed ledger and idempotency receipts; debits roll back with failed issuance |
| B03, B04 | `backend/src/billing/`, `backend/src/routes/billing.ts`; persisted rate/quote/order data, country/provider interface, webhook verification, checkout recovery and reconciliation |
| B05 | `BillingPanel.tsx`, `ContactRequests.tsx`, event/landing/admin integration |
| P01–P03 | `backend/src/routes/assets.ts`, `InvitationEditor.tsx`, `customPdf.ts`, `generateQrPdf.ts`; PostgreSQL assets, fixed QR geometry and crop/rotation-aware PDF overlay |
| V01 | Test suites above, `.env.example`, Compose configuration and README deployment instructions |

### Remaining external verification / setup

- [ ] **V02 Mercado Pago provider sandbox checkout:** blocked by absent `MP_ACCESS_TOKEN`, `MP_MERCHANT_ID`, `MP_WEBHOOK_SECRET`, and `MP_WEBHOOK_URL`. Configure test seller/buyer credentials and a reachable HTTPS webhook, then validate an actual sandbox transaction. No real payment was made.
- [ ] Apply the migration and runtime grants to the intended application database before running the new backend. Only the disposable test database was migrated during implementation; existing application data was not reset.

Physical venue/device testing, including iOS camera behavior, has not been performed. Browser tests use Chromium and controlled API fixtures; PostgreSQL tests separately exercise the real backend and RLS. The new offline store intentionally leaves legacy unscoped development IndexedDB data untouched; events must be downloaded again. Offline browser support requirements and configuration are documented in README.

### Reference documentation

- [Mercado Pago preference APIs](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/overview): checkout creation and recovery by external reference.
- [Mercado Pago webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks): signed notification verification and payment lookup.
- [DolarAPI official rate](https://dolarapi.com/docs/argentina/operations/get-dolar-oficial): selling rate and source timestamp.
- [DENSO QR margins](https://www.qrcode.com/en/howto/code.html): four-module quiet zone.

## 6. Public landing and event-cost simulator

- **L01 — Implemented:** responsive English/Spanish landing presents Free, Personal and Custom, image/text invitations, saved custom PDFs, and offline scanning. It states the lifetime 50-QR allowance and first-approved-purchase Personal activation; obsolete monthly pricing and offline duplicate-prevention promises are removed.
- **L02 — Implemented:** calculator accepts 1–100,000 guests and 0–50 remaining complimentary QRs. It itemizes free and extra tickets at USD 0.10, rounds the total ARS estimate to cents, and labels the DolarAPI official selling rate with its source timestamp. This simulator estimates new ticket needs before any existing paid event balance; it never creates a quote, order or payment.
- **L03 — Implemented:** public `GET /billing/pricing` exposes only rate/pricing information through the shared rate cache. An unavailable rate preserves the USD simulation and offers retry. Billing balances remain authenticated. Actual purchases continue to use server-created, expiring quotes.
- **Evidence:** `LandingPage.tsx`, `LandingPage.css`, `PricingCalculator.tsx`, `pricingEstimate.ts`, and `backend/src/routes/billing.ts`. Four calculator unit tests cover allowances, decimal rounding, invalid inputs and unavailable rates. Two Chromium tests cover desktop/mobile, Spanish, live input changes and rate outages. Desktop and mobile screenshots were visually reviewed. Three API tests cover public data, rate errors and authenticated billing boundaries.
- **Acceptance:** no subscription claims; editable lifetime allowance; no fabricated peso rate; no purchase from simulation; no horizontal overflow at 390 px; readable pricing cards and explicit offline limitations.

## 7. Deployment preparation

- Node 22 Alpine Docker builds verified for backend and frontend; Docker contexts exclude local credentials, dependencies and build artifacts.
- Both source-build and GHCR-image Compose definitions validate. They wait for successful migrations and backend health and do not bind the proxy's host ports.
- The release migration was verified against populated disposable PostgreSQL using a non-superuser owner: existing credits/events/versions backfill correctly under forced RLS, and runtime grants work.
- Existing Coolify resources use separate GHCR images at `api-tiqra.nardario.com` and `tiqra.nardario.com`. Production rollout and payment credentials must be verified separately; local Docker success is not production deployment evidence.
