import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("command center navigation and request entry remain usable", async ({
  page,
}) => {
  await page.goto("/?e2e=showcase");

  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tasks" }).click();
  await expect(page.getByText("Review project notes")).toBeVisible();

  const request = page.getByLabel("Ask Jarvis");
  await request.fill("What comes next?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(request).toHaveValue("");

  await page.getByRole("button", { name: "Settings" }).click();
  const autostart = page.getByRole("checkbox", {
    name: /Start with this computer/u,
  });
  await expect(autostart).not.toBeChecked();
  await autostart.check();
  await expect(autostart).toBeChecked();
});

test("command center matches its wide visual contract", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto("/?e2e=showcase");

  await expect(page).toHaveScreenshot("command-center-wide.png", {
    fullPage: true,
  });
});

test("command center reflows without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 480 });
  await page.goto("/?e2e=showcase");

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBe(layout.clientWidth);
  await expect(page).toHaveScreenshot("command-center-narrow.png", {
    fullPage: true,
  });
});

test("overlay exposes exact confirmation and keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ height: 420, width: 560 });
  await page.goto("/?window=overlay&e2e=showcase");

  await expect(
    page.getByText("Send ‘Running five minutes late’ to Alex?"),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeFocused();
  await expect(page).toHaveScreenshot("overlay-confirmation.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: "Confirm" }).click();
});
