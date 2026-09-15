import billingRouter from "../src/routes/billing";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createHmac, randomUUID } from "crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import prisma, { withRls } from "../src/prisma";
import ticketRouter from "../src/routes/tickets";
import eventRouter from "../src/routes/events";
import scanRouter from "../src/routes/scans";
import syncRouter from "../src/routes/sync";
import assetRouter from "../src/routes/assets";
import { generateCompactQRToken } from "../src/lib/qrToken";
import { applyPayment } from "../src/billing/payments";
import { PDFDocument } from "pdf-lib";
const enabled = !!process.env.TEST_DATABASE_URL;
const app = express();
app.use(express.json({ limit: "15mb" }));
app.use("/billing", billingRouter);
app.use("/events", eventRouter);
app.use("/", ticketRouter);
app.use("/scan", scanRouter);
app.use("/sync", syncRouter);
app.use("/assets", assetRouter);
app.use((e: any, _q: any, r: any, _n: any) =>
  r.status(e.status ?? 500).json({ error: e.message }),
);
let tenantId: string,
  eventId: string,
  userId: string,
  auth: string,
  other: string;
const ctx = () => ({ tenantId, bypassRls: false });
function post(path: string, body: any, key = randomUUID()) {
  return request(app)
    .post(path)
    .set("Authorization", auth)
    .set("Idempotency-Key", key)
    .send(body);
}
describe.skipIf(!enabled)(
  "real PostgreSQL billing, admission and isolation",
  () => {
    beforeAll(async () => {
      if (!process.env.DATABASE_URL?.includes("tiqra_test"))
        throw new Error(
          "Integration tests require a disposable tiqra_test database",
        );
      process.env.JWT_SECRET = "integration-test-secret";
      process.env.QR_SECRET = "integration-qr-secret";
      process.env.MP_MERCHANT_ID = "merchant-test";
      const rows = await prisma.$queryRaw<
        { rolsuper: boolean; rolbypassrls: boolean }[]
      >`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
      expect(rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
      tenantId = (
        await prisma.tenant.create({
          data: { name: "integration " + randomUUID() },
        })
      ).id;
      other = (
        await prisma.tenant.create({ data: { name: "other " + randomUUID() } })
      ).id;
      userId = (
        await prisma.user.create({
          data: { email: `${randomUUID()}@test.invalid` },
        })
      ).id;
      auth =
        "Bearer " +
        jwt.sign(
          { userId, tenantId, role: "owner", isSuperAdmin: false },
          process.env.JWT_SECRET,
          { expiresIn: "1h" },
        );
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it("serializes lifetime Free event creation", async () => {
      const results = await Promise.all([
        post("/events", { name: "first" }),
        post("/events", { name: "second" }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
      eventId = results.find((r) => r.status === 201)!.body.data.id;
    });
    it("serializes credit spending and replays issuance without charging again", async () => {
      await withRls(ctx(), async (tx) => {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { freeRemaining: 1 },
        });
        await tx.event.update({
          where: { id: eventId },
          data: { paidCredits: 1 },
        });
      });
      const keys = [randomUUID(), randomUUID()];
      const results = await Promise.all(
        keys.map((key) =>
          post(`/events/${eventId}/tickets/bulk`, { names: ["A", "B"] }, key),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 402]);
      const winner = results.findIndex((r) => r.status === 201);
      const repeated = await post(
        `/events/${eventId}/tickets/bulk`,
        { names: ["A", "B"] },
        keys[winner],
      );
      expect(repeated.status).toBe(201);
      expect(repeated.body.data.map((t: any) => t.id)).toEqual(
        results[winner].body.data.map((t: any) => t.id),
      );
      const balances = await withRls(ctx(), async (tx) => ({
        tenant: await tx.tenant.findUnique({ where: { id: tenantId } }),
        event: await tx.event.findUnique({ where: { id: eventId } }),
        tickets: await tx.ticket.count({ where: { eventId } }),
      }));
      expect(balances.tenant!.freeRemaining).toBe(0);
      expect(balances.event!.paidCredits).toBe(0);
      expect(balances.tickets).toBe(2);
      expect(
        (
          await post(
            `/events/${eventId}/tickets/bulk`,
            { names: ["different"] },
            keys[winner],
          )
        ).status,
      ).toBe(409);
    });
    it("isolates balances, assets and attempts through RLS", async () => {
      const foreign = await withRls(
        { tenantId: other, bypassRls: false },
        async (tx) => ({
          events: await tx.event.findMany(),
          ledger: await tx.creditLedger.findMany(),
          receipts: await tx.issuanceRequest.findMany(),
        }),
      );
      expect(foreign.events).toEqual([]);
      expect(foreign.ledger).toEqual([]);
      expect(foreign.receipts).toEqual([]);
      await expect(
        withRls({ tenantId: other, bypassRls: false }, (tx) =>
          tx.creditLedger.create({
            data: { tenantId, eventId, kind: "spoof", reference: randomUUID() },
          }),
        ),
      ).rejects.toThrow();
    });
    it("admits only one first scan, persists duplicates, and permits one override", async () => {
      const ticket = await withRls(ctx(), (tx) =>
        tx.ticket.findFirstOrThrow({ where: { eventId } }),
      );
      const token = generateCompactQRToken(
        ticket.id,
        eventId,
        process.env.QR_SECRET!,
      );
      const base = {
        ticketId: ticket.id,
        eventId,
        deviceId: "device",
        scannedAt: new Date().toISOString(),
        qrToken: token,
      };
      const attempts = [randomUUID(), randomUUID()];
      const results = await Promise.all(
        attempts.map((id) => post("/scan", { ...base, id })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const winner = results.findIndex((r) => r.status === 201);
      expect(
        (await post("/scan", { ...base, id: attempts[winner] })).status,
      ).toBe(201);
      const overrides = await Promise.all([
        post("/scan", { ...base, id: randomUUID(), confirmed: true }),
        post("/scan", { ...base, id: randomUUID(), confirmed: true }),
      ]);
      expect(overrides.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(
        await withRls(ctx(), (tx) =>
          tx.scan.count({ where: { ticketId: ticket.id } }),
        ),
      ).toBe(2);
      expect(
        await withRls(ctx(), (tx) =>
          tx.scanAttempt.count({ where: { ticketId: ticket.id } }),
        ),
      ).toBe(4);
    });
    it("rejects tampered QR tokens and acknowledges offline conflicts", async () => {
      const ticket = await withRls(ctx(), (tx) =>
        tx.ticket.findFirstOrThrow({ where: { eventId } }),
      );
      const token = generateCompactQRToken(
        ticket.id,
        eventId,
        process.env.QR_SECRET!,
      );
      expect(
        (
          await post("/scan", {
            id: randomUUID(),
            ticketId: ticket.id,
            eventId,
            deviceId: "d",
            scannedAt: new Date().toISOString(),
            qrToken: token.slice(0, 40) + "AAAAAAAAAAAAAA",
          })
        ).body.data.outcome,
      ).toBe("invalid");
      const response = await post("/sync", {
        eventId,
        deviceId: "d",
        lastTicketVersion: 0,
        lastScanCursor: new Date(0).toISOString(),
        localScans: [
          {
            id: randomUUID(),
            ticketId: ticket.id,
            scannedAt: new Date().toISOString(),
            qrToken: token,
          },
        ],
      });
      expect(response.status).toBe(200);
      expect(response.body.data.acknowledgments[0].outcome).toBe("limit");
      expect(response.body.data.ticketUpdates[0].tokenFingerprint).toHaveLength(
        64,
      );
      expect(response.body.data.offlinePermit.token).toBeTruthy();
    });
    it("grants approved credits exactly once and reverses refunds monotonically", async () => {
      const order = await withRls(ctx(), (tx) =>
        tx.paymentOrder.create({
          data: {
            tenantId,
            eventId,
            quantity: 10,
            amount: 1000,
            rate: 1000,
            rateAt: new Date(),
            expiresAt: new Date(Date.now() + 900000),
          },
        }),
      );
      const payment = {
        id: randomUUID(),
        reference: order.id,
        merchant: "merchant-test",
        status: "approved",
        amount: "1000",
        refunded: "0",
        currency: "ARS",
      };
      await expect(
        applyPayment(tenantId, { ...payment, amount: "1" }),
      ).rejects.toThrow();
      await applyPayment(tenantId, {
        ...payment,
        id: randomUUID(),
        status: "rejected",
      });
      await Promise.all([
        applyPayment(tenantId, payment),
        applyPayment(tenantId, payment),
      ]);
      expect(
        (
          await withRls(ctx(), (tx) =>
            tx.event.findUniqueOrThrow({ where: { id: eventId } }),
          )
        ).paidCredits,
      ).toBe(10);
      await applyPayment(tenantId, { ...payment, refunded: "300" });
      await applyPayment(tenantId, payment); // stale approval cannot restore refunded credits
      expect(
        (
          await withRls(ctx(), (tx) =>
            tx.event.findUniqueOrThrow({ where: { id: eventId } }),
          )
        ).paidCredits,
      ).toBe(7);
      await applyPayment(tenantId, {
        ...payment,
        status: "refunded",
        refunded: "1000",
      });
      expect(
        (
          await withRls(ctx(), (tx) =>
            tx.event.findUniqueOrThrow({ where: { id: eventId } }),
          )
        ).paidCredits,
      ).toBe(0);
      expect(
        await withRls(ctx(), (tx) =>
          tx.creditLedger.count({ where: { kind: "purchase" } }),
        ),
      ).toBe(1);
    });
    it("keeps a full reversal terminal after delayed pending and approved notifications", async () => {
      const order = await withRls(ctx(), (tx) =>
        tx.paymentOrder.create({
          data: {
            tenantId,
            eventId,
            quantity: 1,
            amount: 100,
            rate: 1000,
            rateAt: new Date(),
            expiresAt: new Date(Date.now() + 900000),
          },
        }),
      );
      const payment = {
        id: randomUUID(),
        reference: order.id,
        merchant: "merchant-test",
        status: "approved",
        amount: "100",
        refunded: "0",
        currency: "ARS",
      };
      await applyPayment(tenantId, payment);
      await applyPayment(tenantId, {
        ...payment,
        status: "refunded",
        refunded: "100",
      });
      await applyPayment(tenantId, { ...payment, status: "pending" });
      const result = await applyPayment(tenantId, payment);
      expect(result.status).toBe("reversed");
      expect(result.credited).toBe(0);
    });
    it("saves one PDF per event and rejects multi-page templates", async () => {
      const doc = await PDFDocument.create();
      doc.addPage([600, 800]);
      const bytes = await doc.saveAsBase64();
      const response = await request(app)
        .put(`/assets/${eventId}/pdf`)
        .set("Authorization", auth)
        .send({ bytes, x: 10, y: 20 });
      expect(response.status).toBe(200);
      expect(response.body.data.x).toBe(10);
      const again = await request(app)
        .put(`/assets/${eventId}/pdf`)
        .set("Authorization", auth)
        .send({ bytes, x: 30, y: 40 });
      expect(again.body.data.id).toBe(response.body.data.id);
      doc.addPage();
      expect(
        (
          await request(app)
            .put(`/assets/${eventId}/pdf`)
            .set("Authorization", auth)
            .send({ bytes: await doc.saveAsBase64() })
        ).status,
      ).toBe(400);
      expect(
        await withRls({ tenantId: other, bypassRls: false }, (tx) =>
          tx.eventAsset.count(),
        ),
      ).toBe(0);
    });
    it("creates one checkout across retries and verifies webhooks before crediting", async () => {
      process.env.MP_ACCESS_TOKEN = "test-only";
      process.env.MP_WEBHOOK_SECRET = "webhook-test";
      process.env.MP_WEBHOOK_URL =
        "https://test.invalid/billing/webhooks/mercadopago";
      process.env.FRONTEND_URL = "https://test.invalid";
      let preferenceCalls = 0,
        reference = "";
      vi.stubGlobal("fetch", async (url: string) => {
        if (String(url).includes("dolarapi"))
          return {
            ok: true,
            json: async () => ({
              venta: 1000,
              fechaActualizacion: new Date().toISOString(),
            }),
          };
        if (String(url).includes("checkout/preferences/search"))
          return { ok: true, json: async () => ({ elements: [] }) };
        if (String(url).includes("checkout/preferences")) {
          preferenceCalls++;
          return {
            ok: true,
            json: async () => ({
              id: "pref-test",
              init_point: "https://www.mercadopago.com.ar/test-checkout",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "payment-test-" + reference,
            external_reference: reference,
            collector_id: "merchant-test",
            status: "approved",
            transaction_amount: 300,
            transaction_amount_refunded: 0,
            currency_id: "ARS",
          }),
        };
      });
      try {
        const quote = await post("/billing/quotes", { eventId, quantity: 3 });
        expect(quote.status).toBe(200);
        reference = quote.body.data.id;
        const checkouts = await Promise.all([
          post(`/billing/orders/${reference}/checkout`, {}),
          post(`/billing/orders/${reference}/checkout`, {}),
        ]);
        expect(checkouts.map((r) => r.status)).toEqual([200, 200]);
        expect(preferenceCalls).toBe(1);
        expect(checkouts[0].body.data.checkoutUrl).toBe(
          checkouts[1].body.data.checkoutUrl,
        );
        expect(
          (
            await request(app)
              .post("/billing/webhooks/mercadopago?data.id=123")
              .send({})
          ).status,
        ).toBe(401);
        const signature = createHmac("sha256", "webhook-test")
          .update("id:123;request-id:req;ts:1234;")
          .digest("hex");
        for (let n = 0; n < 2; n++)
          expect(
            (
              await request(app)
                .post("/billing/webhooks/mercadopago?data.id=123")
                .set("x-request-id", "req")
                .set("x-signature", `ts=1234,v1=${signature}`)
                .send({})
            ).status,
          ).toBe(200);
        expect(
          (
            await withRls(ctx(), (tx) =>
              tx.paymentOrder.findUniqueOrThrow({ where: { id: reference } }),
            )
          ).credited,
        ).toBe(3);
        expect(
          await withRls(ctx(), (tx) =>
            tx.creditLedger.count({
              where: { reference: `payment:${reference}:3` },
            }),
          ),
        ).toBe(1);
      } finally {
        vi.unstubAllGlobals();
        delete process.env.MP_ACCESS_TOKEN;
      }
    });
  },
);
