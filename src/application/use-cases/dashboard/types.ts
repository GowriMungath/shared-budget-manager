import type { BudgetOverview, PaceStatus } from "../budgets/types.ts";
import type { NetInternalBalance } from "../../../domain/settlement/settlement.ts";
import type {
  BudgetPeriod,
  BudgetPeriodId,
  BudgetScope,
  CategoryId,
  Cents,
  Goal,
  Obligation,
  ParticipantId,
} from "../../../domain/shared/types.ts";
import type { Transaction } from "../../../domain/ledger/transaction.ts";

export type AggregatePaceStatus = "NO_BUDGET_CONFIGURED" | "OVER_BUDGET" | "AHEAD_OF_PACE" | "ON_TRACK";

export interface DashboardHouseholdSummary {
  totalSpentCents: Cents;
  totalBudgetedCents: Cents;
  budgetedCategorySpentCents: Cents;
  remainingBudgetCents: Cents;
  unbudgetedSpentCents: Cents;
  sharedSpendingCents: Cents;
  personalSpendingCents: Cents;
}

export interface DashboardMemberSummary {
  participantId: ParticipantId;
  name: string;
  personalSpendingCents: Cents;
  sharedSpendingCents: Cents;
  totalEconomicShareCents: Cents;
}

export interface DashboardBudgetSummary {
  totalBudgetedCents: Cents;
  budgetedCategorySpentCents: Cents;
  remainingBudgetCents: Cents;
  usagePercent?: number;
  periodElapsedPercent: number;
  aggregatePaceStatus: AggregatePaceStatus;
  overview: BudgetOverview;
}

export interface DashboardAttentionCategory {
  categoryId: CategoryId;
  categoryName: string;
  sectionLabel: string;
  scope: BudgetScope;
  ownerParticipantId?: ParticipantId;
  budgetedCents?: Cents;
  spentCents: Cents;
  remainingCents?: Cents;
  percentUsed?: number;
  paceStatus: PaceStatus;
}

export interface DashboardNamedBalance {
  fromParticipantId: ParticipantId;
  fromName: string;
  toParticipantId: ParticipantId;
  toName: string;
  amountCents: Cents;
}

export interface DashboardRecentTransaction {
  transaction: Transaction;
  categoryName: string;
  payerName: string;
}

export interface DashboardGoalSummary {
  goal: Goal;
  ownerName: string;
  currentSavedCents: Cents;
  targetCents: Cents;
  remainingCents: Cents;
  percentCompleteBasisPoints: number;
  suggestedMonthlyContributionCents: Cents;
}

export interface DashboardObligationSummary {
  obligation: Obligation;
  ownerName: string;
}

export interface DashboardOverview {
  period: BudgetPeriod;
  periods: BudgetPeriod[];
  selectedBudgetPeriodId: BudgetPeriodId;
  householdSummary: DashboardHouseholdSummary;
  memberSummaries: DashboardMemberSummary[];
  budgetSummary: DashboardBudgetSummary;
  attentionCategories: DashboardAttentionCategory[];
  internalBalance: NetInternalBalance & {
    fromName?: string;
    toName?: string;
  };
  externalReceivables: DashboardNamedBalance[];
  recentTransactions: DashboardRecentTransaction[];
  goalsSummary: DashboardGoalSummary[];
  obligationsSummary: DashboardObligationSummary[];
}
