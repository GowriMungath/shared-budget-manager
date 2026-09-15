export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type HouseholdId = Brand<string, "HouseholdId">;
export type ParticipantId = Brand<string, "ParticipantId">;
export type MemberId = Brand<ParticipantId, "MemberId">;
export type CategoryId = Brand<string, "CategoryId">;
export type BudgetPeriodId = Brand<string, "BudgetPeriodId">;
export type BudgetLimitId = Brand<string, "BudgetLimitId">;
export type TransactionId = Brand<string, "TransactionId">;
export type SettlementId = Brand<string, "SettlementId">;
export type GoalId = Brand<string, "GoalId">;
export type ObligationId = Brand<string, "ObligationId">;
export type PaymentMethodId = Brand<string, "PaymentMethodId">;

export type MemberKey = string;
export type BudgetScope = "shared" | "personal";
export type ParticipantKind = "household-member" | "external";

export interface Household {
  id: HouseholdId;
  name: string;
  memberIds: MemberId[];
}

export interface Participant {
  id: ParticipantId;
  name: string;
  kind: ParticipantKind;
  memberKey?: MemberKey;
}

export interface Category {
  id: CategoryId;
  name: string;
  groupName: string;
  scope: BudgetScope;
  archived: boolean;
}

export interface BudgetPeriod {
  id: BudgetPeriodId;
  name: string;
  startDate: string;
  endDate: string;
}

export interface BudgetLimit {
  id: BudgetLimitId;
  budgetPeriodId: BudgetPeriodId;
  categoryId: CategoryId;
  scope: BudgetScope;
  ownerParticipantId?: ParticipantId;
  limitCents: Cents;
}

export interface PaymentMethod {
  id: PaymentMethodId;
  name: string;
  ownerParticipantId: ParticipantId;
}

export interface Goal {
  id: GoalId;
  name: string;
  ownerParticipantId: ParticipantId;
  targetCents: Cents;
  currentSavedCents: Cents;
  deadlineMonth: string;
}

export type ObligationOwnerScope = "shared" | "personal";
export type ObligationStatus = "pending" | "paid" | "cancelled";
export type ObligationType =
  | "credit_card_bill"
  | "travel"
  | "education"
  | "visa"
  | "utility"
  | "other";

export interface Obligation {
  id: ObligationId;
  ownerScope: ObligationOwnerScope;
  ownerParticipantId?: ParticipantId;
  description: string;
  amountCents: Cents;
  dueDate: string;
  status: ObligationStatus;
  type: ObligationType;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type Cents = number & { readonly __brand: "Cents" };
