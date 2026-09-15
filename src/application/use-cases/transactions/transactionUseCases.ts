import { allocateByBasisPoints, allocateEqually, parseMoney, sumCents } from "../../../domain/money/money.ts";
import { summarizeSpending, validateTransaction, type Allocation, type Transaction } from "../../../domain/ledger/transaction.ts";
import { calculateExternalReceivables, calculateNetInternalBalance } from "../../../domain/settlement/settlement.ts";
import {
  participantId,
  transactionId,
} from "../../../domain/shared/ids.ts";
import type { Participant, ParticipantId } from "../../../domain/shared/types.ts";
import type {
  CategoryRepository,
  ParticipantRepository,
  PaymentMethodRepository,
  TransactionRepository,
} from "../../ports/repositories.ts";
import type { IdService } from "../../services/idService.ts";
import { ApplicationValidationError, type TransactionDraft, type TransactionListItem, type TransactionPreview, type TransactionReferenceData } from "./types.ts";

export interface TransactionUseCaseDependencies {
  transactions: TransactionRepository;
  participants: ParticipantRepository;
  categories: CategoryRepository;
  paymentMethods: PaymentMethodRepository;
  ids: IdService;
}

function userMoney(input: string, label: string) {
  if (input.trim().length === 0) {
    throw new ApplicationValidationError(`${label} is required`);
  }

  let amount;
  try {
    amount = parseMoney(input);
  } catch {
    throw new ApplicationValidationError(`${label} must be a valid dollar amount`);
  }

  if (amount < 0) {
    throw new ApplicationValidationError(`${label} cannot be negative`);
  }

  return amount;
}

function positiveUserMoney(input: string, label: string) {
  const amount = userMoney(input, label);

  if (amount <= 0) {
    throw new ApplicationValidationError(`${label} must be greater than zero`);
  }

  return amount;
}

function basisPointsFromPercentage(input: string): number {
  const trimmed = input.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new ApplicationValidationError("Percentages must use up to two decimal places");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function requireParticipant(participants: readonly Participant[], participantIdValue: ParticipantId): Participant {
  const participant = participants.find((item) => item.id === participantIdValue);

  if (!participant) {
    throw new ApplicationValidationError("Selected participant was not found");
  }

  return participant;
}

export class TransactionUseCases {
  constructor(private readonly dependencies: TransactionUseCaseDependencies) {}

  async getReferenceData(): Promise<TransactionReferenceData> {
    const [participants, categories, paymentMethods] = await Promise.all([
      this.dependencies.participants.listAll(),
      this.dependencies.categories.listAll(),
      this.dependencies.paymentMethods.listAll(),
    ]);
    const householdMembers = participants.filter((participant) => participant.kind === "household-member");

    return {
      participants,
      householdMembers,
      externalParticipants: participants.filter((participant) => participant.kind === "external"),
      categories,
      paymentMethods,
    };
  }

  async createExternalParticipant(name: string): Promise<Participant> {
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new ApplicationValidationError("Friend name is required");
    }

    const participant: Participant = {
      id: participantId(this.dependencies.ids.createId()),
      name: trimmedName,
      kind: "external",
    };

    await this.dependencies.participants.save(participant);
    return participant;
  }

  async buildTransactionFromDraft(draft: TransactionDraft, existingId?: Transaction["id"]): Promise<Transaction> {
    const referenceData = await this.getReferenceData();
    const totalCents = positiveUserMoney(draft.totalAmountInput, "Amount");
    requireParticipant(referenceData.participants, draft.payerParticipantId);

    if (!draft.description.trim()) {
      throw new ApplicationValidationError("Description is required");
    }

    const allocations = this.buildAllocations(draft, referenceData.householdMembers, totalCents);
    const transaction: Transaction = {
      id: existingId ?? transactionId(this.dependencies.ids.createId()),
      kind: "expense",
      date: draft.date,
      description: draft.description.trim(),
      totalCents,
      categoryId: draft.categoryId,
      payerParticipantId: draft.payerParticipantId,
      scope: draft.scope,
      allocations,
    };

    if (draft.paymentMethodId) {
      transaction.paymentMethodId = draft.paymentMethodId;
    }

    if (draft.notes?.trim()) {
      transaction.notes = draft.notes.trim();
    }

    validateTransaction(transaction);
    return transaction;
  }

  buildAllocations(
    draft: TransactionDraft,
    householdMembers: readonly Participant[],
    totalCents: Transaction["totalCents"],
  ): Allocation[] {
    if (draft.splitMode === "PERSONAL") {
      if (!draft.personalOwnerParticipantId) {
        throw new ApplicationValidationError("Choose whose expense this is");
      }

      return [{ participantId: draft.personalOwnerParticipantId, amountCents: totalCents }];
    }

    if (draft.splitMode === "EQUAL_HOUSEHOLD") {
      if (householdMembers.length === 0) {
        throw new ApplicationValidationError("No household members are available for equal split");
      }

      const shares = allocateEqually(totalCents, householdMembers.length);
      return householdMembers.map((participant, index) => ({
        participantId: participant.id,
        amountCents: shares[index],
      }));
    }

    if (draft.allocations.length === 0) {
      throw new ApplicationValidationError("Add at least one allocation");
    }

    if (draft.splitMode === "CUSTOM_AMOUNT") {
      const allocations = draft.allocations.map((allocation) => ({
        participantId: allocation.participantId,
        amountCents: userMoney(allocation.amountInput ?? "", "Allocation amount"),
      }));
      const totalAllocated = sumCents(allocations.map((allocation) => allocation.amountCents));

      if (totalAllocated !== totalCents) {
        throw new ApplicationValidationError("Allocations must equal the transaction total");
      }

      return allocations;
    }

    const basisPoints = draft.allocations.map((allocation) =>
      basisPointsFromPercentage(allocation.percentageInput ?? ""),
    );
    const amounts = allocateByBasisPoints(totalCents, basisPoints);
    return draft.allocations.map((allocation, index) => ({
      participantId: allocation.participantId,
      amountCents: amounts[index],
    }));
  }

  async preview(draft: TransactionDraft, existingId?: Transaction["id"]): Promise<TransactionPreview> {
    const transaction = await this.buildTransactionFromDraft(draft, existingId);
    const referenceData = await this.getReferenceData();
    const spending = summarizeSpending([transaction], referenceData.participants);
    const householdMemberIds = referenceData.householdMembers.map((participant) => participant.id);

    return {
      transaction,
      householdSpendingCents: spending.householdSpendingCents,
      externalReceivableCents: spending.externalReceivableCents,
      internalBalance: calculateNetInternalBalance([transaction], [], householdMemberIds),
      externalReceivables: calculateExternalReceivables([transaction], [], referenceData.participants),
    };
  }

  async createTransaction(draft: TransactionDraft): Promise<Transaction> {
    const transaction = await this.buildTransactionFromDraft(draft);
    await this.dependencies.transactions.create(transaction);
    return transaction;
  }

  async updateTransaction(id: Transaction["id"], draft: TransactionDraft): Promise<Transaction> {
    const transaction = await this.buildTransactionFromDraft(draft, id);
    await this.dependencies.transactions.update(transaction);
    return transaction;
  }

  async deleteTransaction(id: Transaction["id"]): Promise<void> {
    await this.dependencies.transactions.delete(id);
  }

  async getTransaction(id: Transaction["id"]): Promise<Transaction | undefined> {
    return this.dependencies.transactions.getById(id);
  }

  async listTransactions(): Promise<TransactionListItem[]> {
    const [transactions, referenceData] = await Promise.all([
      this.dependencies.transactions.listAll(),
      this.getReferenceData(),
    ]);

    return transactions
      .slice()
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((transaction) => ({
        transaction,
        category: referenceData.categories.find((category) => category.id === transaction.categoryId),
        payer: referenceData.participants.find((participant) => participant.id === transaction.payerParticipantId),
      }));
  }
}
