import { test, expect, Page } from "@playwright/test";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import QRCode from "qrcode";
const tenant = "11111111-1111-4111-8111-111111111111",
  event = "22222222-2222-4222-8222-222222222222",
  ticket = "33333333-3333-4333-8333-333333333333",
  user = "44444444-4444-4444-8444-444444444444";
const qr = Buffer.concat([
  Buffer.from(ticket.replaceAll("-", ""), "hex"),
  Buffer.from(event.replaceAll("-", ""), "hex"),
  Buffer.alloc(8, 42),
]).toString("base64url");
const fp = createHash("sha256").update(qr).digest("hex");
function permit(exp = Math.floor(Date.now() / 1000) + 3600) {
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.alloc(32, 4),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const data = [
    { alg: "EdDSA", typ: "JWT" },
    { iss: "tiqra-offline", aud: event, sub: user, tenantId: tenant, exp },
  ]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".");
  return {
    token: `${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`,
    publicKey: createPublicKey(key).export({ format: "jwk" }),
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}
async function setup(page: Page) {
  const token = [
    "header",
    Buffer.from(
      JSON.stringify({
        userId: user,
        tenantId: tenant,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  await page.addInitScript(
    ({ token }) => {
      localStorage.setItem("token", token);
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 640, 480);
      (window as any).setCameraQr = async (url: string) => {
        const image = new Image();
        await new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.src = url;
        });
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 640, 480);
        ctx.drawImage(image, 120, 40, 400, 400);
      };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => canvas.captureStream(15),
      });
    },
    { token },
  );
  const state = {
    offline: false,
    debug: 0,
    outcome: "accepted",
    uploaded: [] as any[],
  };
  await page.route("http://localhost:3000/**", async (route) => {
    if (state.offline) return route.abort("internetdisconnected");
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    let body: any = { data: {} };
    if (path === "/sync") {
      const input = req.postDataJSON();
      state.uploaded.push(...input.localScans);
      body = {
        data: {
          ticketUpdates: [
            {
              id: ticket,
              eventId: event,
              name: "Guest",
              status: "active",
              version: 1,
              tokenFingerprint: fp,
            },
          ],
          scanUpdates: [],
          acknowledgments: input.localScans.map((s: any) => ({
            id: s.id,
            outcome: state.outcome,
          })),
          newTicketVersion: 1,
          newTicketIdCursor: ticket,
          newScanCursor: new Date().toISOString(),
          newScanIdCursor: "",
          offlinePermit: permit(),
          hasMoreTicketUpdates: false,
          hasMoreScanUpdates: false,
        },
      };
    }
    if (path === "/scan") {
      const input = req.postDataJSON();
      body = { data: { id: input.id, outcome: state.outcome } };
      return route.fulfill({
        status: state.outcome === "duplicate" ? 409 : 201,
        headers,
        body: JSON.stringify(body),
      });
    }
    if (path === "/scan/device-event-debug") state.debug++;
    return route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
  });
  await page.goto(`/events/${event}/scan`);
  await expect(
    page.getByText("Ready for offline scanning", { exact: false }),
  ).toBeVisible();
  return state;
}
async function scan(page: Page) {
  const image = await QRCode.toDataURL(qr, { width: 400, margin: 4 });
  await page.evaluate((url) => (window as any).setCameraQr(url), image);
}
async function pending(page: Page) {
  return page.evaluate(
    async ({ tenant, event, user }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(`tiqra:${tenant}:${event}:${user}`);
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
      });
      return new Promise<number>((resolve, reject) => {
        const req = db.transaction("scans").objectStore("scans").getAll();
        req.onsuccess = () => {
          resolve(req.result.filter((s) => !s.synced).length);
          db.close();
        };
        req.onerror = reject;
      });
    },
    { tenant, event, user },
  );
}
test("debug requires support confirmation and cancel sends nothing", async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "Send debug information" }).click();
  await expect(
    page.getByText("Send it only if support requested it.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.debug).toBe(0);
  await page.getByRole("button", { name: "Send debug information" }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => state.debug).toBe(1);
});
test("offline camera scan persists and deletion requires exact typed confirmation", async ({
  page,
}) => {
  const state = await setup(page);
  state.offline = true;
  await scan(page);
  await expect(
    page.getByText("Accepted offline; awaiting sync."),
  ).toBeVisible();
  expect(await pending(page)).toBe(1);
  await page.getByRole("button", { name: "Clear local event data" }).click();
  await expect(
    page.getByText("unsynced scan(s) will be permanently lost.", {
      exact: false,
    }),
  ).toBeVisible();
  const clear = page.getByRole("button", {
    name: "Clear Local Data",
    exact: true,
  });
  await expect(clear).toBeDisabled();
  await page
    .getByLabel("Type delete to confirm loss of unsynced data.")
    .fill("DELETE");
  await expect(clear).toBeDisabled();
  await page
    .getByLabel("Type delete to confirm loss of unsynced data.")
    .fill("delete");
  await expect(clear).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await pending(page)).toBe(1);
  state.offline = false;
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect.poll(() => pending(page)).toBe(0);
  expect(state.uploaded).toHaveLength(1);
});
test("server duplicate rejection never displays admission success", async ({
  page,
}) => {
  const state = await setup(page);
  state.outcome = "duplicate";
  await scan(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("Allow a second entry?", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Ticket scanned successfully!")).toHaveCount(0);
});
test("cached scanner reloads offline and retains pending attempts", async ({
  page,
  context,
}) => {
  const state = await setup(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  state.offline = true;
  await scan(page);
  await expect.poll(() => pending(page)).toBe(1);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "QR Scanner" })).toBeVisible();
  await expect.poll(() => pending(page)).toBe(1);
  await expect(
    page.getByText("Ready for offline scanning", { exact: false }),
  ).toBeVisible();
});

test("confirmed deletion removes pending scans and scoped tickets", async ({
  page,
}) => {
  const state = await setup(page);
  state.offline = true;
  await scan(page);
  await expect.poll(() => pending(page)).toBe(1);
  await page.getByRole("button", { name: "Clear local event data" }).click();
  await page
    .getByLabel("Type delete to confirm loss of unsynced data.")
    .fill("delete");
  await page
    .getByRole("button", { name: "Clear Local Data", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await pending(page)).toBe(0);
  await expect(
    page.getByText(
      "Download this event online before scanning, or renew its offline access.",
    ),
  ).toBeVisible();
});

test('expired offline permit blocks admission while preserving pending attempts',async({page})=>{
  const state=await setup(page);state.offline=true;await scan(page);await expect.poll(()=>pending(page)).toBe(1);
  await page.clock.install({time:new Date()});await page.clock.setFixedTime(new Date(Date.now()+2*3600000));
  await page.reload();await expect(page.getByText('Download this event online before scanning, or renew its offline access.')).toBeVisible();expect(await pending(page)).toBe(1);
});
