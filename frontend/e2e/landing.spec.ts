import { test, expect } from "@playwright/test";
test("pricing simulator, translation and responsive landing", async ({
  page,
}) => {
  await page.route("**/billing/pricing", (route) =>
    route.fulfill({
      json: {
        data: {
          unitUsd: "0.65",
          freeAllowance: 50,
          rate: "1530",
          sourceAt: "2026-09-15T12:00:00Z",
          fetchedAt: "2026-09-15T12:00:00Z",
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByTestId("estimate-usd")).toHaveText("USD 32.50");
  await expect(page.getByTestId("estimate-ars")).toHaveText("ARS 49,725.00");
  await page.getByLabel("Complimentary QRs remaining").fill("0");
  await expect(page.getByTestId("estimate-usd")).toHaveText("USD 65.00");
  await expect(page.getByTestId("estimate-ars")).toHaveText("ARS 99,450.00");
  await page.getByLabel("Complimentary QRs remaining").fill("50");
  await page.getByRole("button", { name: "50 guests", exact: true }).click();
  await expect(page.getByTestId("estimate-usd")).toHaveText("USD 0.00");
  await page.getByLabel("Complimentary QRs remaining").fill("0");
  await expect(page.getByTestId("estimate-usd")).toHaveText("USD 32.50");
  await page.getByLabel("How many guests?", { exact: true }).fill("0");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("estimate-usd")).toHaveText("—");
  await page.getByLabel("How many guests?", { exact: true }).fill("100");
  await page.getByLabel("Complimentary QRs remaining").fill("50");
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cambiar a español" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Cuánto cuesta tu evento?" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/landing-mobile.png",
    fullPage: true,
  });
});
test("rate outage does not block the USD simulator", async ({ page }) => {
  await page.route("**/billing/pricing", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await expect(page.getByTestId("estimate-usd")).toHaveText("USD 32.50");
  await expect(page.getByTestId("estimate-ars")).toHaveText("—");
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
});
