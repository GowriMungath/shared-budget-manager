import { assertPositiveCents, cents } from "../money/money.ts";
import type { Cents, Participant, ParticipantId, SettlementId } from "../shared/types.ts";
import { validateTransaction, type Transaction } from "../ledger/transaction.ts";

export type SettlementType = "internal" | "external";

export interface Settlement {
  id: SettlementId;
  fromParticipantId: ParticipantId;
  toParticipantId: ParticipantId;
  amountCents: Cents;
  date: string;
  type: SettlementType;
  notes?: string;
}

export interface NetInternalBalance {
  fromParticipantId: ParticipantId | null;
  toParticipantId: ParticipantId | null;
  amountCents: Cents;
}

export interface ExternalReceivable {
  fromParticipantId: ParticipantId;
  toParticipantId: ParticipantId;
  amountCents: Cents;
}

export function validateSettlement(settlement: Settlement): void {
  assertPositiveCents(settlement.amountCents, "Settlement amount");
}

function pairKey(fromParticipantId: ParticipantId, toParticipantId: ParticipantId): string {
  return `${fromParticipantId}->${toParticipantId}`;
}

function addOwed(
  balances: Map<string, { fromParticipantId: ParticipantId; toParticipantId: ParticipantId; amountCents: number }>,
  fromParticipantId: ParticipantId,
  toParticipantId: ParticipantId,
  amountCents: Cents,
): void {
  if (amountCents === 0) {
    return;
  }

  const key = pairKey(fromParticipantId, toParticipantId);
  const current = balances.get(key);

  balances.set(key, {
    fromParticipantId,
    toParticipantId,
    amountCents: (current?.amountCents ?? 0) + amountCents,
  });
}

export function calculateNetInternalBalance(
  transactions: readonly Transaction[],
  settlements: readonly Settlement[],
  householdMemberIds: readonly ParticipantId[],
): NetInternalBalance {
  if (householdMemberIds.length !== 2) {
    throw new Error("The Trial MVP settlement engine expects exactly two household members");
  }

  const [firstMemberId, secondMemberId] = householdMemberIds;
  let firstOwesSecond = 0;
  let secondOwesFirst = 0;
  const householdMemberSet = new Set<ParticipantId>(householdMemberIds);

  for (const transaction of transactions) {
    validateTransaction(transaction);

    if (!householdMemberSet.has(transaction.payerParticipantId)) {
      continue;
    }

    for (const allocation of transaction.allocations) {
      if (
        householdMemberSet.has(allocation.participantId) &&
        allocation.participantId !== transaction.payerParticipantId
      ) {
        if (allocation.participantId === firstMemberId && transaction.payerParticipantId === secondMemberId) {
          firstOwesSecond += allocation.amountCents;
        } else if (
          allocation.participantId === secondMemberId &&
          transaction.payerParticipantId === firstMemberId
        ) {
          secondOwesFirst += allocation.amountCents;
        }
      }
    }
  }

  for (const settlement of settlements.filter((item) => item.type === "internal")) {
    validateSettlement(settlement);

    if (settlement.fromParticipantId === firstMemberId && settlement.toParticipantId === secondMemberId) {
      firstOwesSecond -= settlement.amountCents;
    } else if (settlement.fromParticipantId === secondMemberId && settlement.toParticipantId === firstMemberId) {
      secondOwesFirst -= settlement.amountCents;
    }
  }

  const netFirstOwesSecond = firstOwesSecond - secondOwesFirst;

  if (netFirstOwesSecond > 0) {
    return {
      fromParticipantId: firstMemberId,
      toParticipantId: secondMemberId,
      amountCents: cents(netFirstOwesSecond),
    };
  }

  if (netFirstOwesSecond < 0) {
    return {
      fromParticipantId: secondMemberId,
      toParticipantId: firstMemberId,
      amountCents: cents(Math.abs(netFirstOwesSecond)),
    };
  }

  return {
    fromParticipantId: null,
    toParticipantId: null,
    amountCents: cents(0),
  };
}

export function calculateExternalReceivables(
  transactions: readonly Transaction[],
  settlements: readonly Settlement[],
  participants: readonly Participant[],
): ExternalReceivable[] {
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const balances = new Map<
    string,
    { fromParticipantId: ParticipantId; toParticipantId: ParticipantId; amountCents: number }
  >();

  // Calculate pairwise debt from transactions
  // Generically: if allocationOwner != payer, then allocationOwner owes payer
  // Supports household→external, external→household, and external→external
  for (const transaction of transactions) {
    validateTransaction(transaction);
    const payer = participantById.get(transaction.payerParticipantId);

    if (!payer) {
      throw new Error(`Unknown payer: ${transaction.payerParticipantId}`);
    }

    for (const allocation of transaction.allocations) {
      const allocationOwner = participantById.get(allocation.participantId);

      if (!allocationOwner) {
        throw new Error(`Unknown participant: ${allocation.participantId}`);
      }

      // If allocation owner is different from payer, allocation owner owes payer
      // This applies regardless of whether payer or owner is household/external
      if (allocationOwner.id !== payer.id) {
        // Only track if at least one side is external (internal debts handled separately)
        if (allocationOwner.kind === "external" || payer.kind === "external") {
          addOwed(balances, allocationOwner.id, payer.id, allocation.amountCents);
        }
      }
    }
  }

  // Apply settlements to reduce debt
  for (const settlement of settlements.filter((item) => item.type === "external")) {
    validateSettlement(settlement);

    const key = pairKey(settlement.fromParticipantId, settlement.toParticipantId);
    const current = balances.get(key);

    if (!current) {
      continue;
    }

    current.amountCents -= settlement.amountCents;
  }

  return Array.from(balances.values())
    .filter((balance) => balance.amountCents > 0)
    .map((balance) => ({
      fromParticipantId: balance.fromParticipantId,
      toParticipantId: balance.toParticipantId,
      amountCents: cents(balance.amountCents),
    }));
}
