import { expect, test } from "@playwright/test";

test("configured site identity on desktop and mobile", async ({ page }) => {
  const name = process.env.SITE_NAME || "DND Battle Room";
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page).toHaveTitle(name);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
