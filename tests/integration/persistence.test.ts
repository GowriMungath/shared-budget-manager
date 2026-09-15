import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { calculateExternalReceivables } from "../../src/domain/settlement/settlement.ts";
import { cents, parseMoney } from "../../src/domain/money/money.ts";
import { validateObligation } from "../../src/domain/obligations/obligations.ts";
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
import type { BudgetLimit, Goal, Obligation, Participant } from "../../src/domain/shared/types.ts";
import type { Transaction } from "../../src/domain/ledger/transaction.ts";
import type { Settlement } from "../../src/domain/settlement/settlement.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../../src/infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../../src/infrastructure/persistence/indexeddb/repositories.ts";
import { initializeDatabase } from "../../src/infrastructure/persistence/indexeddb/seed.ts";
import { exportBackup, restoreBackup } from "../../src/infrastructure/persistence/indexeddb/backup.ts";

let db: SharedBudgetManagerDatabase;
let dbName: string;

const gowriId = participantId("test_gowri");
const nathanielId = participantId("test_nathaniel");
const friendAId = participantId("test_friend_a");
const friendBId = participantId("test_friend_b");
const fuelCategoryId = categoryId("test_fuel");
const groceriesCategoryId = categoryId("test_groceries");
const diningCategoryId = categoryId("test_dining");
const periodId = budgetPeriodId("test_period");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
  { id: friendAId, name: "Friend A", kind: "external" },
  { id: friendBId, name: "Friend B", kind: "external" },
];

function fuelTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: transactionId("test_fuel_transaction"),
    kind: "expense",
    date: "2026-09-16",
    description: "Fuel",
    totalCents: parseMoney("40.00"),
    categoryId: fuelCategoryId,
    payerParticipantId: gowriId,
    scope: "shared",
    allocations: [
      { participantId: gowriId, amountCents: parseMoney("20.00") },
      { participantId: nathanielId, amountCents: parseMoney("20.00") },
    ],
    ...overrides,
  };
}

function internalSettlement(): Settlement {
  return {
    id: settlementId("test_internal_settlement"),
    fromParticipantId: nathanielId,
    toParticipantId: gowriId,
    amountCents: parseMoney("20.00"),
    date: "2026-09-20",
    type: "internal",
  };
}

async function seedReferenceData() {
  await db.participants.bulkPut(participants);
  await db.categories.bulkPut([
    { id: fuelCategoryId, name: "Fuel", groupName: "Shared", scope: "shared", archived: false },
    { id: groceriesCategoryId, name: "Groceries", groupName: "Shared", scope: "shared", archived: false },
    { id: diningCategoryId, name: "Dining", groupName: "Shared", scope: "shared", archived: false },
  ]);
  await db.budgetPeriods.put({
    id: periodId,
    name: "Trial",
    startDate: "2026-09-15",
    endDate: "2026-09-30",
  });
}

beforeEach(async () => {
  dbName = `SharedBudgetManagerDB_test_${crypto.randomUUID()}`;
  db = createDatabase(dbName);
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("IndexedDB persistence", () => {
  test("TEST 1 - seed idempotency", async () => {
    await initializeDatabase(db);
    await initializeDatabase(db);

    expect(await db.households.count()).toBe(1);
    expect(await db.participants.where("memberKey").equals("gowri").count()).toBe(1);
    expect(await db.participants.where("memberKey").equals("nathaniel").count()).toBe(1);
    expect(await db.categories.count()).toBe(14);
    expect(await db.goals.count()).toBe(2);
  });

  test("TEST 2 - transaction persistence preserves transaction and allocations", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const original = fuelTransaction();

    await repos.transactions.create(original);

    const reloaded = await repos.transactions.getById(original.id);
    expect(reloaded).toEqual(original);
  });

  test("TEST 3 - invalid transaction is rejected atomically", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const invalid = fuelTransaction({
      totalCents: parseMoney("40.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("10.00") },
        { participantId: nathanielId, amountCents: parseMoney("20.00") },
      ],
    });

    await expect(repos.transactions.create(invalid)).rejects.toThrow(/must equal transaction total/);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.allocations.count()).toBe(0);
  });

  test("TEST 4 - updating a transaction replaces old allocations", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const original = fuelTransaction();
    const updated = fuelTransaction({
      totalCents: parseMoney("50.00"),
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("25.00") },
        { participantId: nathanielId, amountCents: parseMoney("25.00") },
      ],
    });

    await repos.transactions.create(original);
    await repos.transactions.update(updated);

    expect(await db.allocations.where("transactionId").equals(original.id).count()).toBe(2);
    expect(await repos.transactions.getById(original.id)).toEqual(updated);
  });

  test("TEST 5 - deleting a transaction removes associated allocations", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const original = fuelTransaction();

    await repos.transactions.create(original);
    await repos.transactions.delete(original.id);

    expect(await db.transactions.count()).toBe(0);
    expect(await db.allocations.count()).toBe(0);
  });

  test("TEST 6 - settlement persistence preserves identities and cents", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const settlement = internalSettlement();

    await repos.settlements.save(settlement);

    expect(await repos.settlements.listAll()).toEqual([settlement]);
  });

  test("TEST 7 - friend receivable data remains derivable after reload", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const dinner = fuelTransaction({
      id: transactionId("test_dinner"),
      description: "Dinner",
      totalCents: parseMoney("120.00"),
      categoryId: diningCategoryId,
      payerParticipantId: nathanielId,
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("30.00") },
        { participantId: nathanielId, amountCents: parseMoney("30.00") },
        { participantId: friendAId, amountCents: parseMoney("30.00") },
        { participantId: friendBId, amountCents: parseMoney("30.00") },
      ],
    });

    await repos.transactions.create(dinner);

    expect(calculateExternalReceivables(await repos.transactions.listAll(), [], participants)).toEqual([
      { fromParticipantId: friendAId, toParticipantId: nathanielId, amountCents: parseMoney("30.00") },
      { fromParticipantId: friendBId, toParticipantId: nathanielId, amountCents: parseMoney("30.00") },
    ]);
  });

  test("TEST 8 - budget persistence preserves cents and scope", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const limit: BudgetLimit = {
      id: budgetLimitId("test_shared_groceries_limit"),
      budgetPeriodId: periodId,
      categoryId: groceriesCategoryId,
      scope: "shared",
      limitCents: parseMoney("200.00"),
    };

    await repos.budgetLimits.save(limit);

    expect(await repos.budgetLimits.listForPeriod(periodId)).toEqual([limit]);
  });

  test("TEST 9 - goal persistence preserves planning envelope fields", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const goal: Goal = {
      id: goalId("test_tuition_goal"),
      name: "Gowri Tuition",
      ownerParticipantId: gowriId,
      targetCents: parseMoney("6500.00"),
      currentSavedCents: parseMoney("1200.00"),
      deadlineMonth: "2027-02",
    };

    await repos.goals.save(goal);

    expect(await repos.goals.listAll()).toEqual([goal]);
  });

  test("TEST 10 - obligation persistence preserves amount, owner, due date, type, and status", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const obligation: Obligation = {
      id: obligationId("test_visa_obligation"),
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

    validateObligation(obligation);
    await repos.obligations.save(obligation);

    expect(await repos.obligations.listAll()).toEqual([obligation]);
  });

  test("TEST 11 - backup round trip preserves domain-relevant records", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const transaction = fuelTransaction();
    const settlement = internalSettlement();
    const limit: BudgetLimit = {
      id: budgetLimitId("test_shared_groceries_limit"),
      budgetPeriodId: periodId,
      categoryId: groceriesCategoryId,
      scope: "shared",
      limitCents: parseMoney("200.00"),
    };

    await repos.transactions.create(transaction);
    await repos.settlements.save(settlement);
    await repos.budgetLimits.save(limit);
    await repos.goals.save({
      id: goalId("test_tuition_goal"),
      name: "Tuition",
      ownerParticipantId: gowriId,
      targetCents: parseMoney("6500.00"),
      currentSavedCents: cents(0),
      deadlineMonth: "2027-02",
    });

    const backup = await exportBackup(db);
    await db.transaction(
      "rw",
      [
        db.households,
        db.participants,
        db.categories,
        db.budgetPeriods,
        db.budgetLimits,
        db.transactions,
        db.allocations,
        db.settlements,
        db.paymentMethods,
        db.goals,
        db.obligations,
      ],
      async () => {
        await Promise.all([
          db.households.clear(),
          db.participants.clear(),
          db.categories.clear(),
          db.budgetPeriods.clear(),
          db.budgetLimits.clear(),
          db.transactions.clear(),
          db.allocations.clear(),
          db.settlements.clear(),
          db.paymentMethods.clear(),
          db.goals.clear(),
          db.obligations.clear(),
        ]);
      },
    );

    await restoreBackup(db, backup);

    expect(await repos.transactions.getById(transaction.id)).toEqual(transaction);
    expect(await repos.settlements.listAll()).toEqual([settlement]);
    expect(await repos.budgetLimits.listForPeriod(periodId)).toEqual([limit]);
  });

  test("TEST 12 - invalid backup is rejected and existing database remains unchanged", async () => {
    await seedReferenceData();
    const repos = createRepositories(db);
    const original = fuelTransaction();
    await repos.transactions.create(original);

    const unsupported = {
      schemaVersion: 999,
      exportedAt: new Date().toISOString(),
      data: {
        households: [],
        participants: [],
        categories: [],
        budgetPeriods: [],
        budgetLimits: [],
        transactions: [],
        allocations: [],
        settlements: [],
        paymentMethods: [],
        goals: [],
        obligations: [],
      },
    };

    await expect(restoreBackup(db, unsupported)).rejects.toThrow(/Unsupported backup schema version/);
    await expect(restoreBackup(db, { nope: true })).rejects.toThrow(/Invalid backup format/);
    expect(await repos.transactions.getById(original.id)).toEqual(original);
  });
});
