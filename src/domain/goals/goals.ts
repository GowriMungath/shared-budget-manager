import { assertNonNegativeCents, assertPositiveCents, cents } from "../money/money.ts";
import type { Cents, Goal } from "../shared/types.ts";

export interface GoalProgress {
  currentSavedCents: Cents;
  remainingCents: Cents;
  percentCompleteBasisPoints: number;
  suggestedMonthlyContributionCents: Cents;
}

export function calculateGoalProgress(goal: Goal, monthsRemaining: number): GoalProgress {
  assertPositiveCents(goal.targetCents, "Goal target");
  assertNonNegativeCents(goal.currentSavedCents, "Goal current saved amount");

  if (!Number.isSafeInteger(monthsRemaining) || monthsRemaining <= 0) {
    throw new Error("monthsRemaining must be a positive integer");
  }

  const remaining = Math.max(goal.targetCents - goal.currentSavedCents, 0);

  return {
    currentSavedCents: goal.currentSavedCents,
    remainingCents: cents(remaining),
    percentCompleteBasisPoints: Math.trunc((goal.currentSavedCents * 10_000) / goal.targetCents),
    suggestedMonthlyContributionCents: cents(Math.ceil(remaining / monthsRemaining)),
  };
}
