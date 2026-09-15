import type { Transaction } from "../../../domain/ledger/transaction.ts";
import type {
  BudgetScope,
  Category,
  CategoryId,
  Cents,
  Participant,
  ParticipantId,
  PaymentMethod,
  PaymentMethodId,
} from "../../../domain/shared/types.ts";
import type { ExternalReceivable, NetInternalBalance } from "../../../domain/settlement/settlement.ts";

export type SplitMode = "PERSONAL" | "EQUAL_HOUSEHOLD" | "CUSTOM_AMOUNT" | "CUSTOM_PERCENTAGE";

export interface DraftAllocationInput {
  participantId: ParticipantId;
  amountInput?: string;
  percentageInput?: string;
}

export interface TransactionDraft {
  date: string;
  description: string;
  categoryId: CategoryId;
  payerParticipantId: ParticipantId;
  paymentMethodId?: PaymentMethodId;
  notes?: string;
  scope: BudgetScope;
  personalOwnerParticipantId?: ParticipantId;
  totalAmountInput: string;
  splitMode: SplitMode;
  allocations: DraftAllocationInput[];
}

export interface TransactionPreview {
  transaction: Transaction;
  householdSpendingCents: Cents;
  externalReceivableCents: Cents;
  internalBalance: NetInternalBalance;
  externalReceivables: ExternalReceivable[];
}

export interface TransactionReferenceData {
  participants: Participant[];
  householdMembers: Participant[];
  externalParticipants: Participant[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
}

export interface TransactionListItem {
  transaction: Transaction;
  category?: Category;
  payer?: Participant;
}

export class ApplicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationValidationError";
  }
}
