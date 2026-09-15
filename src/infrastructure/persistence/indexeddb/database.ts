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
export const DATABASE_VERSION = 1;

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

    this.version(DATABASE_VERSION).stores({
      households: "id",
      participants: "id, kind, memberKey",
      categories: "id, scope, archived",
      budgetPeriods: "id, startDate, endDate",
      budgetLimits: "id, budgetPeriodId, categoryId, scope, ownerParticipantId",
      transactions: "id, date, categoryId, payerParticipantId",
      allocations: "id, transactionId, participantId, position",
      settlements: "id, fromParticipantId, toParticipantId, date",
      paymentMethods: "id, ownerParticipantId",
      goals: "id, ownerParticipantId, deadlineMonth",
      obligations: "id, dueDate, status, ownerParticipantId",
    });
  }
}

export function createDatabase(name?: string): SharedBudgetManagerDatabase {
  return new SharedBudgetManagerDatabase(name);
}
