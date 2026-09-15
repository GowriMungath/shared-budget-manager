import { describe, expect, test } from "vitest";
import { allocateEqually, cents, parseMoney } from "../../src/domain/money/money.ts";
import { calculateBudgetUsage } from "../../src/domain/budget/budget.ts";
import { calculateGoalProgress } from "../../src/domain/goals/goals.ts";
import { validateObligation } from "../../src/domain/obligations/obligations.ts";
import { summarizeSpending, validateTransaction, type Transaction } from "../../src/domain/ledger/transaction.ts";
import {
  calculateExternalReceivables,
  calculateNetInternalBalance,
  validateSettlement,
  type Settlement,
} from "../../src/domain/settlement/settlement.ts";
import {
  budgetLimitId,
  budgetPeriodId,
  categoryId,
  goalId,
  obligationId,
  participantId,
  settlementId,
  transactionId,
} from "../../src/domain/shared/ids.ts";
import type { BudgetLimit, BudgetPeriod, Category, Goal, Obligation, Participant } from "../../src/domain/shared/types.ts";

const gowriId = participantId("participant_gowri");
const nathanielId = participantId("participant_nathaniel");
const friendAId = participantId("participant_friend_a");
const friendBId = participantId("participant_friend_b");
const friendCId = participantId("participant_friend_c");

const fuelCategoryId = categoryId("category_fuel");
const sharedGroceriesCategoryId = categoryId("category_shared_groceries");
const personalGroceriesCategoryId = categoryId("category_personal_groceries");
const diningCategoryId = categoryId("category_dining");
const shoppingCategoryId = categoryId("category_shopping");
const trialPeriodId = budgetPeriodId("period_2026_09_15_30");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
  { id: friendAId, name: "Friend A", kind: "external" },
  { id: friendBId, name: "Friend B", kind: "external" },
  { id: friendCId, name: "Friend C", kind: "external" },
];

const householdMemberIds = [gowriId, nathanielId];

const trialPeriod: BudgetPeriod = {
  id: trialPeriodId,
  name: "Trial MVP",
  startDate: "2026-09-15",
  endDate: "2026-09-30",
};

const sharedGroceriesLimit: BudgetLimit = {
  id: budgetLimitId("limit_shared_groceries"),
  budgetPeriodId: trialPeriodId,
  categoryId: sharedGroceriesCategoryId,
  scope: "shared",
  limitCents: parseMoney("200.00"),
};

const gowriPersonalGroceriesLimit: BudgetLimit = {
  id: budgetLimitId("limit_gowri_personal_groceries"),
  budgetPeriodId: trialPeriodId,
  categoryId: personalGroceriesCategoryId,
  scope: "personal",
  ownerParticipantId: gowriId,
  limitCents: parseMoney("100.00"),
};

const nathanielPersonalGroceriesLimit: BudgetLimit = {
  id: budgetLimitId("limit_nathaniel_personal_groceries"),
  budgetPeriodId: trialPeriodId,
  categoryId: personalGroceriesCategoryId,
  scope: "personal",
  ownerParticipantId: nathanielId,
  limitCents: parseMoney("100.00"),
};

const sharedDiningLimit: BudgetLimit = {
  id: budgetLimitId("limit_shared_dining"),
  budgetPeriodId: trialPeriodId,
  categoryId: diningCategoryId,
  scope: "shared",
  limitCents: parseMoney("200.00"),
};

const categories: Category[] = [
  { id: fuelCategoryId, name: "Fuel", groupName: "Transportation", scope: "shared", archived: false },
  { id: sharedGroceriesCategoryId, name: "Groceries", groupName: "Shared", scope: "shared", archived: false },
  {
    id: personalGroceriesCategoryId,
    name: "Groceries",
    groupName: "Personal",
    scope: "personal",
    archived: false,
  },
  { id: diningCategoryId, name: "Dining", groupName: "Food", scope: "shared", archived: false },
  { id: shoppingCategoryId, name: "Shopping", groupName: "Personal", scope: "personal", archived: false },
];

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: transactionId(`transaction_${Math.random().toString(36).slice(2)}`),
    kind: "expense",
    date: "2026-09-16",
    description: "Test transaction",
    totalCents: cents(1),
    categoryId: fuelCategoryId,
    payerParticipantId: gowriId,
    scope: "shared",
    allocations: [{ participantId: gowriId, amountCents: cents(1) }],
    ...overrides,
  };
}

function settlement(overrides: Partial<Settlement>): Settlement {
  return {
    id: settlementId(`settlement_${Math.random().toString(36).slice(2)}`),
    fromParticipantId: nathanielId,
    toParticipantId: gowriId,
    amountCents: cents(1),
    date: "2026-09-20",
    type: "internal",
    ...overrides,
  };
}

function budgetUsage(limit: BudgetLimit, transactions: Transaction[], period = trialPeriod) {
  return calculateBudgetUsage(limit, period, transactions, participants, householdMemberIds);
}

describe("financial acceptance scenarios", () => {
  test("TEST 1: $40 fuel paid by Gowri and split 50/50", () => {
    const fuel = transaction({
      description: "Fuel",
      totalCents: parseMoney("40.00"),
      payerParticipantId: gowriId,
      categoryId: fuelCategoryId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("20.00") },
        { participantId: nathanielId, amountCents: parseMoney("20.00") },
      ],
    });

    const spending = summarizeSpending([fuel], participants);
    const balance = calculateNetInternalBalance([fuel], [], householdMemberIds);

    expect(spending.memberSpendingCents.get(gowriId)).toBe(parseMoney("20.00"));
    expect(spending.memberSpendingCents.get(nathanielId)).toBe(parseMoney("20.00"));
    expect(spending.householdSpendingCents).toBe(parseMoney("40.00"));
    expect(balance).toEqual({
      fromParticipantId: nathanielId,
      toParticipantId: gowriId,
      amountCents: parseMoney("20.00"),
    });
  });

  test("TEST 2: $45 personal shopping paid by Gowri and allocated 100% to Gowri", () => {
    expect(categories.find((category) => category.id === shoppingCategoryId)?.scope).toBe("personal");

    const shopping = transaction({
      description: "Personal shopping",
      totalCents: parseMoney("45.00"),
      payerParticipantId: gowriId,
      categoryId: shoppingCategoryId,
      scope: "personal",
      allocations: [{ participantId: gowriId, amountCents: parseMoney("45.00") }],
    });

    const spending = summarizeSpending([shopping], participants);

    expect(spending.memberSpendingCents.get(gowriId)).toBe(parseMoney("45.00"));
    expect(spending.memberSpendingCents.get(nathanielId) ?? cents(0)).toBe(cents(0));
  });

  test("TEST 3 and friend budget rule: external allocations are receivables, not budget spending", () => {
    const dinner = transaction({
      description: "Dinner with friends",
      totalCents: parseMoney("120.00"),
      payerParticipantId: nathanielId,
      categoryId: diningCategoryId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("30.00") },
        { participantId: nathanielId, amountCents: parseMoney("30.00") },
        { participantId: friendAId, amountCents: parseMoney("30.00") },
        { participantId: friendBId, amountCents: parseMoney("30.00") },
      ],
    });

    const spending = summarizeSpending([dinner], participants);
    const balance = calculateNetInternalBalance([dinner], [], householdMemberIds);
    const receivables = calculateExternalReceivables([dinner], [], participants);
    const diningUsage = budgetUsage(sharedDiningLimit, [dinner]);

    expect(dinner.totalCents).toBe(parseMoney("120.00"));
    expect(spending.householdSpendingCents).toBe(parseMoney("60.00"));
    expect(diningUsage.spentCents).toBe(parseMoney("60.00"));
    expect(diningUsage.remainingCents).toBe(parseMoney("140.00"));
    expect(spending.externalReceivableCents).toBe(parseMoney("60.00"));
    expect(receivables).toEqual([
      { fromParticipantId: friendAId, toParticipantId: nathanielId, amountCents: parseMoney("30.00") },
      { fromParticipantId: friendBId, toParticipantId: nathanielId, amountCents: parseMoney("30.00") },
    ]);
    expect(balance).toEqual({
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("30.00"),
    });
  });

  test("TEST 4: external settlement decreases receivable without changing spending", () => {
    const dinner = transaction({
      totalCents: parseMoney("120.00"),
      payerParticipantId: nathanielId,
      categoryId: diningCategoryId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("30.00") },
        { participantId: nathanielId, amountCents: parseMoney("30.00") },
        { participantId: friendAId, amountCents: parseMoney("30.00") },
        { participantId: friendBId, amountCents: parseMoney("30.00") },
      ],
    });
    const friendRepayment = settlement({
      fromParticipantId: friendAId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("30.00"),
      type: "external",
    });

    const spending = summarizeSpending([dinner], participants);
    const receivables = calculateExternalReceivables([dinner], [friendRepayment], participants);

    expect(spending.householdSpendingCents).toBe(parseMoney("60.00"));
    expect(spending.externalReceivableCents).toBe(parseMoney("60.00"));
    expect(receivables).toEqual([
      { fromParticipantId: friendBId, toParticipantId: nathanielId, amountCents: parseMoney("30.00") },
    ]);
  });

  test("TEST 5: internal settlement decreases net balance without changing spending", () => {
    const fuel = transaction({
      totalCents: parseMoney("40.00"),
      payerParticipantId: gowriId,
      categoryId: fuelCategoryId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("20.00") },
        { participantId: nathanielId, amountCents: parseMoney("20.00") },
      ],
    });
    const internalSettlement = settlement({
      fromParticipantId: nathanielId,
      toParticipantId: gowriId,
      amountCents: parseMoney("20.00"),
      type: "internal",
    });

    const spending = summarizeSpending([fuel], participants);
    const balance = calculateNetInternalBalance([fuel], [internalSettlement], householdMemberIds);

    expect(spending.householdSpendingCents).toBe(parseMoney("40.00"));
    expect(balance).toEqual({ fromParticipantId: null, toParticipantId: null, amountCents: cents(0) });
  });

  test("TEST 6: transaction cannot be finalized when allocations do not equal total", () => {
    const invalid = transaction({
      totalCents: parseMoney("100.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("40.00") },
        { participantId: nathanielId, amountCents: parseMoney("40.00") },
      ],
    });

    expect(() => validateTransaction(invalid)).toThrow(/must equal transaction total/);
  });
});

describe("budget calculations", () => {
  test("required budget test: shared groceries budget recalculates after add, edit, and delete", () => {
    const groceries20 = transaction({
      totalCents: parseMoney("20.00"),
      payerParticipantId: gowriId,
      categoryId: sharedGroceriesCategoryId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("10.00") },
        { participantId: nathanielId, amountCents: parseMoney("10.00") },
      ],
    });
    const groceries35 = transaction({
      totalCents: parseMoney("35.00"),
      payerParticipantId: nathanielId,
      categoryId: sharedGroceriesCategoryId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("17.50") },
        { participantId: nathanielId, amountCents: parseMoney("17.50") },
      ],
    });

    expect(budgetUsage(sharedGroceriesLimit, [groceries20])).toEqual({
      budgetedCents: parseMoney("200.00"),
      spentCents: parseMoney("20.00"),
      remainingCents: parseMoney("180.00"),
    });
    expect(budgetUsage(sharedGroceriesLimit, [groceries20, groceries35])).toMatchObject({
      spentCents: parseMoney("55.00"),
      remainingCents: parseMoney("145.00"),
    });

    const editedGroceries20 = transaction({
      ...groceries20,
      totalCents: parseMoney("30.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("15.00") },
        { participantId: nathanielId, amountCents: parseMoney("15.00") },
      ],
    });

    expect(budgetUsage(sharedGroceriesLimit, [editedGroceries20, groceries35])).toMatchObject({
      spentCents: parseMoney("65.00"),
      remainingCents: parseMoney("135.00"),
    });
    expect(budgetUsage(sharedGroceriesLimit, [groceries35])).toMatchObject({
      spentCents: parseMoney("35.00"),
      remainingCents: parseMoney("165.00"),
    });
  });

  test("period boundaries are start/end inclusive and exclude following dates", () => {
    const start = transaction({
      date: "2026-09-15",
      totalCents: parseMoney("10.00"),
      categoryId: sharedGroceriesCategoryId,
      allocations: [{ participantId: gowriId, amountCents: parseMoney("10.00") }],
    });
    const end = transaction({
      date: "2026-09-30",
      totalCents: parseMoney("15.00"),
      categoryId: sharedGroceriesCategoryId,
      allocations: [{ participantId: nathanielId, amountCents: parseMoney("15.00") }],
    });
    const excluded = transaction({
      date: "2026-10-01",
      totalCents: parseMoney("99.00"),
      categoryId: sharedGroceriesCategoryId,
      allocations: [{ participantId: gowriId, amountCents: parseMoney("99.00") }],
    });

    expect(budgetUsage(sharedGroceriesLimit, [start, end, excluded])).toMatchObject({
      spentCents: parseMoney("25.00"),
      remainingCents: parseMoney("175.00"),
    });
  });

  test("invalid ISO date strings are rejected during boundary checks", () => {
    const invalidDate = transaction({
      date: "2026-09-31",
      categoryId: sharedGroceriesCategoryId,
      totalCents: parseMoney("10.00"),
      allocations: [{ participantId: gowriId, amountCents: parseMoney("10.00") }],
    });

    expect(() => budgetUsage(sharedGroceriesLimit, [invalidDate])).toThrow(/valid calendar date/);
  });

  test("scope isolation keeps shared and personal grocery budgets separate", () => {
    const sharedGrocery = transaction({
      totalCents: parseMoney("40.00"),
      payerParticipantId: gowriId,
      categoryId: sharedGroceriesCategoryId,
      scope: "shared",
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("20.00") },
        { participantId: nathanielId, amountCents: parseMoney("20.00") },
      ],
    });
    const gowriGrocery = transaction({
      totalCents: parseMoney("30.00"),
      payerParticipantId: gowriId,
      categoryId: personalGroceriesCategoryId,
      scope: "personal",
      allocations: [{ participantId: gowriId, amountCents: parseMoney("30.00") }],
    });

    expect(budgetUsage(sharedGroceriesLimit, [sharedGrocery])).toMatchObject({
      spentCents: parseMoney("40.00"),
    });
    expect(budgetUsage(gowriPersonalGroceriesLimit, [sharedGrocery])).toMatchObject({
      spentCents: cents(0),
    });
    expect(budgetUsage(nathanielPersonalGroceriesLimit, [sharedGrocery])).toMatchObject({
      spentCents: cents(0),
    });
    expect(budgetUsage(sharedGroceriesLimit, [gowriGrocery])).toMatchObject({
      spentCents: cents(0),
    });
    expect(budgetUsage(gowriPersonalGroceriesLimit, [gowriGrocery])).toMatchObject({
      spentCents: parseMoney("30.00"),
    });
    expect(budgetUsage(nathanielPersonalGroceriesLimit, [gowriGrocery])).toMatchObject({
      spentCents: cents(0),
    });
  });

  test("exact budget exhaustion and overspending preserve true remaining values", () => {
    const spent200 = transaction({
      totalCents: parseMoney("200.00"),
      categoryId: sharedGroceriesCategoryId,
      allocations: [{ participantId: gowriId, amountCents: parseMoney("200.00") }],
    });
    const spent220 = transaction({
      totalCents: parseMoney("220.00"),
      categoryId: sharedGroceriesCategoryId,
      allocations: [{ participantId: gowriId, amountCents: parseMoney("220.00") }],
    });

    expect(budgetUsage(sharedGroceriesLimit, [spent200])).toMatchObject({
      spentCents: parseMoney("200.00"),
      remainingCents: cents(0),
    });
    expect(budgetUsage(sharedGroceriesLimit, [spent220])).toMatchObject({
      spentCents: parseMoney("220.00"),
      remainingCents: parseMoney("-20.00"),
    });
  });
});

describe("settlement and receivables", () => {
  test("net internal balance reports one position after opposing shared payments", () => {
    const transactionA = transaction({
      totalCents: parseMoney("40.00"),
      payerParticipantId: gowriId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("20.00") },
        { participantId: nathanielId, amountCents: parseMoney("20.00") },
      ],
    });
    const transactionB = transaction({
      totalCents: parseMoney("60.00"),
      payerParticipantId: nathanielId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("30.00") },
        { participantId: nathanielId, amountCents: parseMoney("30.00") },
      ],
    });

    expect(calculateNetInternalBalance([transactionA, transactionB], [], householdMemberIds)).toEqual({
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("10.00"),
    });
  });

  test("different friends owing different household members remain individually identifiable", () => {
    const nathanielPaid = transaction({
      totalCents: parseMoney("90.00"),
      payerParticipantId: nathanielId,
      categoryId: diningCategoryId,
      allocations: [
        { participantId: nathanielId, amountCents: parseMoney("30.00") },
        { participantId: friendAId, amountCents: parseMoney("25.00") },
        { participantId: friendBId, amountCents: parseMoney("35.00") },
      ],
    });
    const gowriPaid = transaction({
      totalCents: parseMoney("45.00"),
      payerParticipantId: gowriId,
      categoryId: diningCategoryId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("15.00") },
        { participantId: friendCId, amountCents: parseMoney("30.00") },
      ],
    });

    expect(calculateExternalReceivables([nathanielPaid, gowriPaid], [], participants)).toEqual([
      { fromParticipantId: friendAId, toParticipantId: nathanielId, amountCents: parseMoney("25.00") },
      { fromParticipantId: friendBId, toParticipantId: nathanielId, amountCents: parseMoney("35.00") },
      { fromParticipantId: friendCId, toParticipantId: gowriId, amountCents: parseMoney("30.00") },
    ]);
  });
});

describe("money, validation, and goals", () => {
  test("equal split distributes indivisible cents deterministically in allocation order", () => {
    expect(allocateEqually(parseMoney("10.00"), 3)).toEqual([
      parseMoney("3.34"),
      parseMoney("3.33"),
      parseMoney("3.33"),
    ]);
    expect(allocateEqually(parseMoney("0.01"), 2)).toEqual([parseMoney("0.01"), parseMoney("0.00")]);
  });

  test("invalid money inputs are rejected instead of normalized", () => {
    expect(() => cents(Number.NaN)).toThrow(/safe integer cents/);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(/safe integer cents/);
    expect(() => cents(10.5)).toThrow(/safe integer cents/);
    expect(() =>
      validateTransaction(
        transaction({
          totalCents: parseMoney("-1.00"),
          allocations: [{ participantId: gowriId, amountCents: parseMoney("-1.00") }],
        }),
      ),
    ).toThrow(/Transaction total/);
    expect(() =>
      validateTransaction(
        transaction({
          totalCents: parseMoney("1.00"),
          allocations: [{ participantId: gowriId, amountCents: parseMoney("-1.00") }],
        }),
      ),
    ).toThrow(/Allocation amount/);
    expect(() => budgetUsage({ ...sharedGroceriesLimit, limitCents: parseMoney("-1.00") }, [])).toThrow(
      /Budget limit/,
    );
    expect(() =>
      validateSettlement(settlement({ amountCents: parseMoney("-1.00"), type: "external" })),
    ).toThrow(/Settlement amount/);
    expect(() =>
      calculateGoalProgress(
        {
          id: goalId("goal_invalid"),
          name: "Invalid",
          ownerParticipantId: gowriId,
          targetCents: parseMoney("-1.00"),
          currentSavedCents: cents(0),
          deadlineMonth: "2027-02",
        },
        5,
      ),
    ).toThrow(/Goal target/);
  });

  test("fully funded and overfunded goals never recommend negative contributions", () => {
    const fullyFunded: Goal = {
      id: goalId("goal_gowri_tuition"),
      name: "Gowri Tuition",
      ownerParticipantId: gowriId,
      targetCents: parseMoney("6500.00"),
      currentSavedCents: parseMoney("6500.00"),
      deadlineMonth: "2027-02",
    };
    const overfunded: Goal = {
      ...fullyFunded,
      id: goalId("goal_overfunded"),
      currentSavedCents: parseMoney("7000.00"),
    };

    expect(calculateGoalProgress(fullyFunded, 5)).toMatchObject({
      remainingCents: cents(0),
      suggestedMonthlyContributionCents: cents(0),
    });
    expect(calculateGoalProgress(overfunded, 5)).toMatchObject({
      remainingCents: cents(0),
      suggestedMonthlyContributionCents: cents(0),
    });
  });
});

describe("obligations", () => {
  const baseObligation: Obligation = {
    id: obligationId("obligation_visa"),
    ownerScope: "personal",
    ownerParticipantId: gowriId,
    description: "Visa renewal",
    amountCents: parseMoney("850.00"),
    dueDate: "2026-10-15",
    status: "pending",
    type: "visa",
    createdAt: "2026-09-15T12:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z",
  };

  test("validates minimal obligation ownership and money rules", () => {
    expect(() => validateObligation(baseObligation)).not.toThrow();
    expect(() => validateObligation({ ...baseObligation, amountCents: cents(0) })).toThrow(/Obligation amount/);
    expect(() => validateObligation({ ...baseObligation, ownerParticipantId: undefined })).toThrow(
      /Personal obligation requires ownerParticipantId/,
    );
    expect(() =>
      validateObligation({
        ...baseObligation,
        ownerScope: "shared",
      }),
    ).toThrow(/Shared obligation must not include ownerParticipantId/);
    expect(() =>
      validateObligation({
        ...baseObligation,
        ownerScope: "shared",
        ownerParticipantId: undefined,
      }),
    ).not.toThrow();
  });

  test("paid obligations remain planning records and do not create transactions", () => {
    const paid = { ...baseObligation, status: "paid" as const };

    expect(() => validateObligation(paid)).not.toThrow();
    expect("transactionId" in paid).toBe(false);
  });
});
