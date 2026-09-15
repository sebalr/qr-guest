import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  event: vi.fn(),
  tickets: vi.fn(),
  scans: vi.fn(),
  admit: vi.fn(),
  state: vi.fn(),
}));
vi.mock("../src/prisma", () => ({
  withRls: vi.fn(async (_c: any, work: any) =>
    work({
      event: { findFirst: mocks.event },
      ticket: { findMany: mocks.tickets },
      scan: { findMany: mocks.scans },
      syncState: { upsert: mocks.state },
    }),
  ),
}));
vi.mock("../src/billing/credits", () => ({ lockTenant: vi.fn() }));
vi.mock("../src/lib/scanAdmission", () => ({ admitScan: mocks.admit }));
vi.mock("../src/lib/offlinePermit", () => ({
  createOfflinePermit: () => ({ token: "permit" }),
}));
vi.mock("../src/middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      userId: "u",
      tenantId: "a",
      role: "scanner",
      isSuperAdmin: false,
    };
    next();
  },
}));
import router from "../src/routes/sync";
function app() {
  const app = express();
  app.use(express.json());
  app.use("/sync", router);
  return app;
}
const body = {
  eventId: "event",
  deviceId: "device",
  lastTicketVersion: 0,
  lastScanCursor: new Date(0).toISOString(),
  localScans: [],
};
describe("sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.event.mockResolvedValue({ id: "event", endsAt: null });
    mocks.tickets.mockResolvedValue([]);
    mocks.scans.mockResolvedValue([]);
  });
  it("requires event", async () =>
    expect(
      (
        await request(app())
          .post("/sync")
          .send({ ...body, eventId: undefined })
      ).status,
    ).toBe(400));
  it("requires device", async () =>
    expect(
      (
        await request(app())
          .post("/sync")
          .send({ ...body, deviceId: undefined })
      ).status,
    ).toBe(400));
  it("rejects invalid cursor", async () =>
    expect(
      (
        await request(app())
          .post("/sync")
          .send({ ...body, lastScanCursor: "bad" })
      ).status,
    ).toBe(400));
  it("rejects unknown event", async () => {
    mocks.event.mockResolvedValue(null);
    expect((await request(app()).post("/sync").send(body)).status).toBe(404);
  });
  it("acknowledges outcomes individually and binds uploads to requested event/device", async () => {
    mocks.admit.mockResolvedValue({ id: "scan", outcome: "duplicate" });
    const response = await request(app())
      .post("/sync")
      .send({
        ...body,
        localScans: [
          {
            id: "scan",
            ticketId: "ticket",
            deviceId: "spoof",
            qrToken: "qr",
            confirmed: true,
            scannedAt: new Date().toISOString(),
          },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body.data.acknowledgments).toEqual([
      { id: "scan", outcome: "duplicate" },
    ]);
    expect(mocks.admit.mock.calls[0][3]).toMatchObject({
      eventId: "event",
      deviceId: "device",
      confirmed: true,
      qrToken: "qr",
    });
    expect(response.body.data.offlinePermit.token).toBe("permit");
  });
  it("caps upload batches", async () =>
    expect(
      (
        await request(app())
          .post("/sync")
          .send({
            ...body,
            localScans: Array.from({ length: 151 }, () => ({ id: "a" })),
          })
      ).status,
    ).toBe(400));
  it("uses tie-breaker cursors for paginated updates", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({
      id: String(i),
      ticketId: "ticket",
      eventId: "event",
      createdAt: new Date("2026-01-01"),
    }));
    mocks.scans.mockResolvedValue(rows);
    const response = await request(app()).post("/sync").send(body);
    expect(response.body.data.scanUpdates).toHaveLength(100);
    expect(response.body.data.hasMoreScanUpdates).toBe(true);
    expect(response.body.data.newScanIdCursor).toBe("99");
  });
});
