import { periodElapsedPercent } from "../../../domain/budget/calendar.ts";
import { calculateGoalProgress } from "../../../domain/goals/goals.ts";
import { summarizeSpending, type Transaction } from "../../../domain/ledger/transaction.ts";
import { allocateEqually, cents } from "../../../domain/money/money.ts";
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
import { sessionCache } from "../../../infrastructure/cache/sessionCache.ts";
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
  totalHouseholdBudgetCents: Cents,
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

  // Calculate per-member budget share using deterministic allocation
  const memberCount = householdMembers.length;
  const budgetShares = memberCount > 0 ? allocateEqually(totalHouseholdBudgetCents, memberCount) : [];

  return householdMembers.map((member, index) => {
    const summary = summaries.get(member.id) ?? { personal: 0, shared: 0 };
    const usedCents = cents(summary.personal + summary.shared);
    const budgetShareCents = budgetShares[index] ?? cents(0);
    return {
      participantId: member.id,
      name: member.name,
      personalSpendingCents: cents(summary.personal),
      sharedSpendingCents: cents(summary.shared),
      totalEconomicShareCents: usedCents,
      budgetShareCents,
      usedCents,
      remainingBudgetCents: cents(budgetShareCents - usedCents),
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
    
    // Fetch budget periods first to determine selected period
    const allPeriods = await this.dependencies.budgets.getBudgetPeriods();
    
    // Select the appropriate period
    const periodContainingToday = allPeriods.find((p) => p.startDate <= today && today <= p.endDate);
    const selectedPeriod = 
      (selectedBudgetPeriodId ? allPeriods.find((p) => p.id === selectedBudgetPeriodId) : null) ||
      periodContainingToday ||
      allPeriods[0];
    
    if (!selectedPeriod) {
      throw new Error("No budget period exists");
    }
    
    // Check cache first — if hit, return cached result without fetching other data
    const cached = sessionCache.getDashboard(selectedPeriod.id);
    if (cached) {
      return cached;
    }
    
    // Fetch all shared data once at this level
    const [allTransactions, participants, categories, settlements, goals, obligations] =
      await Promise.all([
        this.dependencies.transactions.listAll(),
        this.dependencies.participants.listAll(),
        this.dependencies.categories.listAll(),
        this.dependencies.settlements.listAll(),
        this.dependencies.goals.listAll(),
        this.dependencies.obligations.listAll(),
      ]);
    
    // Get budget overview, passing pre-loaded data to avoid duplicate fetches
    const selectedBudgetOverview = await this.dependencies.budgets.getBudgetOverview(selectedPeriod.id, {
      transactions: allTransactions,
      participants,
      categories,
    });
    
    const periodTransactions = allTransactions.filter((transaction) => isWithinPeriod(transaction, selectedPeriod));
    const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    // Sort household members deterministically by memberKey (or id if memberKey not present) for consistent budget share allocation
    const householdMembers = participants
      .filter((participant) => participant.kind === "household-member")
      .sort((left, right) => {
        const leftKey = left.memberKey ?? left.id;
        const rightKey = right.memberKey ?? right.id;
        return leftKey.localeCompare(rightKey);
      });
    const householdMemberIds = householdMembers.map((participant) => participant.id);
    const spendingSummary = summarizeSpending(periodTransactions, participants);
    
    // Calculate shared and personal spending from actual transactions
    let sharedSpendingAmount = 0;
    let personalSpendingAmount = 0;
    for (const transaction of periodTransactions) {
      for (const allocation of transaction.allocations) {
        if (householdMemberIds.includes(allocation.participantId)) {
          if (transaction.scope === "shared") {
            sharedSpendingAmount += allocation.amountCents;
          } else {
            personalSpendingAmount += allocation.amountCents;
          }
        }
      }
    }
    const sharedSpending = cents(sharedSpendingAmount);
    const personalSpending = cents(personalSpendingAmount);
    const totalBudgeted = sumSectionBudgeted(selectedBudgetOverview.sections);
    const budgetedSpent = budgetedCategorySpent(selectedBudgetOverview.sections);
    const remainingBudget = cents(totalBudgeted - budgetedSpent);
    const elapsedPercent = periodElapsedPercent(selectedPeriod, today);
    const internalBalance = calculateNetInternalBalance(allTransactions, settlements, householdMemberIds);
    const externalReceivables = calculateExternalReceivables(allTransactions, settlements, participants);

    const overview: DashboardOverview = {
      period: selectedPeriod,
      periods: allPeriods,
      selectedBudgetPeriodId: selectedPeriod.id,
      householdSummary: {
        totalSpentCents: spendingSummary.householdSpendingCents,
        totalBudgetedCents: totalBudgeted,
        budgetedCategorySpentCents: budgetedSpent,
        remainingBudgetCents: remainingBudget,
        unbudgetedSpentCents: unbudgetedSpent(selectedBudgetOverview.sections),
        sharedSpendingCents: sharedSpending,
        personalSpendingCents: personalSpending,
      },
      memberSummaries: buildMemberSummaries(periodTransactions, householdMembers, totalBudgeted),
      budgetSummary: {
        totalBudgetedCents: totalBudgeted,
        budgetedCategorySpentCents: budgetedSpent,
        remainingBudgetCents: remainingBudget,
        usagePercent: totalBudgeted > 0 ? budgetedSpent / totalBudgeted : undefined,
        periodElapsedPercent: elapsedPercent,
        aggregatePaceStatus: aggregatePaceStatus(totalBudgeted, budgetedSpent, elapsedPercent),
        overview: selectedBudgetOverview,
      },
      attentionCategories: attentionCategories(selectedBudgetOverview.sections),
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

    // Cache the result for future access to same period
    sessionCache.setDashboard(selectedPeriod.id, overview);
    return overview;
  }
}
