import { expect, test } from "@playwright/test";

async function resetDatabase(page: import("@playwright/test").Page) {
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

async function openAddTransaction(page: import("@playwright/test").Page) {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Add Transaction" }).click();
  return page.getByRole("dialog", { name: "Add transaction" });
}

test("E2E 1: shared fuel transaction persists after reload", async ({ page }) => {
  await resetDatabase(page);
  const dialog = await openAddTransaction(page);

  await dialog.getByLabel("Amount").fill("40");
  await dialog.getByLabel("Description").fill("Fuel");
  await dialog.getByLabel("Category").selectOption({ label: "Fuel" });
  await dialog.getByRole("button", { name: "Add Transaction" }).click();

  await expect(page.getByRole("cell", { name: "Fuel" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "$40.00" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "shared" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("cell", { name: "Fuel" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "$40.00" })).toBeVisible();
});

test("E2E 2: personal Gowri shopping transaction appears correctly", async ({ page }) => {
  await resetDatabase(page);
  const dialog = await openAddTransaction(page);

  await dialog.getByLabel("Amount").fill("45");
  await dialog.getByLabel("Description").fill("Shopping");
  await dialog.getByLabel("Scope").selectOption("personal");
  await dialog.getByLabel("Category").selectOption({ label: "Shopping" });
  await dialog.getByRole("radio", { name: "Gowri" }).check();
  await dialog.getByRole("button", { name: "Add Transaction" }).click();

  await expect(page.getByRole("cell", { name: "Shopping" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "$45.00", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "personal" })).toBeVisible();
});

test("E2E 3: dinner with external participant saves and displays split", async ({ page }) => {
  await resetDatabase(page);
  const dialog = await openAddTransaction(page);

  await dialog.getByLabel("Amount").fill("90");
  await dialog.getByLabel("Description").fill("Dinner");
  await dialog.getByLabel("Category").selectOption({ label: "Eating Out" });
  await dialog.getByLabel("Payer").selectOption({ label: "Nathaniel" });
  await dialog.getByRole("button", { name: "Custom Amount" }).click();

  const allocationAmounts = dialog.getByLabel("Allocation amount");
  await allocationAmounts.nth(0).fill("30");
  await allocationAmounts.nth(1).fill("30");
  await dialog.getByLabel("New friend name").fill("Rohit");
  await dialog.getByRole("button", { name: "Add friend" }).click();
  await expect(allocationAmounts).toHaveCount(3);
  await allocationAmounts.nth(2).fill("30");
  await dialog.getByRole("button", { name: "Add Transaction" }).click();

  await expect(page.getByRole("cell", { name: "Dinner" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "$90.00" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Rohit \$30.00/ })).toBeVisible();
});
