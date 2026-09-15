import { Router } from "express";
import { PDFDocument } from "pdf-lib";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { withRls } from "../prisma";
import { resolveRlsContext } from "../lib/tenantContext";
import { HttpError } from "../lib/errors";
const router = Router();
const SIZE = (50 * 72) / 25.4;
router.use(authMiddleware, requireRole(["owner", "admin"]));
// The storage adapter keeps bytes out of public event responses.
export const assetStorage = {
  get: (
    tx: Parameters<Parameters<typeof withRls>[1]>[0],
    tenantId: string,
    eventId: string,
    kind: string,
  ) =>
    tx.eventAsset.findUnique({
      where: { tenantId_eventId_kind: { tenantId, eventId, kind } },
    }),
};
router.get("/:eventId/:kind", async (req, res) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  const asset = await withRls(context, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: context.tenantId },
    });
    if (
      req.params.kind === "pdf" &&
      !["personal", "custom"].includes(tenant.plan)
    )
      return null;
    return assetStorage.get(
      tx,
      context.tenantId,
      String(req.params.eventId),
      String(req.params.kind),
    );
  });
  res.json({
    data: asset
      ? { ...asset, bytes: Buffer.from(asset.bytes).toString("base64") }
      : null,
  });
});
router.put("/:eventId/:kind", async (req, res) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  const eventId = String(req.params.eventId),
    kind = String(req.params.kind);
  if (!["pdf", "image"].includes(kind))
    throw new HttpError(400, "Invalid asset type");
  const data = await withRls(context, async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: eventId, isDeleted: false },
    });
    if (!event) throw new HttpError(404, "Event not found");
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: context.tenantId },
    });
    if (kind === "pdf" && !["personal", "custom"].includes(tenant.plan))
      throw new HttpError(
        403,
        "Personal is required for custom PDF invitations",
      );
    if (
      typeof req.body.bytes !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(req.body.bytes)
    )
      throw new HttpError(400, "Invalid upload");
    const bytes = Buffer.from(req.body.bytes, "base64");
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new HttpError(400, "Maximum file size is 10 MB");
    let width = 0,
      height = 0,
      mime = "";
    if (kind === "pdf") {
      try {
        const doc = await PDFDocument.load(bytes);
        if (doc.isEncrypted || doc.getPageCount() !== 1) throw new Error();
        const page = doc.getPage(0),
          crop = page.getCropBox();
        const rotated = Math.abs(page.getRotation().angle % 180) === 90;
        width = rotated ? crop.height : crop.width;
        height = rotated ? crop.width : crop.height;
        if (width < SIZE || height < SIZE) throw new Error();
        mime = "application/pdf";
      } catch {
        throw new HttpError(
          400,
          "Upload an unencrypted, single-page PDF at least 5 × 5 cm",
        );
      }
    } else {
      // PDF-lib parses the image as well as verifying its file signature.
      try {
        const doc = await PDFDocument.create();
        const png = bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        width = img.width;
        height = img.height;
        mime = png ? "image/png" : "image/jpeg";
        if (width * height > 40_000_000) throw new Error();
      } catch {
        throw new HttpError(
          400,
          "Upload a valid PNG or JPEG image (maximum 40 megapixels)",
        );
      }
    }
    const x = req.body.x ?? 0,
      y = req.body.y ?? 0;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      (kind === "pdf" && (x + SIZE > width + 0.01 || y + SIZE > height + 0.01))
    )
      throw new HttpError(400, "QR must fit within the page");
    const values = { bytes, mime, width, height, x, y };
    const saved = await tx.eventAsset.upsert({
      where: {
        tenantId_eventId_kind: { tenantId: context.tenantId, eventId, kind },
      },
      create: { tenantId: context.tenantId, eventId, kind, ...values },
      update: values,
    });
    return { ...saved, bytes: Buffer.from(saved.bytes).toString("base64") };
  });
  res.json({ data });
});
router.delete("/:eventId/:kind", async (req, res) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  await withRls(context, (tx) =>
    tx.eventAsset.deleteMany({
      where: {
        eventId: String(req.params.eventId),
        kind: String(req.params.kind),
      },
    }),
  );
  res.sendStatus(204);
});
export default router;
