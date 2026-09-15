import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../src/lib/errors";
const mocks = vi.hoisted(() => ({ admit: vi.fn() }));
vi.mock("../src/prisma", () => ({
  withRls: vi.fn(async (_c: any, work: any) => work({})),
}));
vi.mock("../src/lib/scanAdmission", () => ({ admitScan: mocks.admit }));
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
import router from "../src/routes/scans";
function app() {
  const app = express();
  app.use(express.json());
  app.use("/scan", router);
  app.use((e: any, _q: any, r: any, _n: any) =>
    r.status(e.status ?? 500).json({ error: e.message }),
  );
  return app;
}
describe("scan route outcomes", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ["accepted", 201],
    ["override", 201],
    ["duplicate", 409],
    ["cancelled", 422],
    ["invalid", 422],
    ["limit", 422],
  ])("returns the persisted %s outcome", async (outcome, status) => {
    mocks.admit.mockResolvedValue({ id: "attempt", outcome });
    const response = await request(app())
      .post("/scan")
      .send({ id: "attempt", eventId: "event" });
    expect(response.status).toBe(status);
    expect(response.body.data).toEqual({ id: "attempt", outcome });
    expect(mocks.admit.mock.calls[0].slice(1, 3)).toEqual(["a", "u"]);
  });
  it("rejects malformed attempts", async () => {
    mocks.admit.mockRejectedValue(new HttpError(400, "Invalid scan attempt"));
    expect((await request(app()).post("/scan").send({})).status).toBe(400);
  });
});
