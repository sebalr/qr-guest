import prisma from "../prisma";
import { Prisma } from "../generated/prisma/client";
import { HttpError } from "../lib/errors";
export function quoteAmount(
  quantity: number,
  rate: string | number | Prisma.Decimal,
) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647)
    throw new HttpError(400, "Enter a positive whole-number quantity");
  const value = new Prisma.Decimal(rate);
  if (!value.isFinite() || value.lte(0))
    throw new HttpError(503, "Exchange rate unavailable");
  const amount = value
    .mul("0.10")
    .mul(quantity)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (amount.gt("9999999999999999.99"))
    throw new HttpError(400, "Amount exceeds transaction limits");
  return amount;
}
export async function getRate() {
  const cached = await prisma.exchangeRate.findUnique({
    where: { id: "official" },
  });
  const now = Date.now();
  if (cached && now - cached.fetchedAt.getTime() < 15 * 60_000) return cached;
  try {
    const response = await fetch("https://dolarapi.com/v1/dolares/oficial", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Rate service unavailable");
    const body = (await response.json()) as {
      venta: number;
      fechaActualizacion: string;
    };
    const sourceAt = new Date(body.fechaActualizacion);
    if (
      !Number.isFinite(body.venta) ||
      body.venta <= 0 ||
      !Number.isFinite(sourceAt.getTime()) ||
      sourceAt.getTime() > now + 300_000
    )
      throw new Error("Invalid rate");
    return await prisma.exchangeRate.upsert({
      where: { id: "official" },
      create: {
        id: "official",
        rate: body.venta,
        sourceAt,
        fetchedAt: new Date(now),
      },
      update: { rate: body.venta, sourceAt, fetchedAt: new Date(now) },
    });
  } catch {
    if (cached && now - cached.fetchedAt.getTime() <= 24 * 3600_000)
      return cached;
    throw new HttpError(503, "Exchange rate unavailable. Please retry later.");
  }
}
