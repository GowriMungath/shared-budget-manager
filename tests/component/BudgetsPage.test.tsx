import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseMoney } from "../../src/domain/money/money.ts";
import { budgetPeriodId, categoryId, participantId, transactionId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
import type { Transaction } from "../../src/domain/ledger/transaction.ts";
import { BudgetUseCases } from "../../src/application/use-cases/budgets/budgetUseCases.ts";
import type { IdService } from "../../src/application/services/idService.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../../src/infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../../src/infrastructure/persistence/indexeddb/repositories.ts";
import { BudgetsPage } from "../../src/ui/pages/BudgetsPage.tsx";

let db: SharedBudgetManagerDatabase;
let budgets: BudgetUseCases;
let ids = 0;

const gowriId = participantId("component_budget_gowri");
const nathanielId = participantId("component_budget_nathaniel");
const periodId = budgetPeriodId("component_budget_period");
const groceriesId = categoryId("component_budget_groceries");
const shoppingId = categoryId("component_budget_shopping");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
];
const idService: IdService = { createId: () => `component_budget_generated_${++ids}` };

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: transactionId(`component_budget_txn_${++ids}`),
    kind: "expense",
    date: "2026-09-16",
    description: "Groceries",
    totalCents: parseMoney("20.00"),
    categoryId: groceriesId,
    payerParticipantId: gowriId,
    scope: "shared",
    allocations: [
      { participantId: gowriId, amountCents: parseMoney("10.00") },
      { participantId: nathanielId, amountCents: parseMoney("10.00") },
    ],
    ...overrides,
  };
}

async function setup() {
  db = createDatabase(`budget_component_${crypto.randomUUID()}`);
  await db.open();
  await db.participants.bulkPut(participants);
  await db.categories.bulkPut([
    { id: groceriesId, name: "Groceries", groupName: "Shared", scope: "shared", archived: false },
    { id: shoppingId, name: "Shopping", groupName: "Personal", scope: "personal", archived: false },
  ]);
  await db.budgetPeriods.put({ id: periodId, name: "Trial", startDate: "2026-09-15", endDate: "2026-09-30" });
  const repos = createRepositories(db);
  budgets = new BudgetUseCases({
    budgetPeriods: repos.budgetPeriods,
    budgetLimits: repos.budgetLimits,
    categories: repos.categories,
    participants: repos.participants,
    transactions: repos.transactions,
    ids: idService,
    today: () => "2026-09-20",
  });
}

beforeEach(async () => {
  ids = 0;
  await setup();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

async function renderPage() {
  render(<BudgetsPage budgetUseCases={budgets} />);
  await screen.findByRole("heading", { name: "Shared" });
}

describe("BudgetsPage", () => {
  test("renders budget row values", async () => {
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    await createRepositories(db).transactions.create(transaction({}));
    await renderPage();

    const row = screen.getByRole("row", { name: /Groceries/i });
    expect(within(row).getByText("$200.00")).toBeInTheDocument();
    expect(within(row).getByText("$20.00")).toBeInTheDocument();
    expect(within(row).getByText("$180.00")).toBeInTheDocument();
  });

  test("edits and sets a limit", async () => {
    const user = userEvent.setup();
    await renderPage();
    const row = screen.getByRole("row", { name: /Groceries/i });
    await user.click(within(row).getByRole("button", { name: "Set/Edit" }));
    await user.type(within(row).getByLabelText(/Budget amount/i), "200");
    await user.click(within(row).getByLabelText("Save budget limit"));

    await expect.poll(() => within(screen.getByRole("row", { name: /Groceries/i })).getAllByText("$200.00").length).toBeGreaterThan(0);
  });

  test("unsets a limit without hiding spent", async () => {
    const user = userEvent.setup();
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    await createRepositories(db).transactions.create(transaction({}));
    await renderPage();
    await user.click(within(screen.getByRole("row", { name: /Groceries/i })).getByRole("button", { name: "Unset" }));

    await waitFor(() => expect(within(screen.getByRole("row", { name: /Groceries/i })).getByText("Not set")).toBeInTheDocument());
    expect(within(screen.getByRole("row", { name: /Groceries/i })).getByText("$20.00")).toBeInTheDocument();
  });

  test("shows no-limit category as unbudgeted", async () => {
    await createRepositories(db).transactions.create(transaction({}));
    await renderPage();

    const row = screen.getByRole("row", { name: /Groceries/i });
    expect(within(row).getByText("Not set")).toBeInTheDocument();
    expect(within(row).getByText(/Unbudgeted/)).toBeInTheDocument();
  });

  test("shows over-budget display", async () => {
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "10" });
    await createRepositories(db).transactions.create(transaction({}));
    await renderPage();

    expect(within(screen.getByRole("row", { name: /Groceries/i })).getByText(/Over budget/)).toBeInTheDocument();
  });

  test("shows ahead-of-pace text", async () => {
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "25" });
    await createRepositories(db).transactions.create(transaction({}));
    await renderPage();

    expect(within(screen.getByRole("row", { name: /Groceries/i })).getByText(/Ahead of pace/)).toBeInTheDocument();
  });

  test("renders shared and personal sections", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Shared" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gowri Personal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nathaniel Personal" })).toBeInTheDocument();
  });
});
