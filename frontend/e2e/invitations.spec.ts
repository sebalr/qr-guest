import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
const event = "22222222-2222-4222-8222-222222222222";
test("PDF template supports fixed-size dragging, keyboard positioning, save and reload", async ({
  page,
}) => {
  const token = [
    "header",
    Buffer.from(
      JSON.stringify({
        userId: "u",
        tenantId: "t",
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  await page.addInitScript(
    (token) => localStorage.setItem("token", token),
    token,
  );
  let asset: any = null;
  await page.route("http://localhost:3000/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    let data: any = [];
    if (path === `/events/${event}`)
      data = {
        id: event,
        name: "Invitation QA",
        tenantId: "t",
        includeImageInPdf: true,
      };
    if (path === "/billing/summary")
      data = {
        plan: "personal",
        freeRemaining: 50,
        paidRemaining: 0,
        available: 50,
        issued: 0,
      };
    if (path === `/assets/${event}/image`) data = null;
    if (path === `/assets/${event}/pdf`) {
      if (route.request().method() === "PUT") {
        asset = {
          id: "asset",
          x: 0,
          y: 0,
          ...route.request().postDataJSON(),
          width: 600,
          height: 800,
          mime: "application/pdf",
        };
      }
      data = asset;
    }
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({ data }),
    });
  });
  await page.goto(`/events/${event}/settings`);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const doc = await PDFDocument.create();
  const pdfPage = doc.addPage([600, 800]);
  pdfPage.drawText("You are invited", { x: 180, y: 740, size: 24 });
  await page
    .getByLabel("PDF template (one page, unencrypted, up to 10 MB)")
    .setInputFiles({
      name: "invitation.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await doc.save()),
    });
  const qr = page.getByRole("button", {
    name: /Drag the QR or use arrow keys/,
  });
  await expect(qr).toBeVisible();
  const before = (await qr.boundingBox())!;
  await qr.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page
    .getByRole("button", { name: "Save position", exact: true })
    .click();
  await expect.poll(() => asset.x).toBe(1);
  expect(asset.y).toBe(1);
  await qr.scrollIntoViewIfNeeded();
  const box = (await qr.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 70,
  );
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Save position", exact: true })
    .click();
  await expect.poll(() => asset.x).toBeGreaterThan(50);
  const saved = { x: asset.x, y: asset.y };
  await page.reload();
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(qr).toBeVisible();
  const after = (await qr.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
  expect(asset.x).toBe(saved.x);
  expect(asset.y).toBe(saved.y);
  // Exercise native touch events in a narrow viewport as well as mouse dragging.
  await page.setViewportSize({ width: 390, height: 844 });
  await qr.scrollIntoViewIfNeeded();
  const touchBox = (await qr.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  const touchX = touchBox.x + touchBox.width / 2,
    touchY = touchBox.y + touchBox.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchX, y: touchY }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchX + 20, y: touchY + 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page
    .getByRole("button", { name: "Save position", exact: true })
    .click();
  await expect.poll(() => asset.x).toBeGreaterThan(saved.x);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/invitation-editor.png",
    fullPage: true,
  });
});
test("Free visibly locks custom PDF upload", async ({ page }) => {
  const token = [
    "header",
    Buffer.from(
      JSON.stringify({
        userId: "u",
        tenantId: "t",
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  await page.addInitScript(
    (token) => localStorage.setItem("token", token),
    token,
  );
  await page.route("http://localhost:3000/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path === `/events/${event}`)
      data = { id: event, name: "Free event", tenantId: "t" };
    if (path === "/billing/summary") data = { plan: "free" };
    if (path.startsWith("/assets/")) data = null;
    await route.fulfill({
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data }),
    });
  });
  await page.goto(`/events/${event}/settings`);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(
    page.getByText("Custom PDF positioning is available on Personal.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("PDF template (one page, unencrypted, up to 10 MB)"),
  ).toBeDisabled();
});
