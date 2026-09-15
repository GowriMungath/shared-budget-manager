import type {
  BudgetLimit,
  BudgetPeriod,
  BudgetScope,
  CategoryId,
  Cents,
  Participant,
  ParticipantId,
} from "../../../domain/shared/types.ts";

export type PaceStatus = "ON_TRACK" | "AHEAD_OF_PACE" | "OVER_BUDGET" | "UNBUDGETED";

export interface BudgetCategorySummary {
  categoryId: CategoryId;
  categoryName: string;
  groupName: string;
  scope: BudgetScope;
  ownerParticipantId?: ParticipantId;
  budgetLimitId?: BudgetLimit["id"];
  budgetedCents?: Cents;
  spentCents: Cents;
  remainingCents?: Cents;
  percentUsed?: number;
  periodPercentElapsed: number;
  paceStatus: PaceStatus;
  archived: boolean;
}

export interface BudgetSectionSummary {
  key: string;
  label: string;
  scope: BudgetScope;
  ownerParticipantId?: ParticipantId;
  totalBudgetedCents: Cents;
  totalSpentCents: Cents;
  totalRemainingCents: Cents;
  unbudgetedSpentCents: Cents;
  categories: BudgetCategorySummary[];
}

export interface BudgetOverview {
  period: BudgetPeriod;
  periods: BudgetPeriod[];
  householdMembers: Participant[];
  sections: BudgetSectionSummary[];
}

export interface SetBudgetLimitInput {
  budgetPeriodId: BudgetPeriod["id"];
  categoryId: CategoryId;
  scope: BudgetScope;
  ownerParticipantId?: ParticipantId;
  amountInput: string;
}

export interface CreateBudgetPeriodInput {
  name: string;
  startDate: string;
  endDate: string;
}

export interface CreateCategoryInput {
  name: string;
  scope: BudgetScope;
  groupName?: string;
}

export class BudgetApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetApplicationError";
  }
}
