import { assertNonNegativeCents, assertPositiveCents, cents, sumCents } from "../money/money.ts";
import type {
  BudgetScope,
  CategoryId,
  Cents,
  Participant,
  ParticipantId,
  PaymentMethodId,
  TransactionId,
} from "../shared/types.ts";

export type TransactionKind = "expense";

export interface Allocation {
  participantId: ParticipantId;
  amountCents: Cents;
}

export interface Transaction {
  id: TransactionId;
  kind: TransactionKind;
  date: string;
  description: string;
  totalCents: Cents;
  categoryId: CategoryId;
  payerParticipantId: ParticipantId;
  scope: BudgetScope;
  paymentMethodId?: PaymentMethodId;
  notes?: string;
  allocations: Allocation[];
}

export interface SpendingSummary {
  householdSpendingCents: Cents;
  memberSpendingCents: Map<ParticipantId, Cents>;
  externalReceivableCents: Cents;
}

export function validateTransaction(transaction: Transaction): void {
  assertPositiveCents(transaction.totalCents, "Transaction total");

  if (transaction.allocations.length === 0) {
    throw new Error("Transaction must include at least one allocation");
  }

  for (const allocation of transaction.allocations) {
    assertNonNegativeCents(allocation.amountCents, "Allocation amount");
  }

  const allocationTotal = sumCents(transaction.allocations.map((allocation) => allocation.amountCents));

  if (allocationTotal !== transaction.totalCents) {
    throw new Error(
      `Allocation total ${allocationTotal} must equal transaction total ${transaction.totalCents}`,
    );
  }
}

export function summarizeSpending(
  transactions: readonly Transaction[],
  participants: readonly Participant[],
): SpendingSummary {
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const memberSpendingCents = new Map<ParticipantId, Cents>();
  let householdSpending = 0;
  let externalReceivable = 0;

  for (const transaction of transactions) {
    validateTransaction(transaction);

    for (const allocation of transaction.allocations) {
      const participant = participantById.get(allocation.participantId);

      if (!participant) {
        throw new Error(`Unknown participant: ${allocation.participantId}`);
      }

      if (participant.kind === "household-member") {
        householdSpending += allocation.amountCents;
        memberSpendingCents.set(
          allocation.participantId,
          cents((memberSpendingCents.get(allocation.participantId) ?? cents(0)) + allocation.amountCents),
        );
      } else {
        externalReceivable += allocation.amountCents;
      }
    }
  }

  return {
    householdSpendingCents: cents(householdSpending),
    memberSpendingCents,
    externalReceivableCents: cents(externalReceivable),
  };
}
