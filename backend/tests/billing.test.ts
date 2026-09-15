import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { quoteAmount } from "../src/billing/rates";
import { verifyMPSignature } from "../src/billing/providers";
import { createOfflinePermit } from "../src/lib/offlinePermit";
import { createPublicKey, verify } from "crypto";
describe("billing calculations and signatures", () => {
  it("rounds total in decimal ARS cents", () => {
    expect(quoteAmount(3, "1234.567890").toFixed(2)).toBe("370.37");
    expect(quoteAmount(1, "1000.05").toFixed(2)).toBe("100.01");
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid quantity %s", (q) =>
    expect(() => quoteAmount(q, 1000)).toThrow(),
  );
  it("verifies the signed notification manifest and rejects altered values", () => {
    const hash = createHmac("sha256", "secret")
      .update("id:123;request-id:req;ts:1234;")
      .digest("hex");
    expect(
      verifyMPSignature(`ts=1234,v1=${hash}`, "req", "123", "secret"),
    ).toBe(true);
    expect(
      verifyMPSignature(`ts=1234,v1=${hash}`, "req", "124", "secret"),
    ).toBe(false);
    expect(verifyMPSignature("ts=1234,v1=xx", "req", "123", "secret")).toBe(
      false,
    );
  });
  it("issues a verifiable bounded offline permit", () => {
    process.env.JWT_SECRET = "test";
    const permit = createOfflinePermit(
      "a",
      "u",
      "event",
      new Date(Date.now() + 30 * 86400000),
    );
    const [header, payload, signature] = permit.token.split(".");
    expect(
      verify(
        null,
        Buffer.from(`${header}.${payload}`),
        createPublicKey({ key: permit.publicKey, format: "jwk" }),
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(decoded.exp - decoded.iat).toBe(7 * 86400);
    expect(decoded.tenantId).toBe("a");
  });
});
