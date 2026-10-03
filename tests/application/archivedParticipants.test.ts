import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseMoney } from "../../src/domain/money/money.ts";
import { categoryId, participantId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
import type { IdService } from "../../src/application/services/idService.ts";
import { PeopleUseCases } from "../../src/application/use-cases/people/peopleUseCases.ts";
import { TransactionUseCases } from "../../src/application/use-cases/transactions/transactionUseCases.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../../src/infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../../src/infrastructure/persistence/indexeddb/repositories.ts";
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
