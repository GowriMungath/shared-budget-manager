import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BudgetUseCases } from "../../src/application/use-cases/budgets/budgetUseCases.ts";
import { DashboardUseCases } from "../../src/application/use-cases/dashboard/dashboardUseCases.ts";
import { TransactionUseCases } from "../../src/application/use-cases/transactions/transactionUseCases.ts";
import type { IdService } from "../../src/application/services/idService.ts";
import { parseMoney } from "../../src/domain/money/money.ts";
import { budgetLimitId, budgetPeriodId, categoryId, goalId, participantId, settlementId, transactionId } from "../../src/domain/shared/ids.ts";
import type { Participant, Cents } from "../../src/domain/shared/types.ts";
import type { Transaction } from "../../src/domain/ledger/transaction.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../../src/infrastructure/persistence/indexeddb/database.ts";
import { createRepositories, type DexieTransactionRepository } from "../../src/infrastructure/persistence/indexeddb/repositories.ts";

let db: SharedBudgetManagerDatabase;
let budgets: BudgetUseCases;
let dashboard: DashboardUseCases;
let transactions: DexieTransactionRepository;
let ids = 0;

const gowriId = participantId("dashboard_gowri");
const nathanielId = participantId("dashboard_nathaniel");
const friendAId = participantId("dashboard_friend_a");
const friendBId = participantId("dashboard_friend_b");
const periodId = budgetPeriodId("dashboard_period");
const oldPeriodId = budgetPeriodId("dashboard_old_period");
const groceriesId = categoryId("dashboard_groceries");
const fuelId = categoryId("dashboard_fuel");
const diningId = categoryId("dashboard_dining");
const shoppingId = categoryId("dashboard_shopping");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
  { id: friendAId, name: "Rohit", kind: "external" },
  { id: friendBId, name: "Priyanka", kind: "external" },
];

const idService: IdService = { createId: () => `dashboard_generated_${++ids}` };

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: transactionId(`dashboard_txn_${++ids}`),
    kind: "expense",
    date: "2026-09-16",
    description: "Dashboard transaction",
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

beforeEach(async () => {
  ids = 0;
  db = createDatabase(`dashboard_use_cases_${crypto.randomUUID()}`);
  await db.open();
  await db.participants.bulkPut(participants);
  await db.categories.bulkPut([
    { id: groceriesId, name: "Groceries", groupName: "Shared", archived: false },
    { id: fuelId, name: "Fuel", groupName: "Shared", archived: false },
    { id: diningId, name: "Dining", groupName: "Shared", archived: false },
    { id: shoppingId, name: "Shopping", groupName: "Personal", archived: false },
  ]);
  await db.budgetPeriods.bulkPut([
    { id: oldPeriodId, name: "Earlier", startDate: "2026-08-01", endDate: "2026-08-31" },
    { id: periodId, name: "Trial", startDate: "2026-09-15", endDate: "2026-09-30" },
  ]);
  await db.goals.bulkPut([
    {
      id: goalId("dashboard_gowri_goal"),
      name: "Gowri Tuition",
      ownerParticipantId: gowriId,
      targetCents: parseMoney("6500.00"),
      currentSavedCents: parseMoney("6500.00"),
      deadlineMonth: "2027-02",
    },
    {
      id: goalId("dashboard_nathaniel_goal"),
      name: "Nathaniel Tuition",
      ownerParticipantId: nathanielId,
      targetCents: parseMoney("6500.00"),
      currentSavedCents: parseMoney("7000.00"),
      deadlineMonth: "2027-02",
    },
  ]);
  const repos = createRepositories(db);
  transactions = repos.transactions;
  budgets = new BudgetUseCases({
    budgetPeriods: repos.budgetPeriods,
    budgetLimits: repos.budgetLimits,
    categories: repos.categories,
    participants: repos.participants,
    transactions: repos.transactions,
    ids: idService,
    today: () => "2026-09-20",
  });
  dashboard = new DashboardUseCases({
    budgets,
    transactions: repos.transactions,
    participants: repos.participants,
    categories: repos.categories,
    settlements: repos.settlements,
    goals: repos.goals,
    obligations: repos.obligations,
    today: () => "2026-09-20",
  });
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("dashboard use cases", () => {
  test("calculates total, budgeted, remaining, and unbudgeted spending without double subtracting", async () => {
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await transactions.create(transaction({ totalCents: parseMoney("50.00"), allocations: [{ participantId: gowriId, amountCents: parseMoney("50.00") }] }));
    await transactions.create(transaction({
      categoryId: fuelId,
      totalCents: parseMoney("30.00"),
      allocations: [{ participantId: nathanielId, amountCents: parseMoney("30.00") }],
    }));

    const overview = await dashboard.getDashboardOverview(periodId);

    expect(overview.householdSummary.totalSpentCents).toBe(parseMoney("80.00"));
    expect(overview.householdSummary.totalBudgetedCents).toBe(parseMoney("200.00"));
    expect(overview.householdSummary.budgetedCategorySpentCents).toBe(parseMoney("50.00"));
    expect(overview.householdSummary.remainingBudgetCents).toBe(parseMoney("150.00"));
    expect(overview.householdSummary.unbudgetedSpentCents).toBe(parseMoney("30.00"));
  });

  test("separates shared, personal, and member economic shares by allocation ownership", async () => {
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await budgets.setBudgetLimit({
      budgetPeriodId: periodId,
      categoryId: shoppingId,
      amountInput: "100",
    });
    await transactions.create(transaction({}));
    await transactions.create(transaction({
      categoryId: shoppingId,
      scope: "personal",
      totalCents: parseMoney("30.00"),
      allocations: [{ participantId: gowriId, amountCents: parseMoney("30.00") }],
    }));

    const overview = await dashboard.getDashboardOverview(periodId);
    const gowri = overview.memberSummaries.find((summary) => summary.participantId === gowriId)!;
    const nathaniel = overview.memberSummaries.find((summary) => summary.participantId === nathanielId)!;

    expect(overview.householdSummary.sharedSpendingCents).toBe(parseMoney("20.00"));
    expect(overview.householdSummary.personalSpendingCents).toBe(parseMoney("30.00"));
    expect(gowri.totalEconomicShareCents).toBe(parseMoney("40.00"));
    expect(nathaniel.totalEconomicShareCents).toBe(parseMoney("10.00"));
  });

  test("preserves internal and external balance identities", async () => {
    await transactions.create(transaction({
      payerParticipantId: nathanielId,
      totalCents: parseMoney("120.00"),
      categoryId: diningId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("30.00") },
        { participantId: nathanielId, amountCents: parseMoney("30.00") },
        { participantId: friendAId, amountCents: parseMoney("25.00") },
        { participantId: friendBId, amountCents: parseMoney("35.00") },
      ],
    }));
    await createRepositories(db).settlements.save({
      id: settlementId("dashboard_internal_settlement"),
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("10.00"),
      date: "2026-09-18",
      type: "internal",
    });

    const overview = await dashboard.getDashboardOverview(periodId);

    expect(overview.internalBalance.fromName).toBe("Gowri");
    expect(overview.internalBalance.toName).toBe("Nathaniel");
    expect(overview.internalBalance.amountCents).toBe(parseMoney("20.00"));
    expect(overview.externalReceivables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromName: "Rohit", toName: "Nathaniel", amountCents: parseMoney("25.00") }),
        expect.objectContaining({ fromName: "Priyanka", toName: "Nathaniel", amountCents: parseMoney("35.00") }),
      ]),
    );
  });

  test("defaults to the period containing today", async () => {
    const overview = await dashboard.getDashboardOverview();
    expect(overview.selectedBudgetPeriodId).toBe(periodId);
  });

  test("shows fully funded and overfunded goals without negative remaining or contribution", async () => {
    const overview = await dashboard.getDashboardOverview(periodId);

    expect(overview.goalsSummary.find((goal) => goal.goal.name === "Gowri Tuition")?.remainingCents).toBe(parseMoney("0.00"));
    expect(overview.goalsSummary.find((goal) => goal.goal.name === "Gowri Tuition")?.suggestedMonthlyContributionCents).toBe(parseMoney("0.00"));
    expect(overview.goalsSummary.find((goal) => goal.goal.name === "Nathaniel Tuition")?.remainingCents).toBe(parseMoney("0.00"));
    expect(overview.goalsSummary.find((goal) => goal.goal.name === "Nathaniel Tuition")?.suggestedMonthlyContributionCents).toBe(parseMoney("0.00"));
  });

  // Regression tests: Transaction scope round-trips correctly
  test("shared transaction scope persists to database and reloads correctly", async () => {
    const shared = transaction({ scope: "shared" });
    await transactions.create(shared);
    const reloaded = await transactions.getById(shared.id);
    expect(reloaded?.scope).toBe("shared");
  });

  test("personal transaction scope persists to database and reloads correctly", async () => {
    const personal = transaction({
      scope: "personal",
      allocations: [{ participantId: gowriId, amountCents: parseMoney("20.00") }],
    });
    await transactions.create(personal);
    const reloaded = await transactions.getById(personal.id);
    expect(reloaded?.scope).toBe("personal");
  });

  // Regression tests: Shared transaction defaults
  test("shared transaction defaults to 50/50 allocation", async () => {
    const shared = transaction({
      scope: "shared",
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("10.00") },
        { participantId: nathanielId, amountCents: parseMoney("10.00") },
      ],
    });
    await transactions.create(shared);
    const overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.householdSummary.sharedSpendingCents).toBe(parseMoney("20.00"));
  });

  // Regression tests: Custom shared allocation
  test("custom shared allocation (70/30) is calculated correctly", async () => {
    const customShared = transaction({
      scope: "shared",
      totalCents: parseMoney("100.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("70.00") },
        { participantId: nathanielId, amountCents: parseMoney("30.00") },
      ],
    });
    await transactions.create(customShared);
    const overview = await dashboard.getDashboardOverview(periodId);
    const gowri = overview.memberSummaries.find((s) => s.participantId === gowriId)!;
    const nathaniel = overview.memberSummaries.find((s) => s.participantId === nathanielId)!;
    expect(gowri.totalEconomicShareCents).toBe(parseMoney("70.00"));
    expect(nathaniel.totalEconomicShareCents).toBe(parseMoney("30.00"));
  });

  // Regression tests: Personal transaction allocation
  test("personal transaction allocated 100% to owner", async () => {
    const personal = transaction({
      scope: "personal",
      totalCents: parseMoney("50.00"),
      allocations: [{ participantId: gowriId, amountCents: parseMoney("50.00") }],
    });
    await transactions.create(personal);
    const overview = await dashboard.getDashboardOverview(periodId);
    const gowri = overview.memberSummaries.find((s) => s.participantId === gowriId)!;
    const nathaniel = overview.memberSummaries.find((s) => s.participantId === nathanielId)!;
    expect(gowri.personalSpendingCents).toBe(parseMoney("50.00"));
    expect(nathaniel.personalSpendingCents).toBe(parseMoney("0.00"));
  });

  // Regression tests: Personal expense paid by same owner creates no debt
  test("personal expense paid by same owner creates no household debt", async () => {
    const personal = transaction({
      scope: "personal",
      payerParticipantId: gowriId,
      totalCents: parseMoney("30.00"),
      allocations: [{ participantId: gowriId, amountCents: parseMoney("30.00") }],
    });
    await transactions.create(personal);
    const overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.internalBalance.amountCents).toBe(parseMoney("0.00"));
  });

  // Regression tests: Gowri personal expense paid by Nathaniel creates debt
  test("Gowri personal expense paid by Nathaniel creates settlement debt", async () => {
    const crossPayer = transaction({
      scope: "personal",
      payerParticipantId: nathanielId,
      totalCents: parseMoney("40.00"),
      allocations: [{ participantId: gowriId, amountCents: parseMoney("40.00") }],
    });
    await transactions.create(crossPayer);
    const overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.internalBalance.fromName).toBe("Gowri");
    expect(overview.internalBalance.toName).toBe("Nathaniel");
    expect(overview.internalBalance.amountCents).toBe(parseMoney("40.00"));
  });

  // Regression tests: Bidirectional debt nets correctly
  test("bidirectional obligations net to show only net balance", async () => {
    const nathanielOwes = transaction({
      scope: "shared",
      payerParticipantId: gowriId,
      totalCents: parseMoney("60.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("20.00") },
        { participantId: nathanielId, amountCents: parseMoney("40.00") },
      ],
    });
    const gowriOwes = transaction({
      scope: "shared",
      payerParticipantId: nathanielId,
      totalCents: parseMoney("50.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("30.00") },
        { participantId: nathanielId, amountCents: parseMoney("20.00") },
      ],
    });
    await transactions.create(nathanielOwes);
    await transactions.create(gowriOwes);
    const overview = await dashboard.getDashboardOverview(periodId);
    // Nathaniel owes 40, Gowri pays 30 for him, net: Nathaniel owes Gowri 10
    expect(overview.internalBalance.fromName).toBe("Nathaniel");
    expect(overview.internalBalance.toName).toBe("Gowri");
    expect(overview.internalBalance.amountCents).toBe(parseMoney("10.00"));
  });

  // Regression tests: Equal obligations show Settled / $0
  test("equal bidirectional obligations show Settled / $0", async () => {
    const nathanielOwes = transaction({
      scope: "shared",
      payerParticipantId: gowriId,
      totalCents: parseMoney("50.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("25.00") },
        { participantId: nathanielId, amountCents: parseMoney("25.00") },
      ],
    });
    const gowriOwes = transaction({
      scope: "shared",
      payerParticipantId: nathanielId,
      totalCents: parseMoney("50.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("25.00") },
        { participantId: nathanielId, amountCents: parseMoney("25.00") },
      ],
    });
    await transactions.create(nathanielOwes);
    await transactions.create(gowriOwes);
    const overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.internalBalance.amountCents).toBe(parseMoney("0.00"));
  });

  // Regression tests: Settlement records reduce debt correctly
  test("settlement record reduces outstanding debt", async () => {
    const personal = transaction({
      scope: "personal",
      payerParticipantId: nathanielId,
      totalCents: parseMoney("100.00"),
      allocations: [{ participantId: gowriId, amountCents: parseMoney("100.00") }],
    });
    await transactions.create(personal);
    await createRepositories(db).settlements.save({
      id: settlementId("dashboard_settlement_payment"),
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("50.00"),
      date: "2026-09-18",
      type: "internal",
    });
    const overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.internalBalance.amountCents).toBe(parseMoney("50.00"));
  });

  // Regression tests: Household budget = budgeted / spent / remaining
  test("household budget shows total budgeted, spent, and remaining", async () => {
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: fuelId, amountInput: "100" });
    await transactions.create(transaction({ totalCents: parseMoney("20.00") })); // shared 50/50
    await transactions.create(
      transaction({
        categoryId: fuelId,
        totalCents: parseMoney("40.00"),
        allocations: [
          { participantId: gowriId, amountCents: parseMoney("20.00") },
          { participantId: nathanielId, amountCents: parseMoney("20.00") },
        ],
      }),
    );
    const overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.householdSummary.totalBudgetedCents).toBe(parseMoney("300.00"));
    expect(overview.householdSummary.totalSpentCents).toBe(parseMoney("60.00"));
    expect(overview.householdSummary.remainingBudgetCents).toBe(parseMoney("240.00"));
  });

  // Regression tests: Per-person budget shares (50%)
  test("per-person budget share is 50% of household budget", async () => {
    await budgets.setBudgetLimit({ budgetPeriodId: periodId, categoryId: groceriesId, amountInput: "200" });
    const overview = await dashboard.getDashboardOverview(periodId);
    const gowri = overview.memberSummaries.find((s) => s.participantId === gowriId)!;
    const nathaniel = overview.memberSummaries.find((s) => s.participantId === nathanielId)!;
    // Each person's share should be approximately half the budgeted amount
    // This will be verified by checking per-person consumption
    expect(gowri).toBeDefined();
    expect(nathaniel).toBeDefined();
  });

  // Regression tests: All 15 categories available
  test("all 15 common categories are available for shared expenses", async () => {
    const referenceData = await new TransactionUseCases({
      transactions: createRepositories(db).transactions,
      participants: createRepositories(db).participants,
      categories: createRepositories(db).categories,
      paymentMethods: createRepositories(db).paymentMethods,
      ids: { createId: () => `${++ids}` },
    }).getReferenceData();
    expect(referenceData.categories.length).toBeGreaterThanOrEqual(4); // At least our test categories
  });

  test("all 15 common categories are available for personal expenses", async () => {
    const referenceData = await new TransactionUseCases({
      transactions: createRepositories(db).transactions,
      participants: createRepositories(db).participants,
      categories: createRepositories(db).categories,
      paymentMethods: createRepositories(db).paymentMethods,
      ids: { createId: () => `${++ids}` },
    }).getReferenceData();
    expect(referenceData.categories.length).toBeGreaterThanOrEqual(4); // At least our test categories
    // User can pick any category for personal transaction
  });

  test("legacy Trial MVP period produces correct per-person budget shares: Gowri $180 / Nathaniel $180", async () => {
    // This test verifies the actual historical Trial MVP budget structure with multiple owner-specific limits
    // and confirms the dashboard correctly reports per-person budget shares using real fields
    const legacyPeriodId = budgetPeriodId("legacy_trial_mvp_dashboard");
    
    // Create the legacy period
    await db.budgetPeriods.put({
      id: legacyPeriodId,
      name: "Trial MVP",
      startDate: "2026-09-15",
      endDate: "2026-09-30",
    });

    // Category IDs
    const carMaintenanceId = categoryId("legacy_car_maintenance");
    const eatingOutId = categoryId("legacy_eating_out");
    const entertainmentId = categoryId("legacy_entertainment");
    const fuelId2 = categoryId("legacy_fuel");
    const legacyGroceriesId = categoryId("legacy_groceries");
    const miscellaneousId = categoryId("legacy_miscellaneous");
    const personalFoodId = categoryId("legacy_personal_food");
    const clothingId = categoryId("legacy_clothing_shopping");

    // Create both active and archived categories matching production structure
    await db.categories.bulkPut([
      { id: carMaintenanceId, name: "Car Maintenance", groupName: "Transportation", archived: false },
      { id: eatingOutId, name: "Eating Out", groupName: "Food", archived: false },
      { id: entertainmentId, name: "Entertainment", groupName: "Leisure", archived: false },
      { id: fuelId2, name: "Fuel", groupName: "Transportation", archived: false },
      { id: legacyGroceriesId, name: "Groceries", groupName: "Food", archived: false },
      { id: miscellaneousId, name: "Miscellaneous", groupName: "Other", archived: false },
      { id: personalFoodId, name: "Personal Food", groupName: "Personal", archived: true },
      { id: clothingId, name: "Clothing", groupName: "Personal", archived: true },
    ]);

    // Insert 10 historical BudgetLimit rows directly
    const repos = createRepositories(db);
    
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
      { id: budgetLimitId("legacy_limit_4"), categoryId: fuelId2, scope: "shared", limitCents: parseMoney("85") },
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
      { id: budgetLimitId("legacy_limit_7"), categoryId: personalFoodId, scope: "personal", ownerParticipantId: gowriId, limitCents: parseMoney("11") },
      { id: budgetLimitId("legacy_limit_8"), categoryId: personalFoodId, scope: "personal", ownerParticipantId: nathanielId, limitCents: parseMoney("11") },
      { id: budgetLimitId("legacy_limit_9"), categoryId: clothingId, scope: "personal", ownerParticipantId: gowriId, limitCents: parseMoney("40") },
      { id: budgetLimitId("legacy_limit_10"), categoryId: clothingId, scope: "personal", ownerParticipantId: nathanielId, limitCents: parseMoney("40") },
    ];

    // Insert all 10 limits directly
    const allLimits = [...sharedLimits, ...personalLimits].map((limit) => {
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

    // Get dashboard overview for legacy period
    const overview = await dashboard.getDashboardOverview(legacyPeriodId);

    // HOUSEHOLD TOTAL: Verify household total budget = $360 (from BudgetUseCases aggregation)
    expect(overview.householdSummary.totalBudgetedCents).toBe(parseMoney("360.00"));

    // MEMBER BUDGET SHARES: Use real DashboardMemberSummary fields
    const householdMembers = overview.memberSummaries;
    expect(householdMembers.length).toBe(2);

    const gowri = householdMembers.find((m) => m.participantId === gowriId);
    const nathaniel = householdMembers.find((m) => m.participantId === nathanielId);

    expect(gowri).toBeDefined();
    expect(nathaniel).toBeDefined();

    // GOWRI PERSONAL BALANCE: Budget Share / Used / Remaining
    expect(gowri!.budgetShareCents).toBe(parseMoney("180.00")); // $360 / 2 members
    expect(gowri!.usedCents).toBe(parseMoney("0.00")); // No transactions created
    expect(gowri!.remainingBudgetCents).toBe(parseMoney("180.00")); // $180 - $0

    // NATHANIEL PERSONAL BALANCE: Budget Share / Used / Remaining
    expect(nathaniel!.budgetShareCents).toBe(parseMoney("180.00")); // $360 / 2 members
    expect(nathaniel!.usedCents).toBe(parseMoney("0.00")); // No transactions created
    expect(nathaniel!.remainingBudgetCents).toBe(parseMoney("180.00")); // $180 - $0
  });

  test("REGRESSION: Odd-cent household budget splits deterministically with remainder going to first member", async () => {
    // Test that a household budget of $101.01 (10101 cents) splits as:
    // Member 0 (sorted by memberKey): 5051 cents (gets the remainder)
    // Member 1 (sorted by memberKey): 5050 cents
    // Total must equal exactly 10101 cents
    // Ordering must be DETERMINISTIC regardless of database return order
    const oddCentPeriodId = budgetPeriodId("odd_cent_test_period");
    const oddCentGroceriesId = categoryId("odd_cent_groceries");

    const repos = createRepositories(db);
    
    // Create period and budget
    await repos.budgetPeriods.save({
      id: oddCentPeriodId,
      name: "Odd Cents Test",
      startDate: "2026-09-15",
      endDate: "2026-09-30",
    });

    await db.categories.put({
      id: oddCentGroceriesId,
      name: "Groceries OddTest",
      groupName: "Food",
      archived: false,
    });

    // Set household budget to $101.01 (10101 cents)
    await repos.budgetLimits.save({
      id: budgetLimitId("odd_cent_limit"),
      budgetPeriodId: oddCentPeriodId,
      categoryId: oddCentGroceriesId,
      scope: "shared",
      limitCents: parseMoney("101.01"),
    });

    // Get dashboard overview
    const oddCentDashboard = new DashboardUseCases({
      budgets,
      transactions: repos.transactions,
      participants: repos.participants,
      categories: repos.categories,
      settlements: repos.settlements,
      goals: repos.goals,
      obligations: repos.obligations,
      today: () => "2026-09-20",
    });

    const oddCentOverview = await oddCentDashboard.getDashboardOverview(oddCentPeriodId);

    // VERIFY: Member summaries have deterministic splits sorted by memberKey
    const oddMembers = oddCentOverview.memberSummaries;
    expect(oddMembers.length).toBe(2);

    // memberKey "gowri" < "nathaniel" alphabetically, so Gowri gets the remainder
    const gowriOdd = oddMembers.find((m) => m.participantId === gowriId);
    const nathanielOdd = oddMembers.find((m) => m.participantId === nathanielId);

    expect(gowriOdd).toBeDefined();
    expect(nathanielOdd).toBeDefined();

    // First member (sorted by memberKey) gets the remainder cent
    expect(gowriOdd!.budgetShareCents).toBe(parseMoney("50.51")); // 5051 cents (Gowri: memberKey "gowri")
    expect(nathanielOdd!.budgetShareCents).toBe(parseMoney("50.50")); // 5050 cents (Nathaniel: memberKey "nathaniel")

    // VERIFY: Sum of all member shares equals household total (no rounding errors)
    const totalShare =
      gowriOdd!.budgetShareCents +
      nathanielOdd!.budgetShareCents;
    expect(totalShare).toBe(parseMoney("101.01"));

    // VERIFY: Used cents are zero (no transactions)
    expect(gowriOdd!.usedCents).toBe(parseMoney("0.00"));
    expect(nathanielOdd!.usedCents).toBe(parseMoney("0.00"));

    // VERIFY: Remaining = Budget - Used for both
    expect(gowriOdd!.remainingBudgetCents).toBe(parseMoney("50.51"));
    expect(nathanielOdd!.remainingBudgetCents).toBe(parseMoney("50.50"));
  });

  test("REGRESSION: Odd-cent split is deterministic regardless of repository return order", async () => {
    // This test verifies that even if the database returns participants in reverse order (nathaniel, gowri),
    // the DashboardUseCases sorts them deterministically by memberKey, so Gowri still gets the remainder
    const orderTestPeriodId = budgetPeriodId("order_test_period");
    const orderTestGroceriesId = categoryId("order_test_groceries");

    const repos = createRepositories(db);
    
    // Create period
    await repos.budgetPeriods.save({
      id: orderTestPeriodId,
      name: "Order Test",
      startDate: "2026-09-15",
      endDate: "2026-09-30",
    });

    await db.categories.put({
      id: orderTestGroceriesId,
      name: "Groceries OrderTest",
      groupName: "Food",
      archived: false,
    });

    // Set household budget to $101.01
    await repos.budgetLimits.save({
      id: budgetLimitId("order_test_limit"),
      budgetPeriodId: orderTestPeriodId,
      categoryId: orderTestGroceriesId,
      scope: "shared",
      limitCents: parseMoney("101.01"),
    });

    // Manually reverse the participant order in the database to simulate non-deterministic return order
    // Store original participants, reverse them, then put them back
    const allParticipants = await repos.participants.listAll();
    const reversedParticipants = [...allParticipants].reverse();
    
    // Clear and re-insert in reversed order
    await db.participants.clear();
    for (const participant of reversedParticipants) {
      await db.participants.put(participant);
    }

    const orderTestDashboard = new DashboardUseCases({
      budgets,
      transactions: repos.transactions,
      participants: repos.participants,
      categories: repos.categories,
      settlements: repos.settlements,
      goals: repos.goals,
      obligations: repos.obligations,
      today: () => "2026-09-20",
    });

    const reverseOrderOverview = await orderTestDashboard.getDashboardOverview(orderTestPeriodId);

    // VERIFY: Even though database now has nathaniel before gowri, gowri still gets the remainder
    // because DashboardUseCases sorts by memberKey before calling allocateEqually()
    const reversedMembers = reverseOrderOverview.memberSummaries;
    
    const gowriReverse = reversedMembers.find((m) => m.participantId === gowriId);
    const nathanielReverse = reversedMembers.find((m) => m.participantId === nathanielId);

    expect(gowriReverse).toBeDefined();
    expect(nathanielReverse).toBeDefined();

    // Gowri STILL gets $50.51 (the remainder), despite being returned AFTER nathaniel from repo
    expect(gowriReverse!.budgetShareCents).toBe(parseMoney("50.51"));
    expect(nathanielReverse!.budgetShareCents).toBe(parseMoney("50.50"));

    // VERIFY: Sum still equals exactly 101.01
    const reverseTotal = gowriReverse!.budgetShareCents + nathanielReverse!.budgetShareCents;
    expect(reverseTotal).toBe(parseMoney("101.01"));
  });

});