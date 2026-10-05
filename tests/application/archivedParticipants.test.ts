import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseMoney } from "../../src/domain/money/money.ts";
import { categoryId, participantId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
import type { IdService } from "../../src/application/services/idService.ts";
import { PeopleUseCases } from "../../src/application/use-cases/people/peopleUseCases.ts";
import { TransactionUseCases } from "../../src/application/use-cases/transactions/transactionUseCases.ts";
import { calculateHouseholdBalance } from "../../src/application/use-cases/balances/balanceUseCases.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../../src/infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../../src/infrastructure/persistence/indexeddb/repositories.ts";
import { initializeDatabase } from "../../src/infrastructure/persistence/indexeddb/seed.ts";
import type { Settlement } from "../../src/domain/settlement/settlement.ts";

let db: SharedBudgetManagerDatabase;
let peopleUseCases: PeopleUseCases;
let transactionUseCases: TransactionUseCases;
let idCounter = 0;

const gowriId = participantId("archived_gowri");
const nathanielId = participantId("archived_nathaniel");
const testFriendId = participantId("archived_test_friend");
const groceriesId = categoryId("archived_groceries");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
  { id: testFriendId, name: "Test Friend", kind: "external" },
];

const ids: IdService = {
  createId: () => `archived_generated_${++idCounter}`,
};

beforeEach(async () => {
  db = await createDatabase();
  const repos = createRepositories(db);

  peopleUseCases = new PeopleUseCases({
    participants: repos.participants,
    settlements: repos.settlements,
    transactions: repos.transactions,
    ids,
  });

  transactionUseCases = new TransactionUseCases({
    transactions: repos.transactions,
    participants: repos.participants,
    categories: repos.categories,
    paymentMethods: repos.paymentMethods,
    ids,
  });

  // Seed participants
  for (const p of participants) {
    await repos.participants.save(p);
  }

  // Seed categories with required groupName
  const shoppingCategory = { id: groceriesId, name: "Groceries", archived: false, groupName: "Essentials" };
  await repos.categories.save(shoppingCategory);
});

afterEach(async () => {
  db.close();
});

describe("Archived Participants - Creation Form Filtering", () => {
  test("Archived external participant does NOT appear in transaction reference data", async () => {
    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // Get reference data (used by TransactionForm)
    const refData = await transactionUseCases.getReferenceData();

    // Test Friend should NOT be in externalParticipants
    expect(refData.externalParticipants.every((p) => p.id !== testFriendId)).toBe(true);
  });

  test("Active external participant DOES appear in transaction reference data", async () => {
    // Get reference data without archiving
    const refData = await transactionUseCases.getReferenceData();

    // Test Friend should be in externalParticipants
    expect(refData.externalParticipants).toHaveLength(1);
    expect(refData.externalParticipants[0]).toMatchObject({
      id: testFriendId,
      name: "Test Friend",
    });
  });

  test("listActiveExternalPeople() excludes archived, but listAllParticipants() includes them", async () => {
    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // For creation UIs (should exclude archived)
    const activePeople = await peopleUseCases.listActiveExternalPeople();
    expect(activePeople).toHaveLength(0);

    // For historical rendering (should include all)
    const allPeople = await peopleUseCases.listAllParticipants();
    expect(allPeople).toHaveLength(3);
    expect(allPeople.some((p) => p.id === testFriendId && p.archivedAt)).toBe(true);
  });
});

describe("Permanent Delete - Reference Checks", () => {
  test("Cannot permanently delete participant with settlement reference", async () => {
    const repos = createRepositories(db);

    // Create settlement with Test Friend as from
    const settlement: Settlement = {
      id: "settle_from_ref" as Settlement["id"],
      fromParticipantId: testFriendId,
      toParticipantId: gowriId,
      amountCents: parseMoney("50.00"),
      date: "2026-09-16",
      type: "external",
    };
    await repos.settlements.save(settlement);

    // Attempt to permanently delete Test Friend
    await expect(peopleUseCases.permanentlyDeleteParticipant(testFriendId)).rejects.toThrow(
      /has settlement history/i
    );
  });

  test("Can permanently delete unused external participant", async () => {
    // Create another external person with no references
    const unusedPerson: Participant = {
      id: participantId("archived_unused"),
      name: "Unused Friend",
      kind: "external",
    };

    const repos = createRepositories(db);
    await repos.participants.save(unusedPerson);

    // Permanently delete should succeed
    await expect(peopleUseCases.permanentlyDeleteParticipant(unusedPerson.id)).resolves.not.toThrow();

    // Participant should be gone
    const allAfter = await repos.participants.listAll();
    expect(allAfter.some((p) => p.id === unusedPerson.id)).toBe(false);
  });

  test("Cannot delete household members", async () => {
    // Attempt to permanently delete Gowri (household member)
    await expect(peopleUseCases.permanentlyDeleteParticipant(gowriId)).rejects.toThrow(
      /Cannot delete household members/i
    );
  });

  test("Cannot delete non-existent participant", async () => {
    const fakePerson = participantId("archived_fake");

    // Attempt to delete non-existent person
    await expect(peopleUseCases.permanentlyDeleteParticipant(fakePerson)).rejects.toThrow(
      /not found/i
    );
  });
});

describe("Archive Behavior", () => {
  test("Archive does not delete, only marks with archivedAt", async () => {
    const repos = createRepositories(db);

    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // Participant should still exist in listAll
    const archived = await repos.participants.getById(testFriendId);
    expect(archived).toBeDefined();
    expect(archived?.archivedAt).toBeDefined();
    expect(archived?.name).toBe("Test Friend");
  });

  test("Cannot archive household members", async () => {
    // Attempt to archive Gowri (household member)
    await expect(peopleUseCases.archiveParticipant(gowriId)).rejects.toThrow(
      /Cannot archive household members/i
    );
  });

  test("Can unarchive participant", async () => {
    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // Unarchive
    await peopleUseCases.unarchiveParticipant(testFriendId);

    // Should now appear in active list
    const activePeople = await peopleUseCases.listActiveExternalPeople();
    expect(activePeople.some((p) => p.id === testFriendId)).toBe(true);

    // archivedAt should be cleared
    const repos = createRepositories(db);
    const unarchived = await repos.participants.getById(testFriendId);
    expect(unarchived?.archivedAt).toBeUndefined();
  });
});

describe("Archived People Management", () => {
  test("Archived external participant appears in listAllParticipants but not in listActiveExternalPeople", async () => {
    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // Should appear in all participants
    const all = await peopleUseCases.listAllParticipants();
    expect(all.some((p) => p.id === testFriendId && p.archivedAt)).toBe(true);

    // Should NOT appear in active external people
    const active = await peopleUseCases.listActiveExternalPeople();
    expect(active.some((p) => p.id === testFriendId)).toBe(false);
  });

  test("Archived person can be restored", async () => {
    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // Verify archived
    const notActive = await peopleUseCases.listActiveExternalPeople();
    expect(notActive.some((p) => p.id === testFriendId)).toBe(false);

    // Restore
    await peopleUseCases.unarchiveParticipant(testFriendId);

    // Should now appear in active list
    const active = await peopleUseCases.listActiveExternalPeople();
    expect(active.some((p) => p.id === testFriendId)).toBe(true);
  });

  test("Unused archived person can be permanently deleted", async () => {
    const repos = createRepositories(db);

    // Create another external person with no references
    const unusedPerson: Participant = {
      id: participantId("archived_unused_no_refs"),
      name: "Unused Friend",
      kind: "external",
    };

    await repos.participants.save(unusedPerson);

    // Archive the unused person
    await peopleUseCases.archiveParticipant(unusedPerson.id);

    // Permanently delete should succeed
    await expect(peopleUseCases.permanentlyDeleteParticipant(unusedPerson.id)).resolves.not.toThrow();

    // Participant should be gone
    const allAfter = await repos.participants.listAll();
    expect(allAfter.some((p) => p.id === unusedPerson.id)).toBe(false);
  });

  test("Referenced archived person cannot be permanently deleted", async () => {
    const repos = createRepositories(db);

    // Create settlement with Test Friend as from
    const settlement: Settlement = {
      id: "settle_archived_ref" as Settlement["id"],
      fromParticipantId: testFriendId,
      toParticipantId: gowriId,
      amountCents: parseMoney("50.00"),
      date: "2026-09-16",
      type: "external",
    };
    await repos.settlements.save(settlement);

    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // Attempt to permanently delete should fail
    await expect(peopleUseCases.permanentlyDeleteParticipant(testFriendId)).rejects.toThrow(
      /has settlement history/i
    );
  });

  test("Archived person does not appear in transaction reference data", async () => {
    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // Get reference data (used by SettlementForm)
    const refData = await transactionUseCases.getReferenceData();

    // Test Friend should NOT be in externalParticipants
    expect(refData.externalParticipants.every((p) => p.id !== testFriendId)).toBe(true);
  });
});


describe("Regression: Archived participants in historical calculations", () => {
  let db: SharedBudgetManagerDatabase;
  let peopleUseCases: PeopleUseCases;
  let transactionUseCases: TransactionUseCases;
  let idCounter = 0;

  const gowriId = participantId("regr_gowri");
  const nathanielId = participantId("regr_nathaniel");
  const archiveTestFriendId = participantId("regr_archive_friend");
  const groceriesId = categoryId("regr_groceries");

  const participants: Participant[] = [
    { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
    { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
    { id: archiveTestFriendId, name: "Archive Test Friend", kind: "external" },
  ];

  const ids: IdService = {
    createId: () => `regr_generated_${++idCounter}`,
  };

  beforeEach(async () => {
    db = await createDatabase();
    const repos = createRepositories(db);

    peopleUseCases = new PeopleUseCases({
      participants: repos.participants,
      settlements: repos.settlements,
      transactions: repos.transactions,
      ids,
    });

    transactionUseCases = new TransactionUseCases({
      transactions: repos.transactions,
      participants: repos.participants,
      categories: repos.categories,
      paymentMethods: repos.paymentMethods,
      ids,
    });

    // Initialize database
    await initializeDatabase(db);

    // Create participants
    for (const p of participants) {
      await repos.participants.save(p);
    }
  });

  afterEach(async () => {
    db.close();
  });

  test("Archived payer in existing transaction does not crash balance calculation", async () => {
    // 1. Create a transaction with Test Friend as payer
    await transactionUseCases.createTransaction({
      date: "2026-09-20",
      description: "Dinner with archived friend",
      payerParticipantId: archiveTestFriendId,
      totalAmountInput: "90.00",
      categoryId: groceriesId,
      scope: "shared",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: gowriId, amountInput: "30.00" },
        { participantId: nathanielId, amountInput: "30.00" },
        { participantId: archiveTestFriendId, amountInput: "30.00" },
      ],
    });

    // 2. Archive the payer
    await peopleUseCases.archiveParticipant(archiveTestFriendId);

    // 3. Calculate household balance (should NOT crash with "Unknown payer")
    const balance = await peopleUseCases.getHouseholdBalance([gowriId, nathanielId]);

    // 4. Verify the calculation succeeded and shows external receivables
    expect(balance.external.length).toBeGreaterThan(0);
    expect(balance.external.some((r) => r.fromParticipantId === gowriId || r.fromParticipantId === nathanielId)).toBe(
      true
    );
  });

  test("Archived allocation owner in existing transaction does not crash", async () => {
    // 1. Create a transaction where Test Friend is in allocations
    await transactionUseCases.createTransaction({
      date: "2026-09-20",
      description: "Shared dinner",
      payerParticipantId: gowriId,
      totalAmountInput: "90.00",
      categoryId: groceriesId,
      scope: "shared",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: gowriId, amountInput: "30.00" },
        { participantId: nathanielId, amountInput: "30.00" },
        { participantId: archiveTestFriendId, amountInput: "30.00" },
      ],
    });

    // 2. Archive the allocation owner
    await peopleUseCases.archiveParticipant(archiveTestFriendId);

    // 3. Calculate household balance (should NOT crash with "Unknown participant")
    const balance = await peopleUseCases.getHouseholdBalance([gowriId, nathanielId]);

    // 4. Verify the calculation succeeded
    expect(balance).toBeDefined();
    expect(balance.external.length).toBeGreaterThan(0);
    const fromArchivedFriend = balance.external.find((r) => r.toParticipantId === gowriId);
    expect(fromArchivedFriend).toBeDefined();
    expect(fromArchivedFriend?.amountCents).toBe(parseMoney("30.00"));
  });

  test("Settlement with archived participant does not crash calculations", async () => {
    // 1. Create initial transaction where Gowri pays for archived friend
    await transactionUseCases.createTransaction({
      date: "2026-09-20",
      description: "Coffee",
      payerParticipantId: gowriId,
      totalAmountInput: "20.00",
      categoryId: groceriesId,
      scope: "shared",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: archiveTestFriendId, amountInput: "20.00" },
      ],
    });

    // 2. Create settlement: archived friend pays back Gowri
    await peopleUseCases.createSettlement({
      fromParticipantId: archiveTestFriendId,
      toParticipantId: gowriId,
      amountCents: parseMoney("20.00"),
      date: "2026-09-21",
    });

    // 3. Archive the friend
    await peopleUseCases.archiveParticipant(archiveTestFriendId);

    // 4. Calculate balance (should NOT crash with "Unknown participant")
    // This verifies the archived participant can be looked up when processing settlements
    const balance = await peopleUseCases.getHouseholdBalance([gowriId, nathanielId]);

    // 5. Verify the calculation succeeded (main point: no crash with archived participant)
    expect(balance).toBeDefined();
    // The key is that we can compute balance with archived participants involved
  });

  test("Dashboard can render with archived payer in transactions", async () => {
    // 1. Create transaction with archived friend as payer
    await transactionUseCases.createTransaction({
      date: "2026-09-20",
      description: "Lunch",
      payerParticipantId: archiveTestFriendId,
      totalAmountInput: "45.00",
      categoryId: groceriesId,
      scope: "shared",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: gowriId, amountInput: "45.00" },
      ],
    });

    // 2. Archive the payer
    await peopleUseCases.archiveParticipant(archiveTestFriendId);

    // 3. Get all participants and transactions (simulating dashboard data load)
    const allParticipants = await peopleUseCases.listAllParticipants();
    const allTransactions = await peopleUseCases.listAllTransactions();
    const allSettlements = await peopleUseCases.listSettlements();

    // 4. Calculate external receivables like dashboard does
    const { external } = calculateHouseholdBalance(
      [gowriId, nathanielId],
      allTransactions,
      allSettlements,
      allParticipants
    );

    // 5. Verify archived participant can be resolved
    expect(external.length).toBeGreaterThan(0);
    const receivable = external.find((r) => r.toParticipantId === gowriId);
    expect(receivable?.fromParticipantId).toBe(archiveTestFriendId);
  });
});

describe("Rename Participant Functionality", () => {
  test("Renaming external participant updates the participant UUID without creating new one", async () => {
    const repos = createRepositories(db);

    // Rename Test Friend
    const renamed = await peopleUseCases.renameParticipant(testFriendId, "Renamed Friend");

    // Same UUID
    expect(renamed.id).toBe(testFriendId);

    // Name updated
    expect(renamed.name).toBe("Renamed Friend");

    // Verify in database
    const fromDb = await repos.participants.getById(testFriendId);
    expect(fromDb?.name).toBe("Renamed Friend");
  });

  test("Renaming preserves archived status", async () => {
    // Archive Test Friend first
    await peopleUseCases.archiveParticipant(testFriendId);

    // Rename the archived person
    const renamed = await peopleUseCases.renameParticipant(testFriendId, "Renamed Archived Friend");

    // Should still be archived
    expect(renamed.archivedAt).toBeDefined();

    // Name updated
    expect(renamed.name).toBe("Renamed Archived Friend");
  });

  test("Renaming does not restore archived participant", async () => {
    // Archive Test Friend
    await peopleUseCases.archiveParticipant(testFriendId);

    // Verify archived
    let archived = await peopleUseCases.listActiveExternalPeople();
    expect(archived.some((p) => p.id === testFriendId)).toBe(false);

    // Rename the archived person
    await peopleUseCases.renameParticipant(testFriendId, "New Name");

    // Should still not be in active list
    archived = await peopleUseCases.listActiveExternalPeople();
    expect(archived.some((p) => p.id === testFriendId)).toBe(false);
  });

  test("Historical transaction resolves renamed participant by UUID", async () => {
    const repos = createRepositories(db);
    const renamedTestFriendId = participantId("regr_rename_txn_friend");
    const renamedGowriId = participantId("regr_rename_txn_gowri");
    const renameGroceriesId = categoryId("regr_rename_txn_groceries");

    // Set up fresh participants
    const participants2: Participant[] = [
      { id: renamedGowriId, name: "Gowri2", kind: "household-member", memberKey: "gowri2" },
      { id: renamedTestFriendId, name: "Test Friend 2", kind: "external" },
    ];

    for (const p of participants2) {
      await repos.participants.save(p);
    }

    const cat2 = { id: renameGroceriesId, name: "Groceries2", archived: false, groupName: "Essentials" };
    await repos.categories.save(cat2);

    // 1. Create transaction with Test Friend as payer
    await transactionUseCases.createTransaction({
      date: "2026-09-20",
      description: "Original name transaction",
      payerParticipantId: renamedTestFriendId,
      totalAmountInput: "50.00",
      categoryId: renameGroceriesId,
      scope: "shared",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: renamedGowriId, amountInput: "50.00" },
      ],
    });

    // 2. Rename Test Friend
    await peopleUseCases.renameParticipant(renamedTestFriendId, "Pihu");

    // 3. Load all participants for historical rendering
    const allParticipants = await peopleUseCases.listAllParticipants();
    const allTransactions = await peopleUseCases.listAllTransactions();

    // 4. Find the transaction we created (filter to our specific transaction)
    const ourTxn = allTransactions.find((t) => t.description === "Original name transaction");

    // 5. Verify transaction still references the renamed participant by UUID
    expect(ourTxn).toBeDefined();
    expect(ourTxn?.payerParticipantId).toBe(renamedTestFriendId);

    // 6. When rendering, we should resolve by UUID and get the new name
    const payer = allParticipants.find((p) => p.id === ourTxn?.payerParticipantId);
    expect(payer?.name).toBe("Pihu");
  });

  test("Historical allocation resolves renamed participant by UUID", async () => {
    const repos = createRepositories(db);
    const renamedTestFriendId = participantId("regr_rename_alloc_friend");
    const renamedGowriId = participantId("regr_rename_alloc_gowri");
    const renameGroceriesId = categoryId("regr_rename_alloc_groceries");

    // Set up fresh participants
    const participants2: Participant[] = [
      { id: renamedGowriId, name: "Gowri3", kind: "household-member", memberKey: "gowri3" },
      { id: renamedTestFriendId, name: "Test Friend 3", kind: "external" },
    ];

    for (const p of participants2) {
      await repos.participants.save(p);
    }

    const cat2 = { id: renameGroceriesId, name: "Groceries3", archived: false, groupName: "Essentials" };
    await repos.categories.save(cat2);

    // 1. Create transaction with Test Friend in allocations
    await transactionUseCases.createTransaction({
      date: "2026-09-20",
      description: "Transaction with external renamed",
      payerParticipantId: renamedGowriId,
      totalAmountInput: "50.00",
      categoryId: renameGroceriesId,
      scope: "shared",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: renamedTestFriendId, amountInput: "50.00" },
      ],
    });

    // 2. Rename Test Friend
    await peopleUseCases.renameParticipant(renamedTestFriendId, "Pihu");

    // 3. Load historical data
    const allParticipants = await peopleUseCases.listAllParticipants();
    const allTransactions = await peopleUseCases.listAllTransactions();

    // 4. Find our specific transaction
    const ourTxn = allTransactions.find((t) => t.description === "Transaction with external renamed");

    // 5. Verify allocation still references the renamed participant by UUID
    expect(ourTxn?.allocations[0].participantId).toBe(renamedTestFriendId);

    // 6. When rendering, we get the new name
    const participant = allParticipants.find((p) => p.id === ourTxn?.allocations[0].participantId);
    expect(participant?.name).toBe("Pihu");
  });

  test("Settlement history resolves renamed participant by UUID", async () => {
    // 1. Create settlement with Test Friend
    await peopleUseCases.createSettlement({
      fromParticipantId: testFriendId,
      toParticipantId: gowriId,
      amountCents: parseMoney("25.00"),
      date: "2026-09-21",
    });

    // 2. Rename Test Friend
    await peopleUseCases.renameParticipant(testFriendId, "Pihu");

    // 3. Load historical data
    const allParticipants = await peopleUseCases.listAllParticipants();
    const allSettlements = await peopleUseCases.listSettlements();

    // 4. Find our settlement
    const ourSettlement = allSettlements.find((s) => s.fromParticipantId === testFriendId && s.toParticipantId === gowriId && s.amountCents === parseMoney("25.00"));

    // 5. Verify settlement still references the renamed participant by UUID
    expect(ourSettlement?.fromParticipantId).toBe(testFriendId);

    // 6. When rendering, we get the new name
    const participant = allParticipants.find((p) => p.id === ourSettlement?.fromParticipantId);
    expect(participant?.name).toBe("Pihu");
  });

  test("Balance calculations resolve renamed participant correctly", async () => {
    const repos = createRepositories(db);
    const renamedTestFriendId = participantId("regr_rename_balance_friend");
    const renamedGowriId = participantId("regr_rename_balance_gowri");
    const renamedNathanielId = participantId("regr_rename_balance_nathaniel");
    const renameGroceriesId = categoryId("regr_rename_balance_groceries");

    // Set up fresh participants (need two household members for balance calculation)
    const participants2: Participant[] = [
      { id: renamedGowriId, name: "Gowri4", kind: "household-member", memberKey: "gowri4" },
      { id: renamedNathanielId, name: "Nathaniel4", kind: "household-member", memberKey: "nathaniel4" },
      { id: renamedTestFriendId, name: "Test Friend 4", kind: "external" },
    ];

    for (const p of participants2) {
      await repos.participants.save(p);
    }

    const cat2 = { id: renameGroceriesId, name: "Groceries4", archived: false, groupName: "Essentials" };
    await repos.categories.save(cat2);

    // 1. Create transaction with Test Friend as payer
    await transactionUseCases.createTransaction({
      date: "2026-09-20",
      description: "Original name balance transaction",
      payerParticipantId: renamedTestFriendId,
      totalAmountInput: "60.00",
      categoryId: renameGroceriesId,
      scope: "shared",
      splitMode: "CUSTOM_AMOUNT",
      allocations: [
        { participantId: renamedGowriId, amountInput: "30.00" },
        { participantId: renamedNathanielId, amountInput: "30.00" },
      ],
    });

    // 2. Rename Test Friend
    await peopleUseCases.renameParticipant(renamedTestFriendId, "Pihu");

    // 3. Load all data for balance calculation
    const allParticipants = await peopleUseCases.listAllParticipants();
    const allTransactions = await peopleUseCases.listAllTransactions();
    const allSettlements = await peopleUseCases.listSettlements();

    // 4. Calculate household balance (need both members)
    const { external } = calculateHouseholdBalance(
      [renamedGowriId, renamedNathanielId],
      allTransactions,
      allSettlements,
      allParticipants
    );

    // 5. Verify balance calculation succeeded and shows external receivable
    expect(external.length).toBeGreaterThan(0);

    // 6. Verify that renamed participant can be resolved
    const foundPayerName = external.some((r) => {
      const payerName = allParticipants.find((p) => p.id === r.fromParticipantId)?.name;
      return payerName === "Pihu";
    });
    expect(foundPayerName).toBe(true);
  });
});
