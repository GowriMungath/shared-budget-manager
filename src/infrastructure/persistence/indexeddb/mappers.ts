import { cents } from "../../../domain/money/money.ts";
import { validateObligation } from "../../../domain/obligations/obligations.ts";
import {
  budgetLimitId,
  budgetPeriodId,
  categoryId,
  goalId,
  householdId,
  memberId,
  obligationId,
  participantId,
  paymentMethodId,
  settlementId,
  transactionId,
} from "../../../domain/shared/ids.ts";
import type {
  BudgetLimit,
  BudgetPeriod,
  Category,
  Goal,
  Household,
  Obligation,
  Participant,
  PaymentMethod,
} from "../../../domain/shared/types.ts";
import { validateSettlement, type Settlement } from "../../../domain/settlement/settlement.ts";
import { validateTransaction, type Allocation, type Transaction } from "../../../domain/ledger/transaction.ts";
import { PersistenceValidationError } from "./errors.ts";
import {
  allocationRecordSchema,
  budgetLimitRecordSchema,
  budgetPeriodRecordSchema,
  categoryRecordSchema,
  goalRecordSchema,
  householdRecordSchema,
  obligationRecordSchema,
  participantRecordSchema,
  paymentMethodRecordSchema,
  settlementRecordSchema,
  transactionRecordSchema,
  type AllocationRecord,
  type BudgetLimitRecord,
  type BudgetPeriodRecord,
  type CategoryRecord,
  type GoalRecord,
  type HouseholdRecord,
  type ObligationRecord,
  type ParticipantRecord,
  type PaymentMethodRecord,
  type SettlementRecord,
  type TransactionRecord,
} from "./schema.ts";

function parseRecord<T>(label: string, parser: { parse: (input: unknown) => T }, input: unknown): T {
  try {
    return parser.parse(input);
  } catch (error) {
    throw new PersistenceValidationError(`Invalid ${label} persisted data`, error);
  }
}

export const householdToRecord = (household: Household): HouseholdRecord => ({
  id: household.id,
  name: household.name,
  memberIds: household.memberIds,
});

export const householdFromRecord = (record: HouseholdRecord): Household => {
  const parsed = parseRecord("household", householdRecordSchema, record);
  return { id: householdId(parsed.id), name: parsed.name, memberIds: parsed.memberIds.map(memberId) };
};

export const participantToRecord = (participant: Participant): ParticipantRecord => ({ ...participant });
export const participantFromRecord = (record: ParticipantRecord): Participant => {
  const parsed = parseRecord("participant", participantRecordSchema, record);
  return { ...parsed, id: participantId(parsed.id) };
};

export const categoryToRecord = (category: Category): CategoryRecord => ({ ...category });
export const categoryFromRecord = (record: CategoryRecord): Category => {
  const parsed = parseRecord("category", categoryRecordSchema, record);
  return { ...parsed, id: categoryId(parsed.id) };
};

export const budgetPeriodToRecord = (period: BudgetPeriod): BudgetPeriodRecord => ({ ...period });
export const budgetPeriodFromRecord = (record: BudgetPeriodRecord): BudgetPeriod => {
  const parsed = parseRecord("budget period", budgetPeriodRecordSchema, record);
  return { ...parsed, id: budgetPeriodId(parsed.id) };
};

export const budgetLimitToRecord = (limit: BudgetLimit): BudgetLimitRecord => {
  const record = {
    ...limit,
    id: limit.id,
    budgetPeriodId: limit.budgetPeriodId,
    categoryId: limit.categoryId,
    ownerParticipantId: limit.ownerParticipantId,
  };
  return parseRecord("budget limit", budgetLimitRecordSchema, record);
};

export const budgetLimitFromRecord = (record: BudgetLimitRecord): BudgetLimit => {
  const parsed = parseRecord("budget limit", budgetLimitRecordSchema, record);
  return {
    ...parsed,
    id: budgetLimitId(parsed.id),
    budgetPeriodId: budgetPeriodId(parsed.budgetPeriodId),
    categoryId: categoryId(parsed.categoryId),
    ownerParticipantId: parsed.ownerParticipantId ? participantId(parsed.ownerParticipantId) : undefined,
    limitCents: cents(parsed.limitCents),
  };
};

export const transactionToRecord = (transaction: Transaction): TransactionRecord => {
  validateTransaction(transaction);
  return parseRecord("transaction", transactionRecordSchema, {
    id: transaction.id,
    kind: transaction.kind,
    date: transaction.date,
    description: transaction.description,
    totalCents: transaction.totalCents,
    categoryId: transaction.categoryId,
    payerParticipantId: transaction.payerParticipantId,
    scope: transaction.scope,
    paymentMethodId: transaction.paymentMethodId,
    notes: transaction.notes,
  });
};

export const allocationToRecord = (
  transaction: Transaction,
  allocation: Allocation,
  position: number,
): AllocationRecord =>
  parseRecord("allocation", allocationRecordSchema, {
    id: crypto.randomUUID(),
    transactionId: transaction.id,
    participantId: allocation.participantId,
    position,
    amountCents: allocation.amountCents,
  });

export function transactionFromRecords(record: TransactionRecord, allocations: readonly AllocationRecord[]): Transaction {
  const parsedTransaction = parseRecord("transaction", transactionRecordSchema, record);
  const parsedAllocations = allocations
    .map((allocation) => parseRecord("allocation", allocationRecordSchema, allocation))
    .sort((left, right) => left.position - right.position);
  const transaction: Transaction = {
    id: transactionId(parsedTransaction.id),
    kind: parsedTransaction.kind,
    date: parsedTransaction.date,
    description: parsedTransaction.description,
    totalCents: cents(parsedTransaction.totalCents),
    categoryId: categoryId(parsedTransaction.categoryId),
    payerParticipantId: participantId(parsedTransaction.payerParticipantId),
    scope: parsedTransaction.scope,
    allocations: parsedAllocations.map((allocation) => ({
      participantId: participantId(allocation.participantId),
      amountCents: cents(allocation.amountCents),
    })),
  };

  if (parsedTransaction.paymentMethodId) {
    transaction.paymentMethodId = paymentMethodId(parsedTransaction.paymentMethodId);
  }

  if (parsedTransaction.notes) {
    transaction.notes = parsedTransaction.notes;
  }

  validateTransaction(transaction);
  return transaction;
}

export const settlementToRecord = (settlement: Settlement): SettlementRecord => {
  validateSettlement(settlement);
  return parseRecord("settlement", settlementRecordSchema, settlement);
};

export const settlementFromRecord = (record: SettlementRecord): Settlement => {
  const parsed = parseRecord("settlement", settlementRecordSchema, record);
  const settlement: Settlement = {
    ...parsed,
    id: settlementId(parsed.id),
    fromParticipantId: participantId(parsed.fromParticipantId),
    toParticipantId: participantId(parsed.toParticipantId),
    amountCents: cents(parsed.amountCents),
  };
  validateSettlement(settlement);
  return settlement;
};

export const paymentMethodToRecord = (paymentMethod: PaymentMethod): PaymentMethodRecord => ({
  id: paymentMethod.id,
  name: paymentMethod.name,
  ownerParticipantId: paymentMethod.ownerParticipantId,
});

export const paymentMethodFromRecord = (record: PaymentMethodRecord): PaymentMethod => {
  const parsed = parseRecord("payment method", paymentMethodRecordSchema, record);
  return {
    id: paymentMethodId(parsed.id),
    name: parsed.name,
    ownerParticipantId: participantId(parsed.ownerParticipantId),
  };
};

export const goalToRecord = (goal: Goal): GoalRecord =>
  parseRecord("goal", goalRecordSchema, {
    id: goal.id,
    name: goal.name,
    ownerParticipantId: goal.ownerParticipantId,
    targetCents: goal.targetCents,
    currentSavedCents: goal.currentSavedCents,
    deadlineMonth: goal.deadlineMonth,
  });

export const goalFromRecord = (record: GoalRecord): Goal => {
  const parsed = parseRecord("goal", goalRecordSchema, record);
  return {
    id: goalId(parsed.id),
    name: parsed.name,
    ownerParticipantId: participantId(parsed.ownerParticipantId),
    targetCents: cents(parsed.targetCents),
    currentSavedCents: cents(parsed.currentSavedCents),
    deadlineMonth: parsed.deadlineMonth,
  };
};

export const obligationToRecord = (obligation: Obligation): ObligationRecord => {
  validateObligation(obligation);
  return parseRecord("obligation", obligationRecordSchema, obligation);
};

export const obligationFromRecord = (record: ObligationRecord): Obligation => {
  const parsed = parseRecord("obligation", obligationRecordSchema, record);
  const obligation: Obligation = {
    ...parsed,
    id: obligationId(parsed.id),
    ownerParticipantId: parsed.ownerParticipantId ? participantId(parsed.ownerParticipantId) : undefined,
    amountCents: cents(parsed.amountCents),
  };
  validateObligation(obligation);
  return obligation;
};
