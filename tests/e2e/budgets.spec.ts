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

async function goToBudgets(page: Page) {
  await page.getByRole("link", { name: "Budgets" }).click();
  await expect(page.getByRole("heading", { name: "Budgets", level: 3 })).toBeVisible();
}

async function setBudget(page: Page, categoryName: string, amount: string) {
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

test("E2E 1: core budget example persists after reload", async ({ page }) => {
  await resetDatabase(page);
  await goToBudgets(page);
  await setBudget(page, "Groceries", "200");

  await addSharedTransaction(page, "Groceries", "Groceries", "20");
  await goToBudgets(page);

  let row = page.getByRole("row", { name: /Groceries/ }).first();
  await expect(row.getByText("$200.00")).toBeVisible();
  await expect(row.getByText("$20.00")).toBeVisible();
  await expect(row.getByText("$180.00")).toBeVisible();

  await page.reload();
  await goToBudgets(page);
  row = page.getByRole("row", { name: /Groceries/ }).first();
  await expect(row.getByText("$200.00")).toBeVisible();
  await expect(row.getByText("$20.00")).toBeVisible();
  await expect(row.getByText("$180.00")).toBeVisible();
});

test("E2E 2: overspending shows negative remaining and over budget", async ({ page }) => {
  await resetDatabase(page);
  await goToBudgets(page);
  await setBudget(page, "Fuel", "50");

  await addSharedTransaction(page, "Fuel", "Fuel", "60");
  await goToBudgets(page);

  const row = page.getByRole("row", { name: /Fuel/ }).first();
  await expect(row.getByText("-$10.00")).toBeVisible();
  await expect(row.getByText(/Over budget/)).toBeVisible();
});

test("E2E 3: friend shares are excluded from shared budget spending", async ({ page }) => {
  await resetDatabase(page);
  await goToBudgets(page);
  await page.getByRole("button", { name: "Add Category" }).click();
  const categoryDialog = page.getByRole("dialog", { name: "Add category" });
  await categoryDialog.getByLabel("Name").fill("Dining");
  await categoryDialog.getByRole("button", { name: "Create" }).click();
  await setBudget(page, "Dining", "200");

  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("button", { name: "Add Transaction" }).click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount").fill("120");
  await dialog.getByLabel("Description").fill("Dinner");
  await dialog.getByLabel("Category").selectOption({ label: "Dining" });
  await dialog.getByLabel("Payer").selectOption({ label: "Nathaniel" });
  await dialog.getByRole("button", { name: "Custom Amount" }).click();
  const amounts = dialog.getByLabel("Allocation amount");
  await amounts.nth(0).fill("30");
  await amounts.nth(1).fill("30");
  await dialog.getByLabel("New friend name").fill("Rohit");
  await dialog.getByRole("button", { name: "Add friend" }).click();
  await expect(amounts).toHaveCount(3);
  await amounts.nth(2).fill("30");
  await dialog.getByLabel("New friend name").fill("Priyanka");
  await dialog.getByRole("button", { name: "Add friend" }).click();
  await expect(amounts).toHaveCount(4);
  await amounts.nth(3).fill("30");
  await dialog.getByRole("button", { name: "Add Transaction" }).click();

  await goToBudgets(page);
  const row = page.getByRole("row", { name: /Dining/ }).first();
  await expect(row.getByText("$60.00")).toBeVisible();
  await expect(row.getByText("$140.00")).toBeVisible();
});
