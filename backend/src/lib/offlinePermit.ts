import { createHash, createPrivateKey, createPublicKey, sign } from "crypto";
function key() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");
  const seed = createHash("sha256")
    .update(`tiqra-offline-permit:${process.env.JWT_SECRET}`)
    .digest();
  return createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
}
export function createOfflinePermit(
  tenantId: string,
  userId: string,
  eventId: string,
  endsAt: Date | null,
) {
  const now = Date.now();
  const expires = endsAt
    ? Math.min(endsAt.getTime() + 86400000, now + 7 * 86400000)
    : now + 86400000;
  const privateKey = key();
  const header = Buffer.from(
    JSON.stringify({ alg: "EdDSA", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "tiqra-offline",
      aud: eventId,
      sub: userId,
      tenantId,
      iat: Math.floor(now / 1000),
      exp: Math.floor(expires / 1000),
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  return {
    token: `${data}.${sign(null, Buffer.from(data), privateKey).toString("base64url")}`,
    publicKey: createPublicKey(privateKey).export({ format: "jwk" }),
    expiresAt: new Date(expires).toISOString(),
  };
}
