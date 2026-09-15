import { importJWK, jwtVerify } from "jose";
import type { OfflinePermit } from "../api";
export async function verifyOfflinePermit(
  permit: OfflinePermit | null,
  tenantId: string,
  userId: string,
  eventId: string,
) {
  if (!permit) return false;
  try {
    const key = await importJWK(permit.publicKey, "EdDSA");
    const { payload } = await jwtVerify(permit.token, key, {
      algorithms: ["EdDSA"],
      issuer: "tiqra-offline",
      audience: eventId,
      subject: userId,
    });
    return payload.tenantId === tenantId;
  } catch {
    return false;
  }
}
export async function fingerprint(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function acceptsAdmission(outcome?: string) {
  return !outcome || ["accepted", "override", "pending"].includes(outcome);
}
