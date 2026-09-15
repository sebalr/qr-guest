import { describe, it, expect } from "vitest";
import { estimateEventCost } from "./pricingEstimate";
describe("event pricing estimates", () => {
  it("spends the remaining lifetime allowance before paid tickets", () => {
    expect(estimateEventCost(50, 50, "1000")).toEqual({
      complimentary: 50,
      paid: 0,
      usdCents: 0,
      arsCents: 0,
    });
    expect(estimateEventCost(200, 50, "1000")).toEqual({
      complimentary: 50,
      paid: 150,
      usdCents: 19500,
      arsCents: 19500000,
    });
    expect(estimateEventCost(51, 10)?.usdCents).toBe(5330);
    expect(estimateEventCost(50, 0)?.usdCents).toBe(6500);
  });
  it("prices a new 100-guest event near ARS 100,000 at the reference rate", () => {
    expect(estimateEventCost(100, 50, "1530")).toEqual({
      complimentary: 50,
      paid: 50,
      usdCents: 6500,
      arsCents: 9945000,
    });
    expect(estimateEventCost(100, 0, "1530")?.arsCents).toBe(19890000);
  });
  it("rounds the total peso amount to cents", () => {
    expect(estimateEventCost(3, 0, "1234.56789")?.arsCents).toBe(481481);
    expect(estimateEventCost(1, 0, "1000.05")?.arsCents).toBe(130007);
  });
  it("retains USD estimates without a usable exchange rate", () => {
    for (const rate of [undefined, "broken", "0", "-100"])
      expect(estimateEventCost(100, 50, rate)).toEqual({
        complimentary: 50,
        paid: 50,
        usdCents: 6500,
        arsCents: null,
      });
  });
  it("rejects invalid guest counts and allowance", () => {
    for (const [guests, free] of [
      [0, 50],
      [1.5, 50],
      [100001, 50],
      [NaN, 50],
      [50, -1],
      [50, 51],
      [50, 1.5],
    ])
      expect(estimateEventCost(guests, free)).toBeNull();
  });
});
