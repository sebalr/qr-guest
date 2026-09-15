import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateCustomPdf, qrPlacement, QR_POINTS } from "./customPdf";
describe("fixed PDF invitation placement", () => {
  it("maps all page rotations to PDF coordinates", () => {
    expect(qrPlacement(0, 600, 800, 10, 20, 100)).toMatchObject({
      x: 10,
      y: 680,
    });
    expect(qrPlacement(90, 600, 800, 10, 20, 100)).toMatchObject({
      x: 120,
      y: 10,
    });
    expect(qrPlacement(180, 600, 800, 10, 20, 100)).toMatchObject({
      x: 590,
      y: 120,
    });
    expect(qrPlacement(270, 600, 800, 10, 20, 100)).toMatchObject({
      x: 480,
      y: 790,
    });
  });
  it("preserves page count/size while producing one invitation per ticket", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    const bytes = await doc.saveAsBase64();
    const output = await generateCustomPdf(
      [{ qrToken: "one" }, { qrToken: "two" }],
      {
        id: "a",
        bytes,
        mime: "application/pdf",
        width: 600,
        height: 800,
        x: 10,
        y: 20,
      },
    );
    const loaded = await PDFDocument.load(await output.arrayBuffer());
    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getPage(0).getSize()).toEqual({ width: 600, height: 800 });
    expect((QR_POINTS * 25.4) / 72).toBe(50);
  });
});
