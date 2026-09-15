import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseMoney } from "../../src/domain/money/money.ts";
import { budgetPeriodId, categoryId, participantId, transactionId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../../src/infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../../src/infrastructure/persistence/indexeddb/repositories.ts";
import { BudgetUseCases } from "../../src/application/use-cases/budgets/budgetUseCases.ts";
import type { IdService } from "../../src/application/services/idService.ts";
import type { Transaction } from "../../src/domain/ledger/transaction.ts";

let db: SharedBudgetManagerDatabase;
let budgets: BudgetUseCases;
let ids = 0;

const gowriId = participantId("budget_gowri");
const nathanielId = participantId("budget_nathaniel");
const friendAId = participantId("budget_friend_a");
const friendBId = participantId("budget_friend_b");
const periodId = budgetPeriodId("budget_period");
const groceriesId = categoryId("budget_groceries");
const diningId = categoryId("budget_dining");
const shoppingId = categoryId("budget_shopping");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
  { id: friendAId, name: "Friend A", kind: "external" },
  { id: friendBId, name: "Friend B", kind: "external" },
];

const idService: IdService = { createId: () => `budget_generated_${++ids}` };

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: transactionId(`budget_txn_${++ids}`),
    kind: "expense",
    date: "2026-09-16",
    description: "Budget transaction",
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

async function overview() {
  return budgets.getBudgetOverview(periodId);
}

function categorySpent(summary: Awaited<ReturnType<typeof overview>>, sectionKey: string, categoryName: string) {
  const category = summary.sections
    .find((section) => section.key === sectionKey)!
    .categories.find((item) => item.categoryName === categoryName)!;
  return category;
}

beforeEach(async () => {
  ids = 0;
  db = createDatabase(`budget_use_cases_${crypto.randomUUID()}`);
  await db.open();
  await db.participants.bulkPut(participants);
  await db.categories.bulkPut([
    { id: groceriesId, name: "Groceries", groupName: "Shared", scope: "shared", archived: false },
    { id: diningId, name: "Dining", groupName: "Shared", scope: "shared", archived: false },
    { id: shoppingId, name: "Shopping", groupName: "Personal", scope: "personal", archived: false },
  ]);
  await db.budgetPeriods.put({
    id: periodId,
    name: "Trial",
    startDate: "2026-09-15",
    endDate: "2026-09-30",
  });
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
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("budget use cases", () => {
  test("TEST 1 $200 Shared Groceries with $20 eligible spend", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    await repos.transactions.create(transaction({}));

    const groceries = categorySpent(await overview(), "shared", "Groceries");
    expect(groceries.spentCents).toBe(parseMoney("20.00"));
    expect(groceries.remainingCents).toBe(parseMoney("180.00"));
  });

  test("TEST 2 adding another $35 updates spent and remaining", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    await repos.transactions.create(transaction({}));
    await repos.transactions.create(transaction({
      id: transactionId("budget_txn_35"),
      totalCents: parseMoney("35.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("17.50") },
        { participantId: nathanielId, amountCents: parseMoney("17.50") },
      ],
    }));

    const groceries = categorySpent(await overview(), "shared", "Groceries");
    expect(groceries.spentCents).toBe(parseMoney("55.00"));
    expect(groceries.remainingCents).toBe(parseMoney("145.00"));
  });

  test("TEST 3 friend dining excludes external allocations", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: diningId, scope: "shared", amountInput: "200" });
    await repos.transactions.create(transaction({
      categoryId: diningId,
      payerParticipantId: nathanielId,
      totalCents: parseMoney("120.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("30.00") },
        { participantId: nathanielId, amountCents: parseMoney("30.00") },
        { participantId: friendAId, amountCents: parseMoney("30.00") },
        { participantId: friendBId, amountCents: parseMoney("30.00") },
      ],
    }));

    const dining = categorySpent(await overview(), "shared", "Dining");
    expect(dining.spentCents).toBe(parseMoney("60.00"));
    expect(dining.remainingCents).toBe(parseMoney("140.00"));
  });

  test("TEST 4 personal budget uses owner allocation, not payer", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: shoppingId, scope: "personal", ownerParticipantId: gowriId, amountInput: "150" });
    await repos.transactions.create(transaction({
      categoryId: shoppingId,
      scope: "personal",
      payerParticipantId: nathanielId,
      totalCents: parseMoney("45.00"),
      allocations: [{ participantId: gowriId, amountCents: parseMoney("45.00") }],
    }));

    const shopping = categorySpent(await overview(), gowriId, "Shopping");
    expect(shopping.spentCents).toBe(parseMoney("45.00"));
    expect(shopping.remainingCents).toBe(parseMoney("105.00"));
  });

  test("TEST 5 exact exhaustion", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    await repos.transactions.create(transaction({ totalCents: parseMoney("200.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("200.00") }] }));

    expect(categorySpent(await overview(), "shared", "Groceries").remainingCents).toBe(parseMoney("0.00"));
  });

  test("TEST 6 overspend shows negative remaining", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    await repos.transactions.create(transaction({ totalCents: parseMoney("220.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("220.00") }] }));

    const groceries = categorySpent(await overview(), "shared", "Groceries");
    expect(groceries.remainingCents).toBe(parseMoney("-20.00"));
    expect(groceries.paceStatus).toBe("OVER_BUDGET");
  });

  test("TEST 7 no budget keeps spent visible and pace unbudgeted", async () => {
    const repos = createRepositories(db);
    await repos.transactions.create(transaction({ totalCents: parseMoney("40.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("40.00") }] }));

    const groceries = categorySpent(await overview(), "shared", "Groceries");
    expect(groceries.budgetedCents).toBeUndefined();
    expect(groceries.spentCents).toBe(parseMoney("40.00"));
    expect(groceries.remainingCents).toBeUndefined();
    expect(groceries.paceStatus).toBe("UNBUDGETED");
  });

  test("TEST 8 transactions outside period are excluded", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    await repos.transactions.create(transaction({ date: "2026-10-01" }));

    expect(categorySpent(await overview(), "shared", "Groceries").spentCents).toBe(parseMoney("0.00"));
  });

  test("TEST 9 start and end boundaries are included", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    await repos.transactions.create(transaction({ id: transactionId("start"), date: "2026-09-15" }));
    await repos.transactions.create(transaction({ id: transactionId("end"), date: "2026-09-30" }));

    expect(categorySpent(await overview(), "shared", "Groceries").spentCents).toBe(parseMoney("40.00"));
  });

  test("TEST 10 changing and deleting transactions updates derived budget usage", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, scope: "shared", amountInput: "200" });
    const original = transaction({});
    await repos.transactions.create(original);
    await repos.transactions.update({ ...original, totalCents: parseMoney("50.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("50.00") }] });
    expect(categorySpent(await overview(), "shared", "Groceries").remainingCents).toBe(parseMoney("150.00"));
    await repos.transactions.delete(original.id);
    expect(categorySpent(await overview(), "shared", "Groceries").remainingCents).toBe(parseMoney("200.00"));
  });
});
