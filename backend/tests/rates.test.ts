import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("../src/prisma", () => ({ default: { exchangeRate: db } }));
import { getRate } from "../src/billing/rates";
describe("exchange-rate cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());
  it("uses a fresh cache without a network call", async () => {
    const cache = { rate: 1000, fetchedAt: new Date(), sourceAt: new Date() };
    db.findUnique.mockResolvedValue(cache);
    expect(await getRate()).toBe(cache);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refreshes the official selling rate after 15 minutes", async () => {
    db.findUnique.mockResolvedValue({
      rate: 900,
      fetchedAt: new Date(Date.now() - 16 * 60000),
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        venta: 1000,
        fechaActualizacion: new Date().toISOString(),
      }),
    } as Response);
    db.upsert.mockImplementation(async ({ create }) => create);
    expect((await getRate()).rate).toBe(1000);
  });
  it("falls back for a transient outage within 24 hours", async () => {
    const cache = { rate: 1000, fetchedAt: new Date(Date.now() - 3600000) };
    db.findUnique.mockResolvedValue(cache);
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(await getRate()).toBe(cache);
  });
  it("blocks quotes when the cached rate is too old", async () => {
    db.findUnique.mockResolvedValue({
      rate: 1000,
      fetchedAt: new Date(Date.now() - 25 * 3600000),
    });
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await expect(getRate()).rejects.toThrow("Exchange rate unavailable");
  });
  it("does not cache malformed upstream data", async () => {
    db.findUnique.mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ venta: -1, fechaActualizacion: "invalid" }),
    } as Response);
    await expect(getRate()).rejects.toThrow();
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
