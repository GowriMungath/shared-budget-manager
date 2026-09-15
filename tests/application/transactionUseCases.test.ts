import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { calculateExternalReceivables, calculateNetInternalBalance } from "../../src/domain/settlement/settlement.ts";
import { summarizeSpending } from "../../src/domain/ledger/transaction.ts";
import { parseMoney } from "../../src/domain/money/money.ts";
import { categoryId, participantId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
import type { IdService } from "../../src/application/services/idService.ts";
import { TransactionUseCases } from "../../src/application/use-cases/transactions/transactionUseCases.ts";
import type { TransactionDraft } from "../../src/application/use-cases/transactions/types.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../../src/infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../../src/infrastructure/persistence/indexeddb/repositories.ts";

let db: SharedBudgetManagerDatabase;
let useCases: TransactionUseCases;
let idCounter = 0;

const gowriId = participantId("app_gowri");
const nathanielId = participantId("app_nathaniel");
const friendAId = participantId("app_friend_a");
const friendBId = participantId("app_friend_b");
const shoppingCategoryId = categoryId("app_shopping");
const fuelCategoryId = categoryId("app_fuel");
const diningCategoryId = categoryId("app_dining");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
  { id: friendAId, name: "Friend A", kind: "external" },
  { id: friendBId, name: "Friend B", kind: "external" },
];

const ids: IdService = {
  createId: () => `app_generated_${++idCounter}`,
};

function baseDraft(): TransactionDraft {
  return {
    date: "2026-09-16",
    description: "Fuel",
    categoryId: fuelCategoryId,
    payerParticipantId: gowriId,
    scope: "shared",
    totalAmountInput: "40",
    splitMode: "EQUAL_HOUSEHOLD",
    allocations: [],
  };
}

beforeEach(async () => {
  idCounter = 0;
  db = createDatabase(`app_use_cases_${crypto.randomUUID()}`);
  await db.open();
  await db.participants.bulkPut(participants);
  await db.categories.bulkPut([
    { id: shoppingCategoryId, name: "Shopping", groupName: "Personal", scope: "personal", archived: false },
    { id: fuelCategoryId, name: "Fuel", groupName: "Shared", scope: "shared", archived: false },
    { id: diningCategoryId, name: "Dining", groupName: "Shared", scope: "shared", archived: false },
  ]);
  const repositories = createRepositories(db);
  useCases = new TransactionUseCases({
    transactions: repositories.transactions,
    participants: repositories.participants,
    categories: repositories.categories,
    paymentMethods: repositories.paymentMethods,
    ids,
  });
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("transaction use cases", () => {
  test("TEST 1 creates personal transaction owned and paid by Gowri", async () => {
    const created = await useCases.createTransaction({
      ...baseDraft(),
      description: "Shopping",
      categoryId: shoppingCategoryId,
      scope: "personal",
      totalAmountInput: "45",
      splitMode: "PERSONAL",
      personalOwnerParticipantId: gowriId,
    });

    expect(created.allocations).toEqual([{ participantId: gowriId, amountCents: parseMoney("45.00") }]);
  });

  test("TEST 2 payer may differ from personal owner and internal balance reflects it", async () => {
    const created = await useCases.createTransaction({
      ...baseDraft(),
      description: "Gowri personal",
      categoryId: shoppingCategoryId,
      payerParticipantId: nathanielId,
      scope: "personal",
      totalAmountInput: "30",
      splitMode: "PERSONAL",
      personalOwnerParticipantId: gowriId,
    });

    expect(calculateNetInternalBalance([created], [], [gowriId, nathanielId])).toEqual({
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("30.00"),
    });
  });

  test("TEST 3 creates shared 50/50 transaction", async () => {
    const created = await useCases.createTransaction(baseDraft());

    expect(created.allocations).toEqual([
      { participantId: gowriId, amountCents: parseMoney("20.00") },
      { participantId: nathanielId, amountCents: parseMoney("20.00") },
    ]);
  });

  test("TEST 4 creates custom amount transaction", async () => {
    const created = await useCases.createTransaction({
      ...baseDraft(),
      totalAmountInput: "75",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: gowriId, amountInput: "50" },
        { participantId: nathanielId, amountInput: "25" },
      ],
    });

    expect(created.allocations).toEqual([
      { participantId: gowriId, amountCents: parseMoney("50.00") },
      { participantId: nathanielId, amountCents: parseMoney("25.00") },
    ]);
  });

  test("TEST 5 creates deterministic custom percentage allocations", async () => {
    const created = await useCases.createTransaction({
      ...baseDraft(),
      totalAmountInput: "0.01",
      splitMode: "CUSTOM_PERCENTAGE",
      allocations: [
        { participantId: gowriId, percentageInput: "50" },
        { participantId: nathanielId, percentageInput: "50" },
      ],
    });

    expect(created.allocations).toEqual([
      { participantId: gowriId, amountCents: parseMoney("0.01") },
      { participantId: nathanielId, amountCents: parseMoney("0.00") },
    ]);
  });

  test("TEST 6 creates friend transaction with household spending and receivables", async () => {
    const created = await useCases.createTransaction({
      ...baseDraft(),
      description: "Dinner",
      categoryId: diningCategoryId,
      payerParticipantId: nathanielId,
      totalAmountInput: "120",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: gowriId, amountInput: "30" },
        { participantId: nathanielId, amountInput: "30" },
        { participantId: friendAId, amountInput: "30" },
        { participantId: friendBId, amountInput: "30" },
      ],
    });
    const spending = summarizeSpending([created], participants);
    const receivables = calculateExternalReceivables([created], [], participants);

    expect(spending.householdSpendingCents).toBe(parseMoney("60.00"));
    expect(spending.externalReceivableCents).toBe(parseMoney("60.00"));
    expect(receivables).toHaveLength(2);
  });

  test("TEST 7 rejects invalid allocation and persists nothing", async () => {
    await expect(
      useCases.createTransaction({
        ...baseDraft(),
        totalAmountInput: "40",
        splitMode: "CUSTOM_AMOUNT",
        allocations: [
          { participantId: gowriId, amountInput: "10" },
          { participantId: nathanielId, amountInput: "20" },
        ],
      }),
    ).rejects.toThrow(/Allocations must equal/);

    expect(await db.transactions.count()).toBe(0);
    expect(await db.allocations.count()).toBe(0);
  });

  test("TEST 8 edits transaction and replaces allocations", async () => {
    const created = await useCases.createTransaction(baseDraft());
    const updated = await useCases.updateTransaction(created.id, {
      ...baseDraft(),
      totalAmountInput: "50",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: gowriId, amountInput: "25" },
        { participantId: nathanielId, amountInput: "25" },
      ],
    });

    expect(updated.totalCents).toBe(parseMoney("50.00"));
    expect(await db.allocations.where("transactionId").equals(created.id).count()).toBe(2);
  });

  test("TEST 9 deletes transaction and allocations", async () => {
    const created = await useCases.createTransaction(baseDraft());

    await useCases.deleteTransaction(created.id);

    expect(await db.transactions.count()).toBe(0);
    expect(await db.allocations.where("transactionId").equals(created.id).count()).toBe(0);
  });
});
