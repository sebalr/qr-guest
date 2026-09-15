/** Display-only estimate. Purchases always use a server-issued, expiring quote. */
export function estimateEventCost(
  guests: number,
  freeRemaining: number,
  rate?: string,
) {
  if (
    !Number.isSafeInteger(guests) ||
    guests < 1 ||
    guests > 100000 ||
    !Number.isInteger(freeRemaining) ||
    freeRemaining < 0 ||
    freeRemaining > 50
  )
    return null;
  const complimentary = Math.min(guests, freeRemaining);
  const paid = guests - complimentary;
  const usdCents = paid * 130;
  let arsCents: number | null = null;
  if (rate && /^\d+(\.\d{1,6})?$/.test(rate)) {
    const [whole, fraction = ""] = rate.split(".");
    const micros = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
    if (micros > 0n) {
      const cents = (BigInt(usdCents) * micros + 500000n) / 1000000n;
      if (cents <= BigInt(Number.MAX_SAFE_INTEGER)) arsCents = Number(cents);
    }
  }
  return { complimentary, paid, usdCents, arsCents };
}
