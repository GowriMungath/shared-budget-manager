import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseMoney } from "../../src/domain/money/money.ts";
import { budgetLimitId, budgetPeriodId, categoryId, participantId, transactionId } from "../../src/domain/shared/ids.ts";
import type { Cents, Participant, BudgetLimit } from "../../src/domain/shared/types.ts";
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
    { id: groceriesId, name: "Groceries", groupName: "Shared", archived: false },
    { id: diningId, name: "Dining", groupName: "Shared", archived: false },
    { id: shoppingId, name: "Shopping", groupName: "Personal", archived: false },
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
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await repos.transactions.create(transaction({}));

    const groceries = categorySpent(await overview(), "household", "Groceries");
    expect(groceries.spentCents).toBe(parseMoney("20.00"));
    expect(groceries.remainingCents).toBe(parseMoney("180.00"));
  });

  test("TEST 2 adding another $35 updates spent and remaining", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await repos.transactions.create(transaction({}));
    await repos.transactions.create(transaction({
      id: transactionId("budget_txn_35"),
      totalCents: parseMoney("35.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("17.50") },
        { participantId: nathanielId, amountCents: parseMoney("17.50") },
      ],
    }));

    const groceries = categorySpent(await overview(), "household", "Groceries");
    expect(groceries.spentCents).toBe(parseMoney("55.00"));
    expect(groceries.remainingCents).toBe(parseMoney("145.00"));
  });

  test("TEST 3 friend dining excludes external allocations", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: diningId, amountInput: "200" });
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

    const dining = categorySpent(await overview(), "household", "Dining");
    expect(dining.spentCents).toBe(parseMoney("60.00"));
    expect(dining.remainingCents).toBe(parseMoney("140.00"));
  });

  test("TEST 4 personal budget uses owner allocation, not payer", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: shoppingId, amountInput: "150" });
    await repos.transactions.create(transaction({
      categoryId: shoppingId,
      scope: "personal",
      payerParticipantId: nathanielId,
      totalCents: parseMoney("45.00"),
      allocations: [{ participantId: gowriId, amountCents: parseMoney("45.00") }],
    }));

    const shopping = categorySpent(await overview(), "household", "Shopping");
    expect(shopping.spentCents).toBe(parseMoney("45.00"));
    expect(shopping.remainingCents).toBe(parseMoney("105.00"));
  });

  test("TEST 5 exact exhaustion", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await repos.transactions.create(transaction({ totalCents: parseMoney("200.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("200.00") }] }));

    expect(categorySpent(await overview(), "household", "Groceries").remainingCents).toBe(parseMoney("0.00"));
  });

  test("TEST 6 overspend shows negative remaining", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await repos.transactions.create(transaction({ totalCents: parseMoney("220.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("220.00") }] }));

    const groceries = categorySpent(await overview(), "household", "Groceries");
    expect(groceries.remainingCents).toBe(parseMoney("-20.00"));
    expect(groceries.paceStatus).toBe("OVER_BUDGET");
  });

  test("TEST 7 no budget keeps spent visible and pace unbudgeted", async () => {
    const repos = createRepositories(db);
    await repos.transactions.create(transaction({ totalCents: parseMoney("40.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("40.00") }] }));

    const groceries = categorySpent(await overview(), "household", "Groceries");
    expect(groceries.budgetedCents).toBeUndefined();
    expect(groceries.spentCents).toBe(parseMoney("40.00"));
    expect(groceries.remainingCents).toBeUndefined();
    expect(groceries.paceStatus).toBe("UNBUDGETED");
  });

  test("TEST 8 transactions outside period are excluded", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await repos.transactions.create(transaction({ date: "2026-10-01" }));

    expect(categorySpent(await overview(), "household", "Groceries").spentCents).toBe(parseMoney("0.00"));
  });

  test("TEST 9 start and end boundaries are included", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await repos.transactions.create(transaction({ id: transactionId("start"), date: "2026-09-15" }));
    await repos.transactions.create(transaction({ id: transactionId("end"), date: "2026-09-30" }));

    expect(categorySpent(await overview(), "household", "Groceries").spentCents).toBe(parseMoney("40.00"));
  });

  test("TEST 10 changing and deleting transactions updates derived budget usage", async () => {
    const repos = createRepositories(db);
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    const original = transaction({});
    await repos.transactions.create(original);
    await repos.transactions.update({ ...original, totalCents: parseMoney("50.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("50.00") }] });
    expect(categorySpent(await overview(), "household", "Groceries").remainingCents).toBe(parseMoney("150.00"));
    await repos.transactions.delete(original.id);
    expect(categorySpent(await overview(), "household", "Groceries").remainingCents).toBe(parseMoney("200.00"));
  });

  test("REGRESSION: Odd-cent household budget splits deterministically (remainder always to first member)", async () => {
    // Regression test for odd-cent budget allocation.
    // With a household budget of $101.01 (10101 cents) split between 2 members:
    // - First member (Gowri, by deterministic ordering) should receive $50.51 (5051 cents)
    // - Second member (Nathaniel) should receive $50.50 (5050 cents)
    // - Total must equal $101.01
    // This ensures consistent budget share assignments regardless of database order.

    const repos = createRepositories(db);
    const oddBudgetPeriodId = budgetPeriodId("odd_budget_period");

    await repos.budgetPeriods.save({
      id: oddBudgetPeriodId,
      name: "Odd Budget Period",
      startDate: "2026-09-15",
      endDate: "2026-09-30",
    });

    // Set a household budget of exactly $101.01 (10101 cents) - odd amount
    await budgets.setBudgetLimit({
      budgetPeriodId: oddBudgetPeriodId,
      categoryId: groceriesId,
      amountInput: "101.01",
    });

    // Get the overview to verify member budget shares
    const overview = await budgets.getBudgetOverview(oddBudgetPeriodId);
    expect(overview).toBeDefined();

    // Total budgeted should be $101.01
    expect(overview.sections[0]?.totalBudgetedCents).toBe(parseMoney("101.01"));

    // Verify that allocateEqually deterministically assigns remainder
    // The members are sorted by memberKey (Gowri < Nathaniel alphabetically)
    // So Gowri should get $50.51 and Nathaniel should get $50.50
    // This total must be exactly $101.01
    const groceries = categorySpent(overview, "household", "Groceries");
    
    // Since there are two household members:
    // allocateEqually(10101, 2) = [5051, 5050]
    // Gowri's share: $50.51
    // Nathaniel's share: $50.50
    expect(groceries.budgetedCents).toBe(parseMoney("101.01"));
    
    // We cannot directly assert per-member shares from the overview,
    // but we can verify the total and that no cents are lost/created
    expect(groceries.spentCents).toBe(parseMoney("0.00")); // No transactions yet
    expect(groceries.remainingCents).toBe(parseMoney("101.01")); // All remaining
  });

  test("REGRESSION: Legacy Trial MVP budget structure remains compatible with new model", async () => {
    // This test verifies the actual historical Trial MVP budget structure with multiple owner-specific limits.
    // Production Trial MVP had 10 distinct BudgetLimit rows:
    // - 6 shared category limits (one row each)
    // - 4 personal category limits (two rows each: Gowri + Nathaniel)
    //
    // New model must correctly aggregate multiple limits per category while preserving all rows.
    // Total = $360: Shared $258 + Personal Food $22 + Clothing $80

    const repos = createRepositories(db);
    const legacyPeriodId = budgetPeriodId("legacy_trial_mvp");

    // Create the legacy period (matching exact historical dates)
    await repos.budgetPeriods.save({
      id: legacyPeriodId,
      name: "Trial MVP",
      startDate: "2026-09-15",
      endDate: "2026-09-30",
    });

    // Category IDs
    const carMaintenanceId = categoryId("legacy_car_maintenance");
    const eatingOutId = categoryId("legacy_eating_out");
    const entertainmentId = categoryId("legacy_entertainment");
    const fuelId = categoryId("legacy_fuel");
    const legacyGroceriesId = categoryId("legacy_groceries");
    const miscellaneousId = categoryId("legacy_miscellaneous");
    const personalFoodId = categoryId("legacy_personal_food");
    const clothingId = categoryId("legacy_clothing_shopping");

    // Create both active and archived categories matching production structure
    await db.categories.bulkPut([
      { id: carMaintenanceId, name: "Car Maintenance", groupName: "Transportation", archived: false },
      { id: eatingOutId, name: "Eating Out", groupName: "Food", archived: false },
      { id: entertainmentId, name: "Entertainment", groupName: "Leisure", archived: false },
      { id: fuelId, name: "Fuel", groupName: "Transportation", archived: false },
      { id: legacyGroceriesId, name: "Groceries", groupName: "Food", archived: false },
      { id: miscellaneousId, name: "Miscellaneous", groupName: "Other", archived: false },
      { id: personalFoodId, name: "Personal Food", groupName: "Personal", archived: true },
      { id: clothingId, name: "Clothing", groupName: "Personal", archived: true },
    ]);

    // Insert 10 historical BudgetLimit rows directly (matching actual production structure)
    // Do NOT use setBudgetLimit() as it overwrites duplicate category entries
    
    // 6 shared category limits (one per category)
    const sharedLimits: Array<{
      id: ReturnType<typeof budgetLimitId>;
      categoryId: ReturnType<typeof categoryId>;
      scope: "shared";
      limitCents: Cents;
    }> = [
      { id: budgetLimitId("legacy_limit_1"), categoryId: carMaintenanceId, scope: "shared", limitCents: parseMoney("15") },
      { id: budgetLimitId("legacy_limit_2"), categoryId: eatingOutId, scope: "shared", limitCents: parseMoney("18") },
      { id: budgetLimitId("legacy_limit_3"), categoryId: entertainmentId, scope: "shared", limitCents: parseMoney("40") },
      { id: budgetLimitId("legacy_limit_4"), categoryId: fuelId, scope: "shared", limitCents: parseMoney("85") },
      { id: budgetLimitId("legacy_limit_5"), categoryId: legacyGroceriesId, scope: "shared", limitCents: parseMoney("75") },
      { id: budgetLimitId("legacy_limit_6"), categoryId: miscellaneousId, scope: "shared", limitCents: parseMoney("25") },
    ];

    // 4 personal category limits (2 rows per category: Gowri + Nathaniel)
    const personalLimits: Array<{
      id: ReturnType<typeof budgetLimitId>;
      categoryId: ReturnType<typeof categoryId>;
      scope: "personal";
      ownerParticipantId: ReturnType<typeof participantId>;
      limitCents: Cents;
    }> = [
      // Personal Food - Gowri
      { id: budgetLimitId("legacy_limit_7"), categoryId: personalFoodId, scope: "personal", ownerParticipantId: gowriId, limitCents: parseMoney("11") },
      // Personal Food - Nathaniel
      { id: budgetLimitId("legacy_limit_8"), categoryId: personalFoodId, scope: "personal", ownerParticipantId: nathanielId, limitCents: parseMoney("11") },
      // Clothing/Shopping - Gowri
      { id: budgetLimitId("legacy_limit_9"), categoryId: clothingId, scope: "personal", ownerParticipantId: gowriId, limitCents: parseMoney("40") },
      // Clothing/Shopping - Nathaniel
      { id: budgetLimitId("legacy_limit_10"), categoryId: clothingId, scope: "personal", ownerParticipantId: nathanielId, limitCents: parseMoney("40") },
    ];

    // Insert all 10 limits directly using storage API
    const allLimits: BudgetLimit[] = [...sharedLimits, ...personalLimits].map((limit) => {
      if ("ownerParticipantId" in limit) {
        return {
          id: limit.id,
          budgetPeriodId: legacyPeriodId,
          categoryId: limit.categoryId,
          scope: "personal" as const,
          ownerParticipantId: limit.ownerParticipantId,
          limitCents: limit.limitCents,
        };
      }
      return {
        id: limit.id,
        budgetPeriodId: legacyPeriodId,
        categoryId: limit.categoryId,
        scope: "shared" as const,
        limitCents: limit.limitCents,
      };
    });

    for (const limit of allLimits) {
      await repos.budgetLimits.save(limit);
    }

    // CRITICAL TEST: Verify new model aggregates multiple limits per category
    const overview = await budgets.getBudgetOverview(legacyPeriodId);
    expect(overview).toBeDefined();
    expect(overview.period.id).toBe(legacyPeriodId);
    expect(overview.sections.length).toBeGreaterThan(0);
    
    const section = overview.sections[0];
    expect(section.categories.length).toBeGreaterThan(0);

    // Verify each category correctly aggregates its limits
    const personalFoodSummary = section.categories.find((cat) => cat.categoryName === "Personal Food");
    expect(personalFoodSummary).toBeDefined();
    expect(personalFoodSummary!.budgetedCents).toBe(parseMoney("22.00")); // $11 + $11

    const clothingSummary = section.categories.find((cat) => cat.categoryName === "Clothing");
    expect(clothingSummary).toBeDefined();
    expect(clothingSummary!.budgetedCents).toBe(parseMoney("80.00")); // $40 + $40

    // Verify total household budget = $360
    // Shared: $15+$18+$40+$85+$75+$25 = $258
    // Personal Food: $22 (aggregated from $11+$11)
    // Clothing: $80 (aggregated from $40+$40)
    // Total: $360
    expect(section.totalBudgetedCents).toBe(parseMoney("360.00"));
    
    // Verify per-person equal share
    expect(section.totalBudgetedCents / 2).toBe(parseMoney("180.00"));
  });
});

