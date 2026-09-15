import { expect, test, type Page } from "@playwright/test";

async function resetDatabase(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("SharedBudgetManagerDB");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      })),
    )
    .toEqual(expect.objectContaining({ scrollWidth: expect.any(Number), clientWidth: expect.any(Number) }));

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("E2E MOBILE 1: shared transaction can be entered and survives reload", async ({ page }) => {
  await resetDatabase(page);
  await page.goto("/transactions");

  await page.getByRole("button", { name: "Add Transaction" }).click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount").fill("20");
  await dialog.getByLabel("Description").fill("Groceries");
  await dialog.getByLabel("Category").selectOption({ label: "Groceries" });
  await dialog.getByLabel("Payer").selectOption({ label: "Gowri" });
  await dialog.getByRole("button", { name: "Add Transaction" }).click();

  await expect(page.locator("article").filter({ hasText: "Groceries" }).filter({ hasText: "$20.00" })).toBeVisible();
  await expect(page.getByText("$20.00").first()).toBeVisible();
  await page.reload();
  await expect(page.locator("article").filter({ hasText: "Groceries" }).filter({ hasText: "$20.00" })).toBeVisible();
  await expect(page.getByText("$20.00").first()).toBeVisible();
});

test("E2E MOBILE 2: budgets are usable without primary-content horizontal overflow", async ({ page }) => {
  await resetDatabase(page);
  await page.goto("/budgets");

  await expect(page.getByRole("heading", { name: "Budgets", level: 3 })).toBeVisible();
  await expect(page.getByText("Groceries").first()).toBeVisible();
  await expect(page.getByText("Budgeted").first()).toBeVisible();
  await expect(page.getByText("Spent").first()).toBeVisible();
  await expect(page.getByText("Remaining").first()).toBeVisible();
  await expectNoPageOverflow(page);
});

test("E2E MOBILE 3: dashboard summary renders at phone width", async ({ page }) => {
  await resetDatabase(page);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard", level: 3 })).toBeVisible();
  await expect(page.getByText("Spent").first()).toBeVisible();
  await expect(page.getByText("Budgeted").first()).toBeVisible();
  await expect(page.getByText("Remaining").first()).toBeVisible();
  await expect(page.getByText("Who owes whom")).toBeVisible();
  await expectNoPageOverflow(page);
});

test("E2E ROUTING: direct loads work for primary routes", async ({ page }) => {
  for (const route of ["/dashboard", "/transactions", "/budgets"]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.locator("#root")).not.toBeEmpty();
  }
});
