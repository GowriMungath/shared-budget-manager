import { periodElapsedPercent } from "../../../domain/budget/calendar.ts";
import { calculateGoalProgress } from "../../../domain/goals/goals.ts";
import { summarizeSpending, type Transaction } from "../../../domain/ledger/transaction.ts";
import { cents } from "../../../domain/money/money.ts";
import { calculateExternalReceivables, calculateNetInternalBalance } from "../../../domain/settlement/settlement.ts";
import type { BudgetPeriod, Cents, Participant, ParticipantId } from "../../../domain/shared/types.ts";
import type {
  CategoryRepository,
  GoalRepository,
  ObligationRepository,
  ParticipantRepository,
  SettlementRepository,
  TransactionRepository,
} from "../../ports/repositories.ts";
import { BudgetUseCases } from "../budgets/budgetUseCases.ts";
import type { BudgetSectionSummary, PaceStatus } from "../budgets/types.ts";
import type {
  AggregatePaceStatus,
  DashboardAttentionCategory,
  DashboardMemberSummary,
  DashboardNamedBalance,
  DashboardOverview,
} from "./types.ts";

export interface DashboardUseCaseDependencies {
  budgets: BudgetUseCases;
  transactions: TransactionRepository;
  participants: ParticipantRepository;
  categories: CategoryRepository;
  settlements: SettlementRepository;
  goals: GoalRepository;
  obligations: ObligationRepository;
  today?: () => string;
}

function isWithinPeriod(transaction: Transaction, period: BudgetPeriod): boolean {
  return transaction.date >= period.startDate && transaction.date <= period.endDate;
}

function selectRelevantPeriod(periods: readonly BudgetPeriod[], today: string): BudgetPeriod | undefined {
  const sorted = periods.slice().sort((left, right) => left.startDate.localeCompare(right.startDate));
  const current = sorted.find((period) => period.startDate <= today && today <= period.endDate);

  if (current) {
    return current;
  }

  const previous = sorted
    .filter((period) => period.startDate <= today)
    .sort((left, right) => right.endDate.localeCompare(left.endDate))[0];

  return previous ?? sorted.at(-1);
}

function memberName(participantsById: ReadonlyMap<ParticipantId, Participant>, participantId: ParticipantId): string {
  return participantsById.get(participantId)?.name ?? "Unknown participant";
}

function sumSectionBudgeted(sections: readonly BudgetSectionSummary[]): Cents {
  return cents(sections.reduce((sum, section) => sum + section.totalBudgetedCents, 0));
}

function budgetedCategorySpent(sections: readonly BudgetSectionSummary[]): Cents {
  return cents(
    sections.reduce(
      (sum, section) =>
        sum +
        section.categories.reduce(
          (sectionSum, category) => sectionSum + (category.budgetedCents !== undefined ? category.spentCents : 0),
          0,
        ),
      0,
    ),
  );
}

function unbudgetedSpent(sections: readonly BudgetSectionSummary[]): Cents {
  return cents(sections.reduce((sum, section) => sum + section.unbudgetedSpentCents, 0));
}

function aggregatePaceStatus(
  totalBudgetedCents: Cents,
  budgetedSpentCents: Cents,
  elapsedPercent: number,
): AggregatePaceStatus {
  if (totalBudgetedCents === 0) {
    return "NO_BUDGET_CONFIGURED";
  }

  if (budgetedSpentCents > totalBudgetedCents) {
    return "OVER_BUDGET";
  }

  if (budgetedSpentCents / totalBudgetedCents > elapsedPercent + 0.1) {
    return "AHEAD_OF_PACE";
  }

  return "ON_TRACK";
}

function attentionRank(status: PaceStatus): number {
  if (status === "OVER_BUDGET") return 0;
  if (status === "AHEAD_OF_PACE") return 1;
  if (status === "UNBUDGETED") return 2;
  return 3;
}

function attentionCategories(sections: readonly BudgetSectionSummary[]): DashboardAttentionCategory[] {
  return sections
    .flatMap((section) =>
      section.categories
        .filter((category) => !category.archived)
        .filter(
          (category) =>
            category.paceStatus === "OVER_BUDGET" ||
            category.paceStatus === "AHEAD_OF_PACE" ||
            (category.paceStatus === "UNBUDGETED" && category.spentCents > 0) ||
            (category.percentUsed ?? 0) >= 0.75,
        )
        .map((category) => ({
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          sectionLabel: section.label,
          scope: category.scope,
          ownerParticipantId: category.ownerParticipantId,
          budgetedCents: category.budgetedCents,
          spentCents: category.spentCents,
          remainingCents: category.remainingCents,
          percentUsed: category.percentUsed,
          paceStatus: category.paceStatus,
        })),
    )
    .sort((left, right) => {
      const rankDifference = attentionRank(left.paceStatus) - attentionRank(right.paceStatus);
      if (rankDifference !== 0) return rankDifference;
      return (right.percentUsed ?? (right.spentCents > 0 ? 1 : 0)) - (left.percentUsed ?? (left.spentCents > 0 ? 1 : 0));
    })
    .slice(0, 5);
}

function buildMemberSummaries(
  transactions: readonly Transaction[],
  householdMembers: readonly Participant[],
): DashboardMemberSummary[] {
  const memberIds = new Set(householdMembers.map((member) => member.id));
  const summaries = new Map<ParticipantId, { personal: number; shared: number }>();

  for (const member of householdMembers) {
    summaries.set(member.id, { personal: 0, shared: 0 });
  }

  for (const transaction of transactions) {
    for (const allocation of transaction.allocations) {
      if (!memberIds.has(allocation.participantId)) {
        continue;
      }

      const summary = summaries.get(allocation.participantId)!;
      if (transaction.scope === "shared") {
        summary.shared += allocation.amountCents;
      } else {
        summary.personal += allocation.amountCents;
      }
    }
  }

  return householdMembers.map((member) => {
    const summary = summaries.get(member.id) ?? { personal: 0, shared: 0 };
    return {
      participantId: member.id,
      name: member.name,
      personalSpendingCents: cents(summary.personal),
      sharedSpendingCents: cents(summary.shared),
      totalEconomicShareCents: cents(summary.personal + summary.shared),
    };
  });
}

function monthsUntilDeadline(deadlineMonth: string, today: string): number {
  const [deadlineYear, deadlineMonthNumber] = deadlineMonth.split("-").map(Number);
  const [todayYear, todayMonthNumber] = today.slice(0, 7).split("-").map(Number);
  const difference = (deadlineYear - todayYear) * 12 + (deadlineMonthNumber - todayMonthNumber);
  return Math.max(1, difference);
}

export class DashboardUseCases {
  constructor(private readonly dependencies: DashboardUseCaseDependencies) {}

  async getDashboardOverview(selectedBudgetPeriodId?: BudgetPeriod["id"]): Promise<DashboardOverview> {
    const today = this.dependencies.today?.() ?? new Date().toISOString().slice(0, 10);
    const periods = (await this.dependencies.budgets.getBudgetPeriods()).sort((left, right) =>
      left.startDate.localeCompare(right.startDate),
    );
    const selectedPeriod =
      periods.find((period) => period.id === selectedBudgetPeriodId) ?? selectRelevantPeriod(periods, today);

    if (!selectedPeriod) {
      throw new Error("No budget period exists");
    }

    const [budgetOverview, allTransactions, participants, categories, settlements, goals, obligations] =
      await Promise.all([
        this.dependencies.budgets.getBudgetOverview(selectedPeriod.id),
        this.dependencies.transactions.listAll(),
        this.dependencies.participants.listAll(),
        this.dependencies.categories.listAll(),
        this.dependencies.settlements.listAll(),
        this.dependencies.goals.listAll(),
        this.dependencies.obligations.listAll(),
      ]);
    const periodTransactions = allTransactions.filter((transaction) => isWithinPeriod(transaction, selectedPeriod));
    const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    const householdMembers = participants.filter((participant) => participant.kind === "household-member");
    const householdMemberIds = householdMembers.map((participant) => participant.id);
    const spendingSummary = summarizeSpending(periodTransactions, participants);
    const sharedSection = budgetOverview.sections.find((section) => section.scope === "shared");
    const personalSections = budgetOverview.sections.filter((section) => section.scope === "personal");
    const sharedSpending = sharedSection?.totalSpentCents ?? cents(0);
    const personalSpending = cents(personalSections.reduce((sum, section) => sum + section.totalSpentCents, 0));
    const totalBudgeted = sumSectionBudgeted(budgetOverview.sections);
    const budgetedSpent = budgetedCategorySpent(budgetOverview.sections);
    const remainingBudget = cents(totalBudgeted - budgetedSpent);
    const elapsedPercent = periodElapsedPercent(selectedPeriod, today);
    const internalBalance = calculateNetInternalBalance(allTransactions, settlements, householdMemberIds);
    const externalReceivables = calculateExternalReceivables(allTransactions, settlements, participants);

    return {
      period: selectedPeriod,
      periods,
      selectedBudgetPeriodId: selectedPeriod.id,
      householdSummary: {
        totalSpentCents: spendingSummary.householdSpendingCents,
        totalBudgetedCents: totalBudgeted,
        budgetedCategorySpentCents: budgetedSpent,
        remainingBudgetCents: remainingBudget,
        unbudgetedSpentCents: unbudgetedSpent(budgetOverview.sections),
        sharedSpendingCents: sharedSpending,
        personalSpendingCents: personalSpending,
      },
      memberSummaries: buildMemberSummaries(periodTransactions, householdMembers),
      budgetSummary: {
        totalBudgetedCents: totalBudgeted,
        budgetedCategorySpentCents: budgetedSpent,
        remainingBudgetCents: remainingBudget,
        usagePercent: totalBudgeted > 0 ? budgetedSpent / totalBudgeted : undefined,
        periodElapsedPercent: elapsedPercent,
        aggregatePaceStatus: aggregatePaceStatus(totalBudgeted, budgetedSpent, elapsedPercent),
        overview: budgetOverview,
      },
      attentionCategories: attentionCategories(budgetOverview.sections),
      internalBalance: {
        ...internalBalance,
        fromName: internalBalance.fromParticipantId
          ? memberName(participantsById, internalBalance.fromParticipantId)
          : undefined,
        toName: internalBalance.toParticipantId ? memberName(participantsById, internalBalance.toParticipantId) : undefined,
      },
      externalReceivables: externalReceivables.map(
        (receivable): DashboardNamedBalance => ({
          fromParticipantId: receivable.fromParticipantId,
          fromName: memberName(participantsById, receivable.fromParticipantId),
          toParticipantId: receivable.toParticipantId,
          toName: memberName(participantsById, receivable.toParticipantId),
          amountCents: receivable.amountCents,
        }),
      ),
      recentTransactions: periodTransactions
        .slice()
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, 8)
        .map((transaction) => ({
          transaction,
          categoryName: categoriesById.get(transaction.categoryId)?.name ?? "Unknown category",
          payerName: memberName(participantsById, transaction.payerParticipantId),
        })),
      goalsSummary: goals.map((goal) => {
        const progress = calculateGoalProgress(goal, monthsUntilDeadline(goal.deadlineMonth, today));
        return {
          goal,
          ownerName: memberName(participantsById, goal.ownerParticipantId),
          currentSavedCents: progress.currentSavedCents,
          targetCents: goal.targetCents,
          remainingCents: progress.remainingCents,
          percentCompleteBasisPoints: progress.percentCompleteBasisPoints,
          suggestedMonthlyContributionCents: progress.suggestedMonthlyContributionCents,
        };
      }),
      obligationsSummary: obligations
        .filter((obligation) => obligation.status === "pending" && obligation.dueDate >= today)
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
        .slice(0, 5)
        .map((obligation) => ({
          obligation,
          ownerName:
            obligation.ownerScope === "shared"
              ? "Shared"
              : obligation.ownerParticipantId
                ? memberName(participantsById, obligation.ownerParticipantId)
                : "Unknown participant",
        })),
    };
  }
}
