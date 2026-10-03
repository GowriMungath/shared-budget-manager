import "fake-indexeddb/auto";
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { DashboardUseCases } from "../../src/application/use-cases/dashboard/dashboardUseCases.ts";
import { PeopleUseCases } from "../../src/application/use-cases/people/peopleUseCases.ts";
import { BudgetUseCases } from "../../src/application/use-cases/budgets/budgetUseCases.ts";
import { parseMoney } from "../../src/domain/money/money.ts";
import {
  budgetPeriodId,
  categoryId,
  participantId,
  transactionId,
} from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../../src/infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../../src/infrastructure/persistence/indexeddb/repositories.ts";
import type { IdService } from "../../src/application/services/idService.ts";

let db: SharedBudgetManagerDatabase;
let dashboard: DashboardUseCases;
let people: PeopleUseCases;
let ids = 0;

const gowriId = participantId("september_gowri");
const nathanielId = participantId("september_nathaniel");
const periodId = budgetPeriodId("september_period");
const groceriesId = categoryId("september_groceries");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
];

const idService: IdService = { createId: () => `september_generated_${++ids}` };

beforeEach(async () => {
  ids = 0;
  db = createDatabase(`september_settlement_${crypto.randomUUID()}`);
  await db.open();
  await db.participants.bulkPut(participants);
  await db.categories.bulkPut([
    { id: groceriesId, name: "Groceries", groupName: "Shared", archived: false },
  ]);
  await db.budgetPeriods.put({
    id: periodId,
    name: "September",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });

  const repos = createRepositories(db);
  const budgets = new BudgetUseCases({
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

  people = new PeopleUseCases({
    participants: repos.participants,
    settlements: repos.settlements,
    transactions: repos.transactions,
    ids: idService,
    today: () => "2026-09-20",
  });
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("Acceptance: September $57.32 Settlement Scenario", () => {
  test("Gowri owes Nathaniel $57.32, after settlement they are settled up", async () => {
    const repos = createRepositories(db);

    // Create transaction: Nathaniel pays $57.32 for Gowri (creates debt)
    await repos.transactions.create({
      id: transactionId("september_txn"),
      kind: "expense",
      date: "2026-09-15",
      description: "September settlement scenario",
      totalCents: parseMoney("57.32"),
      categoryId: groceriesId,
      payerParticipantId: nathanielId,
      scope: "shared",
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("57.32") },
        { participantId: nathanielId, amountCents: parseMoney("0.00") },
      ],
    });

    // Verify Gowri owes Nathaniel $57.32 BEFORE settlement
    let overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.internalBalance.amountCents).toBe(parseMoney("57.32"));
    expect(overview.internalBalance.fromName).toBe("Gowri");
    expect(overview.internalBalance.toName).toBe("Nathaniel");

    // Record settlement: Gowri pays Nathaniel $57.32
    const settlement = await people.createSettlement({
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("57.32"),
      date: "2026-09-20",
      notes: "September settlement",
    });

    // Verify settlement was created
    expect(settlement).toBeDefined();
    expect(settlement.type).toBe("internal"); // Both are household members
    expect(settlement.amountCents).toBe(parseMoney("57.32"));

    // Verify balance is now ZERO (settled up)
    overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.internalBalance.amountCents).toBe(parseMoney("0.00"));

    // Verify spending totals remain unchanged (settlement doesn't affect them)
    expect(overview.householdSummary.totalSpentCents).toBe(parseMoney("57.32"));

    // Verify budgets unchanged
    expect(overview.householdSummary.totalBudgetedCents).toBe(parseMoney("0.00")); // No budget set
  });

  test("Settlement type is DERIVED as 'internal' (not user-controlled)", async () => {
    // User cannot specify settlement.type directly
    // It must be derived from participant kinds

    // Both are household members → internal
    const internalSettlement = await people.createSettlement({
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("57.32"),
      date: "2026-09-20",
    });

    expect(internalSettlement.type).toBe("internal");
  });
});

describe("Acceptance: $42.13 Group Outing Scenario", () => {
  test("Nathaniel pays $42.13 with mixed household and external allocations", async () => {
    const repos = createRepositories(db);

    // Create Pihu and Subi as external people
    const pihuId = participantId("september_pihu");
    const subiId = participantId("september_subi");

    await repos.participants.save({
      id: pihuId,
      name: "Pihu",
      kind: "external",
    });

    await repos.participants.save({
      id: subiId,
      name: "Subi",
      kind: "external",
    });

    // Create transaction: Nathaniel pays $42.13
    // Allocations: Gowri $9.90, Nathaniel $9.90, Pihu $9.42, Subi $12.91
    await repos.transactions.create({
      id: transactionId("group_outing"),
      kind: "expense",
      date: "2026-09-16",
      description: "Group outing",
      totalCents: parseMoney("42.13"),
      categoryId: groceriesId,
      payerParticipantId: nathanielId,
      scope: "shared",
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("9.90") },
        { participantId: nathanielId, amountCents: parseMoney("9.90") },
        { participantId: pihuId, amountCents: parseMoney("9.42") },
        { participantId: subiId, amountCents: parseMoney("12.91") },
      ],
    });

    // Verify household balance (Gowri owes Nathaniel $9.90)
    const overview = await dashboard.getDashboardOverview(periodId);
    expect(overview.internalBalance.amountCents).toBe(parseMoney("9.90"));
    expect(overview.internalBalance.fromName).toBe("Gowri");
    expect(overview.internalBalance.toName).toBe("Nathaniel");

    // Verify external receivables
    const receivables = overview.externalReceivables.sort((a, b) =>
      a.amountCents - b.amountCents
    );

    expect(receivables).toHaveLength(2);
    expect(receivables[0]).toMatchObject({
      fromName: "Pihu",
      toName: "Nathaniel",
      amountCents: parseMoney("9.42"),
    });
    expect(receivables[1]).toMatchObject({
      fromName: "Subi",
      toName: "Nathaniel",
      amountCents: parseMoney("12.91"),
    });

    // Verify household budget usage = $19.80 (only household members)
    expect(overview.householdSummary.totalSpentCents).toBe(parseMoney("19.80"));

    // Verify member summaries
    const gowri = overview.memberSummaries.find((m) => m.participantId === gowriId);
    const nathaniel = overview.memberSummaries.find((m) => m.participantId === nathanielId);

    expect(gowri?.usedCents).toBe(parseMoney("9.90"));
    expect(nathaniel?.usedCents).toBe(parseMoney("9.90"));
  });
});

describe("Acceptance: External Payer Support", () => {
  test("External person (Pihu) pays $30 to household members", async () => {
    const repos = createRepositories(db);

    const pihuId = participantId("september_pihu_payer");
    await repos.participants.save({
      id: pihuId,
      name: "Pihu",
      kind: "external",
    });

    // Pihu (external) pays $30: Pihu $10, Gowri $10, Nathaniel $10
    // Expected: Gowri owes Pihu $10, Nathaniel owes Pihu $10
    await repos.transactions.create({
      id: transactionId("external_payer"),
      kind: "expense",
      date: "2026-09-17",
      description: "Pihu pays",
      totalCents: parseMoney("30.00"),
      categoryId: groceriesId,
      payerParticipantId: pihuId,
      scope: "shared",
      allocations: [
        { participantId: pihuId, amountCents: parseMoney("10.00") },
        { participantId: gowriId, amountCents: parseMoney("10.00") },
        { participantId: nathanielId, amountCents: parseMoney("10.00") },
      ],
    });

    // Verify external receivables are calculated correctly
    const overview = await dashboard.getDashboardOverview(periodId);

    // External receivables: Gowri owes Pihu $10, Nathaniel owes Pihu $10
    const receivables = overview.externalReceivables.sort((a, b) =>
      a.fromName.localeCompare(b.fromName)
    );
    expect(receivables).toHaveLength(2);
    expect(receivables[0]).toMatchObject({
      fromName: "Gowri",
      toName: "Pihu",
      amountCents: parseMoney("10.00"),
    });
    expect(receivables[1]).toMatchObject({
      fromName: "Nathaniel",
      toName: "Pihu",
      amountCents: parseMoney("10.00"),
    });

    // Verify household budget usage = $20 (only household members)
    // Pihu is external, so Pihu's $10 allocation doesn't count toward household budget
    expect(overview.householdSummary.totalSpentCents).toBe(parseMoney("20.00"));
  });

  test("Household payer with external people allocations", async () => {
    const repos = createRepositories(db);

    const pihuId = participantId("september_pihu_household_payer");
    const subiId = participantId("september_subi_household_payer");
    await repos.participants.save({
      id: pihuId,
      name: "Pihu",
      kind: "external",
    });
    await repos.participants.save({
      id: subiId,
      name: "Subi",
      kind: "external",
    });

    // Nathaniel (household) pays $42.13
    // Gowri $9.90, Nathaniel $9.90, Pihu $9.42, Subi $12.91
    await repos.transactions.create({
      id: transactionId("household_payer_external"),
      kind: "expense",
      date: "2026-09-18",
      description: "Group outing",
      totalCents: parseMoney("42.13"),
      categoryId: groceriesId,
      payerParticipantId: nathanielId,
      scope: "shared",
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("9.90") },
        { participantId: nathanielId, amountCents: parseMoney("9.90") },
        { participantId: pihuId, amountCents: parseMoney("9.42") },
        { participantId: subiId, amountCents: parseMoney("12.91") },
      ],
    });

    const overview = await dashboard.getDashboardOverview(periodId);

    // Internal: Gowri owes Nathaniel $9.90
    expect(overview.internalBalance.amountCents).toBe(parseMoney("9.90"));
    expect(overview.internalBalance.fromName).toBe("Gowri");
    expect(overview.internalBalance.toName).toBe("Nathaniel");

    // External: Pihu owes Nathaniel $9.42, Subi owes Nathaniel $12.91
    const receivables = overview.externalReceivables.sort((a, b) =>
      a.fromName.localeCompare(b.fromName)
    );
    expect(receivables).toHaveLength(2);
    expect(receivables[0]).toMatchObject({
      fromName: "Pihu",
      toName: "Nathaniel",
      amountCents: parseMoney("9.42"),
    });
    expect(receivables[1]).toMatchObject({
      fromName: "Subi",
      toName: "Nathaniel",
      amountCents: parseMoney("12.91"),
    });

    // Budget: $19.80 (only Gowri + Nathaniel)
    expect(overview.householdSummary.totalSpentCents).toBe(parseMoney("19.80"));
  });
});
