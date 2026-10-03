import { calculateNetInternalBalance, calculateExternalReceivables, type NetInternalBalance, type ExternalReceivable } from "../../../domain/settlement/settlement.ts";
import type { Settlement } from "../../../domain/settlement/settlement.ts";
import type { Transaction } from "../../../domain/ledger/transaction.ts";
import type { Participant, ParticipantId, Cents } from "../../../domain/shared/types.ts";

export interface HouseholdBalance {
  internal: NetInternalBalance;
  external: ExternalReceivable[];
}

/**
 * Canonical balance calculation engine for Cycle 3+
 * 
 * This is the single source of truth for computing pairwise debts.
 * Both Dashboard and People & Settlements pages use this function.
 * 
 * Supports:
 * - Internal (household-member to household-member) debt
 * - External receivables (household-member to external-person)
 * - Settlement effects (both types)
 * - Soft-deleted transaction exclusion (via repository layer)
 * - Opposite-direction obligation netting
 */
export function calculateHouseholdBalance(
  householdMemberIds: readonly ParticipantId[],
  transactions: readonly Transaction[],
  settlements: readonly Settlement[],
  participants: readonly Participant[]
): HouseholdBalance {
  return {
    internal: calculateNetInternalBalance(transactions, settlements, householdMemberIds),
    external: calculateExternalReceivables(transactions, settlements, participants),
  };
}

/**
 * Lookup a specific pairwise balance between two participants
 * Used by People & Settlements page for detailed balance display
 */
export function findBalanceBetween(
  personA: ParticipantId,
  personB: ParticipantId,
  externalReceivables: readonly ExternalReceivable[]
): Cents | null {
  const match = externalReceivables.find(
    (receivable) =>
      (receivable.fromParticipantId === personA && receivable.toParticipantId === personB) ||
      (receivable.fromParticipantId === personB && receivable.toParticipantId === personA)
  );

  return match?.amountCents ?? null;
}
