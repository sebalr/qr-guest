import { PDFDocument, degrees } from "pdf-lib";
import QRCode from "qrcode";
import type { EventAsset } from "../api";
export const QR_POINTS = (50 * 72) / 25.4;
export function qrPlacement(
  rotation: number,
  width: number,
  height: number,
  x: number,
  y: number,
  size = QR_POINTS,
) {
  const angle = ((rotation % 360) + 360) % 360;
  if (angle === 90) return { x: y + size, y: x, rotate: degrees(90) };
  if (angle === 180) return { x: width - x, y: y + size, rotate: degrees(180) };
  if (angle === 270)
    return { x: width - y - size, y: height - x, rotate: degrees(270) };
  return { x, y: height - y - size, rotate: degrees(0) };
}
export async function generateCustomPdf(
  guests: { qrToken: string }[],
  asset: EventAsset,
) {
  const template = await PDFDocument.load(asset.bytes);
  const doc = await PDFDocument.create();
  for (const guest of guests) {
    const [page] = await doc.copyPages(template, [0]);
    doc.addPage(page);
    const qr = await doc.embedPng(
      await QRCode.toDataURL(guest.qrToken, {
        width: 800,
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      }),
    );
    const crop = page.getCropBox();
    const placement = qrPlacement(
      page.getRotation().angle,
      crop.width,
      crop.height,
      asset.x,
      asset.y,
    );
    page.drawImage(qr, {
      ...placement,
      x: placement.x + crop.x,
      y: placement.y + crop.y,
      width: QR_POINTS,
      height: QR_POINTS,
    });
  }
  return new Blob([new Uint8Array(await doc.save())], {
    type: "application/pdf",
  });
}
