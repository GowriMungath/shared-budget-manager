import type {
  BudgetLimitId,
  BudgetPeriodId,
  CategoryId,
  GoalId,
  HouseholdId,
  MemberId,
  ObligationId,
  ParticipantId,
  PaymentMethodId,
  SettlementId,
  TransactionId,
} from "./types.ts";

export const householdId = (value: string) => value as HouseholdId;
export const participantId = (value: string) => value as ParticipantId;
export const memberId = (value: string) => value as MemberId;
export const categoryId = (value: string) => value as CategoryId;
export const budgetPeriodId = (value: string) => value as BudgetPeriodId;
export const budgetLimitId = (value: string) => value as BudgetLimitId;
export const transactionId = (value: string) => value as TransactionId;
export const settlementId = (value: string) => value as SettlementId;
export const goalId = (value: string) => value as GoalId;
export const obligationId = (value: string) => value as ObligationId;
export const paymentMethodId = (value: string) => value as PaymentMethodId;
