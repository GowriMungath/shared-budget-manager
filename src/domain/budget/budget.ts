import { assertNonNegativeCents, cents } from "../money/money.ts";
import type { BudgetLimit, BudgetPeriod, Cents, Participant, ParticipantId } from "../shared/types.ts";
import { validateTransaction, type Transaction } from "../ledger/transaction.ts";
import { assertCalendarDate } from "./calendar.ts";

export interface BudgetUsage {
  budgetedCents: Cents;
  spentCents: Cents;
  remainingCents: Cents;
}

function isWithinPeriod(date: string, period: BudgetPeriod): boolean {
  assertCalendarDate(date, "Transaction date");
  assertCalendarDate(period.startDate, "Budget period startDate");
  assertCalendarDate(period.endDate, "Budget period endDate");

  if (period.startDate > period.endDate) {
    throw new Error("Budget period startDate must be on or before endDate");
  }

  return date >= period.startDate && date <= period.endDate;
}

function isAllocationEligibleForBudget(
  participant: Participant,
  budgetLimit: BudgetLimit,
  householdMemberIds: ReadonlySet<ParticipantId>,
): boolean {
  if (budgetLimit.scope === "shared") {
    return participant.kind === "household-member" && householdMemberIds.has(participant.id);
  }

  if (!budgetLimit.ownerParticipantId) {
    throw new Error("Personal budget limits must include ownerParticipantId");
  }

  return participant.id === budgetLimit.ownerParticipantId;
}

export function calculateBudgetUsage(
  budgetLimit: BudgetLimit,
  budgetPeriod: BudgetPeriod,
  transactions: readonly Transaction[],
  participants: readonly Participant[],
  householdMemberIds: readonly ParticipantId[],
): BudgetUsage {
  assertNonNegativeCents(budgetLimit.limitCents, "Budget limit");

  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const householdMemberSet = new Set(householdMemberIds);
  let spent = 0;

  for (const transaction of transactions) {
    validateTransaction(transaction);

    if (transaction.categoryId !== budgetLimit.categoryId || !isWithinPeriod(transaction.date, budgetPeriod)) {
      continue;
    }

    for (const allocation of transaction.allocations) {
      const participant = participantById.get(allocation.participantId);

      if (!participant) {
        throw new Error(`Unknown participant: ${allocation.participantId}`);
      }

      if (
        isAllocationEligibleForBudget(
          participant,
          budgetLimit,
          householdMemberSet,
        )
      ) {
        spent += allocation.amountCents;
      }
    }
  }

  return {
    budgetedCents: budgetLimit.limitCents,
    spentCents: cents(spent),
    remainingCents: cents(budgetLimit.limitCents - spent),
  };
}
