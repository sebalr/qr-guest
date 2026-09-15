import { test, expect } from "@playwright/test";
import { PDFDocument, degrees } from "pdf-lib";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { PNG } from "pngjs";
import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  QRCodeReader,
} from "@zxing/library";
import { generateCustomPdf } from "../src/lib/customPdf";
for (const angle of [0, 90, 180, 270])
  test(`exported ${angle}-degree PDF decodes after print-resolution rendering`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "tiqra-pdf-"));
    try {
      const token =
        "MzMzMzMzQzODM zMzMzMzMyIiIiIiIkIigiIiIiIiIiIqKioqKioqKg".replaceAll(
          " ",
          "",
        );
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);
      page.setRotation(degrees(angle));
      page.drawText("Invitation", { x: 20, y: 760, size: 20 });
      const asset = {
        id: "a",
        bytes: await doc.saveAsBase64(),
        mime: "application/pdf",
        width: angle % 180 ? 800 : 600,
        height: angle % 180 ? 600 : 800,
        x: 200,
        y: 150,
      };
      const output = await generateCustomPdf([{ qrToken: token }], asset);
      writeFileSync(
        join(dir, "out.pdf"),
        Buffer.from(await output.arrayBuffer()),
      );
      execFileSync("pdftoppm", [
        "-scale-to",
        "1800",
        "-singlefile",
        "-png",
        join(dir, "out.pdf"),
        join(dir, "page"),
      ]);
      const png = PNG.sync.read(readFileSync(join(dir, "page.png")));
      const gray = new Uint8ClampedArray(png.width * png.height);
      for (let i = 0; i < gray.length; i++)
        gray[i] =
          (png.data[i * 4] + 2 * png.data[i * 4 + 1] + png.data[i * 4 + 2]) / 4;
      const result = new QRCodeReader().decode(
        new BinaryBitmap(
          new HybridBinarizer(
            new RGBLuminanceSource(gray, png.width, png.height),
          ),
        ),
      );
      expect(result.getText()).toBe(token);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
