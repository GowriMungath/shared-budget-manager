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

async function setBudget(page: Page, categoryName: string, amount: string) {
  await page.getByRole("link", { name: "Budgets" }).click();
  const row = page.getByRole("row", { name: new RegExp(categoryName) }).first();
  await row.getByRole("button", { name: "Set/Edit" }).click();
  await row.getByLabel(new RegExp(`Budget amount for ${categoryName}`)).fill(amount);
  await row.getByLabel("Save budget limit").click();
}

async function addSharedTransaction(page: Page, description: string, categoryLabel: string, amount: string) {
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("button", { name: "Add Transaction" }).click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount").fill(amount);
  await dialog.getByLabel("Description").fill(description);
  await dialog.getByLabel("Category").selectOption({ label: categoryLabel });
  await dialog.getByRole("button", { name: "Add Transaction" }).click();
}

test("E2E: dashboard route shows derived period summary and survives refresh", async ({ page }) => {
  await resetDatabase(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 3 })).toBeVisible();

  await setBudget(page, "Groceries", "200");
  await addSharedTransaction(page, "Groceries", "Groceries", "20");
  await page.getByRole("link", { name: "Dashboard" }).click();

  await expect(page.getByText("$20.00").first()).toBeVisible();
  await expect(page.getByText("$200.00").first()).toBeVisible();
  await expect(page.getByText("$180.00").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Groceries" }).first()).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 3 })).toBeVisible();

  await page.getByRole("link", { name: /View all/i }).click();
  await expect(page).toHaveURL(/\/transactions$/);
});
