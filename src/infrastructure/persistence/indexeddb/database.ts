import Dexie, { type Table } from "dexie";
import type {
  AllocationRecord,
  BudgetLimitRecord,
  BudgetPeriodRecord,
  CategoryRecord,
  GoalRecord,
  HouseholdRecord,
  ObligationRecord,
  ParticipantRecord,
  PaymentMethodRecord,
  SettlementRecord,
  TransactionRecord,
} from "./schema.ts";

export const DATABASE_NAME = "SharedBudgetManagerDB";
export const DATABASE_VERSION = 4;

export class SharedBudgetManagerDatabase extends Dexie {
  households!: Table<HouseholdRecord, string>;
  participants!: Table<ParticipantRecord, string>;
  categories!: Table<CategoryRecord, string>;
  budgetPeriods!: Table<BudgetPeriodRecord, string>;
  budgetLimits!: Table<BudgetLimitRecord, string>;
  transactions!: Table<TransactionRecord, string>;
  allocations!: Table<AllocationRecord, string>;
  settlements!: Table<SettlementRecord, string>;
  paymentMethods!: Table<PaymentMethodRecord, string>;
  goals!: Table<GoalRecord, string>;
  obligations!: Table<ObligationRecord, string>;

  constructor(name = DATABASE_NAME) {
    super(name);

    this.version(2).stores({
      households: "id",
      participants: "id, kind, memberKey",
      categories: "id, name, archived",
      budgetPeriods: "id, startDate, endDate",
      budgetLimits: "id, budgetPeriodId, categoryId, scope, ownerParticipantId",
      transactions: "id, date, categoryId, payerParticipantId, scope",
      allocations: "id, transactionId, participantId, position",
      settlements: "id, fromParticipantId, toParticipantId, date",
      paymentMethods: "id, ownerParticipantId",
      goals: "id, ownerParticipantId, deadlineMonth",
      obligations: "id, dueDate, status, ownerParticipantId",
    });

    // Version 3: Add archivedAt to participants for soft-delete support
    this.version(3)
      .stores({
        households: "id",
        participants: "id, kind, memberKey, archivedAt",
        categories: "id, name, archived",
        budgetPeriods: "id, startDate, endDate",
        budgetLimits: "id, budgetPeriodId, categoryId, scope, ownerParticipantId",
        transactions: "id, date, categoryId, payerParticipantId, scope",
        allocations: "id, transactionId, participantId, position",
        settlements: "id, fromParticipantId, toParticipantId, date",
        paymentMethods: "id, ownerParticipantId",
        goals: "id, ownerParticipantId, deadlineMonth",
        obligations: "id, dueDate, status, ownerParticipantId",
      })
      .upgrade(() => {
        // No data transformation needed - archivedAt is optional, defaults to undefined
        // All existing participants remain active (archivedAt undefined)
      });

    // Version 4: Add deletedAt to settlements for soft-delete support
    this.version(4)
      .stores({
        households: "id",
        participants: "id, kind, memberKey, archivedAt",
        categories: "id, name, archived",
        budgetPeriods: "id, startDate, endDate",
        budgetLimits: "id, budgetPeriodId, categoryId, scope, ownerParticipantId",
        transactions: "id, date, categoryId, payerParticipantId, scope",
        allocations: "id, transactionId, participantId, position",
        settlements: "id, fromParticipantId, toParticipantId, date, deletedAt",
        paymentMethods: "id, ownerParticipantId",
        goals: "id, ownerParticipantId, deadlineMonth",
        obligations: "id, dueDate, status, ownerParticipantId",
      })
      .upgrade(() => {
        // No data transformation needed - deletedAt is optional, defaults to undefined
        // All existing settlements remain active (deletedAt undefined)
      });
  }
}

export function createDatabase(name?: string): SharedBudgetManagerDatabase {
  return new SharedBudgetManagerDatabase(name);
}
