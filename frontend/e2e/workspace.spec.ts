import { test, expect, Page } from "@playwright/test";

const eventId = "22222222-2222-4222-8222-222222222222";
const organizations = [
  {
    id: "org-a",
    name: "Studio Verde",
    plan: "personal",
    _count: { users: 3, events: 2 },
  },
  {
    id: "org-b",
    name: "Casa del Sol",
    plan: "free",
    _count: { users: 1, events: 1 },
  },
];
const event = {
  id: eventId,
  name: "Summer sessions",
  description: "An evening of music, good company, and new connections.",
  tenantId: "org-a",
  startsAt: "2026-12-21T22:00:00Z",
  endsAt: "2026-12-22T03:00:00Z",
  maxGuests: 150,
  paidCredits: 100,
  tenant: organizations[0],
  _count: { tickets: 3, scans: 1 },
};

async function setup(
  page: Page,
  { role = "owner", superAdmin = true, empty = false } = {},
) {
  const token = [
    "header",
    Buffer.from(
      JSON.stringify({
        userId: "u",
        tenantId: "org-a",
        role,
        isSuperAdmin: superAdmin,
        email: "alex@studioverde.test",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  await page.addInitScript(
    (token) => localStorage.setItem("token", token),
    token,
  );
  const requests: {
    path: string;
    tenant: string | null;
    method: string;
    body: any;
  }[] = [];
  const state = {
    failEvents: false,
    failCreate: false,
    failAdmin: false,
    empty,
  };
  await page.route("http://localhost:3000/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    requests.push({
      path,
      tenant: url.searchParams.get("tenantId"),
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
    });
    let data: any = [];
    if (
      (path === "/events" && state.failEvents) ||
      (path === "/events" && req.method() === "POST" && state.failCreate) ||
      (path.startsWith("/admin/") && state.failAdmin)
    )
      return route.fulfill({
        status: 500,
        headers,
        json: { error: "Please try again." },
      });
    if (path === "/events")
      data =
        req.method() === "POST"
          ? { ...event, ...req.postDataJSON() }
          : state.empty
            ? []
            : [
                event,
                {
                  ...event,
                  id: "event-two",
                  name: "The creative gathering",
                  description:
                    "A day to share ideas and make something wonderful.",
                  startsAt: null,
                  endsAt: null,
                },
                ...(url.searchParams.get("includeArchived") === "true"
                  ? [
                      {
                        ...event,
                        id: "old",
                        name: "Last season",
                        archivedAt: "2026-08-01",
                      },
                    ]
                  : []),
              ];
    if (path === "/admin/tenants") data = state.empty ? [] : organizations;
    if (path === "/admin/users")
      data = state.empty
        ? []
        : [
            {
              id: "u1",
              email:
                url.searchParams.get("tenantId") === "org-b"
                  ? "team@casadelsol.test"
                  : "alex@studioverde.test",
              role: "owner",
              accountStatus: "active",
              isSuperAdmin: false,
              tenant:
                organizations[
                  url.searchParams.get("tenantId") === "org-b" ? 1 : 0
                ],
            },
          ];
    if (path === "/admin/events") data = state.empty ? [] : [event];
    if (path === `/events/${eventId}`) data = event;
    if (path === `/events/${eventId}/tickets`)
      data = state.empty
        ? []
        : ["Amelia Reyes", "Mateo García", "Sofia Chen"].map((name, i) => ({
            id: `ticket-${i}`,
            eventId,
            name,
            status: "active",
            version: 1,
            scanCount: i === 0 ? 1 : 0,
          }));
    if (path === `/events/${eventId}/stats`)
      data = {
        totalGuests: state.empty ? 0 : 150,
        scannedGuests: 92,
        notScannedGuests: 58,
        duplicates: 2,
        totalScans: state.empty ? 0 : 94,
        scansByInterval: state.empty
          ? []
          : [18, 42, 25, 9].map((count, i) => ({
              bucket: `2026-12-21T${18 + i}:00:00Z`,
              count,
            })),
        firstScansByInterval: [],
        userScanRanking: [],
        duplicateTickets: [],
        topGuests: [],
      };
    if (path === "/billing/summary")
      data = {
        plan: "personal",
        freeRemaining: 47,
        paidRemaining: 100,
        available: 147,
        issued: 3,
      };
    if (path === "/billing/methods")
      data = [{ id: "mercadopago", name: "Mercado Pago" }];
    if (path.startsWith("/assets/")) data = null;
    if (path.endsWith("/qr")) data = { qrToken: "test-token" };
    await route.fulfill({
      headers,
      json: { data, pagination: { hasMore: false } },
    });
  });
  return { requests, state };
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right > innerWidth + 1 &&
          getComputedStyle(el).position !== "fixed",
      )
      .slice(0, 12)
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        text: el.textContent?.slice(0, 80),
        right: el.getBoundingClientRect().right,
      })),
  }));
  expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(
    overflow.width + 1,
  );
}

test("event search, archive filtering, create failure and recovery", async ({
  page,
}) => {
  const { state, requests } = await setup(page);
  await page.goto("/events");
  await page.getByRole("textbox", { name: "Search events" }).fill("creative");
  await expect(
    page.getByRole("heading", { name: "The creative gathering" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Summer sessions" }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search events" }).fill("");
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Last season" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Summer sessions" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "New Event" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event name").fill("Autumn gathering");
  state.failCreate = true;
  await dialog.getByRole("button", { name: "Create Event" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Please try again");
  await expect(dialog.getByLabel("Event name")).toHaveValue("Autumn gathering");
  state.failCreate = false;
  await dialog.getByRole("button", { name: "Create Event" }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
  expect(
    requests.filter((r) => r.path === "/events" && r.method === "POST").at(-1)
      ?.body.name,
  ).toBe("Autumn gathering");
});

test("event load failure is distinct from empty and retry recovers", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.failEvents = true;
  await page.goto("/events");
  await expect(
    page.getByRole("heading", { name: "We couldn’t load this content" }),
  ).toBeVisible();
  state.failEvents = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Summer sessions" }),
  ).toBeVisible();
});

test("admin sections and tenant context survive navigation and analytics requests", async ({
  page,
}) => {
  const { requests } = await setup(page);
  await page.goto("/super-admin");
  const nav = page.getByRole("navigation", { name: "Administration sections" });
  await nav.getByRole("link", { name: "Users", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "People & permissions" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Organization", exact: true })
    .click();
  await page.getByRole("option", { name: "Casa del Sol" }).click();
  await expect(
    page.getByRole("cell", { name: "team@casadelsol.test" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/tenantId=org-b/);
  await nav.getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page).toHaveURL(/dashboard\?tenantId=org-b/);
  await expect
    .poll(() =>
      requests.some((r) => r.path.endsWith("/stats") && r.tenant === "org-b"),
    )
    .toBeTruthy();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/settings\?tenantId=org-b/);
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Organization", exact: true }),
  ).toContainText("Casa del Sol");
});

test("ordinary admins only see user administration; scanners cannot create events", async ({
  page,
}) => {
  await setup(page, { role: "admin", superAdmin: false });
  await page.goto("/super-admin?section=organizations");
  const nav = page.getByRole("navigation", { name: "Administration sections" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(
    page.getByRole("combobox", { name: "Organization", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await expect(page.getByRole("button", { name: "New Event" })).toBeVisible();
  const token = [
    "h",
    Buffer.from(
      JSON.stringify({
        userId: "scanner",
        tenantId: "org-a",
        role: "scanner",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "s",
  ].join(".");
  await page.evaluate((token) => localStorage.setItem("token", token), token);
  // A fresh document reads the changed session; don't re-run setup's init script.
  await page.addInitScript(
    (token) => localStorage.setItem("token", token),
    token,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Summer sessions" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New Event" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Administration", exact: true }),
  ).toHaveCount(0);
});

test("mobile navigation uses a focus-managed drawer and landing keeps its own theme", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/events");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  await noOverflow(page);
  await page.goto("/");
  await expect(page.locator("body")).not.toHaveClass(/workspace-theme/);
});

for (const language of ["en", "es"])
  for (const width of [390, 820, 1440]) {
    test(`workspace visual QA ${language} ${width}px`, async ({ page }) => {
      const { state } = await setup(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/events");
      if (language === "es")
        await page.getByRole("button", { name: "Cambiar a español" }).click();
      await expect(
        page.getByRole("heading", { name: "Summer sessions" }),
      ).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/workspace-${language}-${width}-events.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: language === "es" ? "Nuevo evento" : "New Event",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const bounds = await page.getByRole("dialog").boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/workspace-${language}-${width}-create.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("heading", { name: "Summer sessions" })
        .getByRole("link")
        .click();
      await expect(
        page.getByText("Amelia Reyes", { exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/workspace-${language}-${width}-guests.png`,
        fullPage: true,
      });
      await page.locator("details.ws-details > summary").click();
      await expect(page.locator(".ws-billing")).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/workspace-${language}-${width}-billing.png`,
        fullPage: true,
      });
      await page
        .getByRole("link", {
          name: language === "es" ? "Configuración" : "Settings",
          exact: true,
        })
        .click();
      await expect(page.locator("main")).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/workspace-${language}-${width}-settings.png`,
        fullPage: true,
      });
      await page
        .getByRole("link", {
          name: language === "es" ? "Estadísticas" : "Analytics",
          exact: true,
        })
        .click();
      await expect(page.locator("main")).toBeVisible();
      await noOverflow(page);
      await expect(page.locator(".recharts-surface").first()).toBeVisible();
      await expect(
        page.locator(".recharts-bar-rectangle").first(),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/workspace-${language}-${width}-analytics.png`,
        fullPage: true,
      });
      if (width < 801)
        await page
          .getByRole("button", {
            name: language === "es" ? "Abrir navegación" : "Open navigation",
          })
          .click();
      await page
        .getByRole("link", {
          name: language === "es" ? "Administración" : "Administration",
          exact: true,
        })
        .filter({ visible: true })
        .click();
      await expect(
        page.getByRole("combobox", {
          name: language === "es" ? "Organización" : "Organization",
          exact: true,
        }),
      ).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/workspace-${language}-${width}-admin.png`,
        fullPage: true,
      });
      const sections = page.getByRole("navigation", {
        name:
          language === "es"
            ? "Secciones de administración"
            : "Administration sections",
      });
      for (const [key, label] of [
        ["users", language === "es" ? "Usuarios" : "Users"],
        ["events", language === "es" ? "Eventos" : "Events"],
        [
          "organizations",
          language === "es" ? "Organizaciones" : "Organizations",
        ],
        ["requests", language === "es" ? "Solicitudes" : "Requests"],
      ]) {
        await sections.getByRole("link", { name: label, exact: true }).click();
        await expect(
          sections.getByRole("link", { name: label, exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await noOverflow(page);
        await page.screenshot({
          path: `test-results/workspace-${language}-${width}-admin-${key}.png`,
          fullPage: true,
        });
      }
      state.empty = true;
      await page.goto("/events");
      // Full navigation restores the browser's default language.
      if (language === "es")
        await page.getByRole("button", { name: "Cambiar a español" }).click();
      await expect(page.locator(".ws-state")).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/workspace-${language}-${width}-empty.png`,
        fullPage: true,
      });
    });
  }

test("administration request failure can be retried", async ({ page }) => {
  const { state } = await setup(page);
  state.failAdmin = true;
  await page.goto("/super-admin");
  await expect(page.getByRole("alert")).toBeVisible();
  state.failAdmin = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("combobox", { name: "Organization", exact: true }),
  ).toContainText("Studio Verde");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const admin of [false, true])
  test(`archive confirmation and failure recovery (${admin ? "admin" : "events"})`, async ({
    page,
  }) => {
    const { requests } = await setup(page);
    await page.goto(admin ? "/super-admin?section=events" : "/events");
    await page
      .getByRole("button", { name: "Actions for Summer sessions" })
      .click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /Archive/i });
    await expect(dialog).toBeVisible();
    expect(requests.some((r) => r.path.endsWith("/archive"))).toBeFalsy();
    await page.route("**/admin/events/*/archive", (route) =>
      route.fulfill({
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
        json: { error: "Failed" },
      }),
    );
    await dialog.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
