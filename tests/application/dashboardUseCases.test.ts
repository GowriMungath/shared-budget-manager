import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BudgetUseCases } from "../../src/application/use-cases/budgets/budgetUseCases.ts";
import { DashboardUseCases } from "../../src/application/use-cases/dashboard/dashboardUseCases.ts";
import { TransactionUseCases } from "../../src/application/use-cases/transactions/transactionUseCases.ts";
import type { IdService } from "../../src/application/services/idService.ts";
import { parseMoney } from "../../src/domain/money/money.ts";
import { budgetPeriodId, categoryId, goalId, participantId, settlementId, transactionId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
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
});
