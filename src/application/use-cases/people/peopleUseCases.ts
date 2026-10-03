import type { Participant, ParticipantId, Cents } from "../../../domain/shared/types.ts";
import type {
  ParticipantRepository,
  SettlementRepository,
  TransactionRepository,
} from "../../ports/repositories.ts";
import type { IdService } from "../../services/idService.ts";
import { settlementId } from "../../../domain/shared/ids.ts";
import type { Settlement } from "../../../domain/settlement/settlement.ts";
import { calculateNetInternalBalance, calculateExternalReceivables } from "../../../domain/settlement/settlement.ts";

export interface PeopleUseCaseDependencies {
  participants: ParticipantRepository;
  settlements: SettlementRepository;
  transactions: TransactionRepository;
  ids: IdService;
  today?: () => string;
}

export interface HouseholdBalance {
  internal: {
    fromParticipantId?: ParticipantId | null;
    toParticipantId?: ParticipantId | null;
    amountCents: Cents;
  };
  external: Array<{
    fromParticipantId: ParticipantId;
    toParticipantId: ParticipantId;
    amountCents: Cents;
  }>;
}

export class PeopleUseCases {
  constructor(private readonly dependencies: PeopleUseCaseDependencies) {}

  /**
   * List all household members (active participants with kind: "household-member")
   */
  async listHouseholdMembers(): Promise<Participant[]> {
    const participants = await this.dependencies.participants.listAll();
    return participants.filter(
      (p) => p.kind === "household-member" && !p.archivedAt
    );
  }

  /**
   * List active external participants (kind: "external", not archived)
   */
  async listActiveExternalPeople(): Promise<Participant[]> {
    const participants = await this.dependencies.participants.listAll();
    return participants.filter(
      (p) => p.kind === "external" && !p.archivedAt
    );
  }

  /**
   * List all participants including archived (for historical rendering)
   */
  async listAllParticipants(): Promise<Participant[]> {
    return this.dependencies.participants.listAll();
  }

  /**
   * Create external participant
   * Type and kind are derived, not user-controlled
   */
  async createExternalPerson(input: {
    name: string;
    note?: string;
  }): Promise<Participant> {
    const participant: Participant = {
      id: this.dependencies.ids.createId() as ParticipantId,
      name: input.name,
      kind: "external", // Always external for this operation
      archivedAt: undefined, // New participant is active
    };

    await this.dependencies.participants.save(participant);
    return participant;
  }

  /**
   * Rename a participant (both household members and external)
   * Preserves archived status and doesn't change kind
   */
  async renameParticipant(participantId: ParticipantId, newName: string): Promise<Participant> {
    const existing = await this.dependencies.participants.getById(participantId);
    if (!existing) {
      throw new Error(`Participant not found: ${participantId}`);
    }

    const updated: Participant = {
      ...existing,
      name: newName,
    };

    await this.dependencies.participants.save(updated);
    return updated;
  }

  /**
   * Archive external participant (soft-delete)
   * Preserved for historical rendering of transactions/settlements
   */
  async archiveParticipant(participantId: ParticipantId): Promise<Participant> {
    const existing = await this.dependencies.participants.getById(participantId);
    if (!existing) {
      throw new Error(`Participant not found: ${participantId}`);
    }

    if (existing.kind === "household-member") {
      throw new Error(`Cannot archive household members`);
    }

    const updated: Participant = {
      ...existing,
      archivedAt: this.dependencies.today?.() ?? new Date().toISOString(),
    };

    await this.dependencies.participants.save(updated);
    return updated;
  }

  /**
   * Unarchive participant (soft-delete reversal)
   */
  async unarchiveParticipant(participantId: ParticipantId): Promise<Participant> {
    const existing = await this.dependencies.participants.getById(participantId);
    if (!existing) {
      throw new Error(`Participant not found: ${participantId}`);
    }

    const updated: Participant = {
      ...existing,
      archivedAt: undefined,
    };

    await this.dependencies.participants.save(updated);
    return updated;
  }

  /**
   * List all settlements (both internal and external)
   */
  async listSettlements(): Promise<Settlement[]> {
    return this.dependencies.settlements.listAll();
  }

  /**
   * Create settlement record
   * Type is DERIVED from participant kinds, not user-controlled
   *
   * - household-member → household-member = "internal"
   * - anything involving external = "external"
   */
  async createSettlement(input: {
    fromParticipantId: ParticipantId;
    toParticipantId: ParticipantId;
    amountCents: Cents;
    date: string;
    notes?: string;
  }): Promise<Settlement> {
    // Derive settlement type from participant kinds
    const [fromPerson, toPerson] = await Promise.all([
      this.dependencies.participants.getById(input.fromParticipantId),
      this.dependencies.participants.getById(input.toParticipantId),
    ]);

    if (!fromPerson || !toPerson) {
      throw new Error("One or both participants not found");
    }

    if (input.fromParticipantId === input.toParticipantId) {
      throw new Error("Settlement cannot be between the same person");
    }

    // Determine type based on participant kinds
    const type: "internal" | "external" =
      fromPerson.kind === "household-member" && toPerson.kind === "household-member"
        ? "internal"
        : "external";

    const settlement: Settlement = {
      id: settlementId(this.dependencies.ids.createId()),
      fromParticipantId: input.fromParticipantId,
      toParticipantId: input.toParticipantId,
      amountCents: input.amountCents,
      date: input.date,
      type, // DERIVED, not user-controlled
      notes: input.notes,
    };

    await this.dependencies.settlements.save(settlement);
    return settlement;
  }

  /**
   * Calculate household balance (internal + external)
   * Uses canonical balance engine for consistency with dashboard
   */
  async getHouseholdBalance(householdMemberIds: ParticipantId[]): Promise<HouseholdBalance> {
    const [allTransactions, allSettlements] = await Promise.all([
      this.dependencies.transactions.listAll(),
      this.dependencies.settlements.listAll(),
    ]);

    const allParticipants = await this.dependencies.participants.listAll();

    const internalBalance = calculateNetInternalBalance(
      allTransactions,
      allSettlements,
      householdMemberIds
    );

    const externalReceivables = calculateExternalReceivables(
      allTransactions,
      allSettlements,
      allParticipants
    );

    return {
      internal: internalBalance,
      external: externalReceivables,
    };
  }

  /**
   * Soft-delete settlement (reversible, maintains historical integrity)
   * Note: Current domain model doesn't have deletedAt; this is prepared for future use
   */
  async deleteSettlement(settlementId: string): Promise<void> {
    const settlement = await this.dependencies.settlements.getById(settlementId as unknown as Settlement["id"]);
    if (!settlement) {
      throw new Error(`Settlement not found: ${settlementId}`);
    }

    // For now, just remove it
    // Future: add soft-delete field and preserve historical records
    await this.dependencies.settlements.delete(settlementId as unknown as Settlement["id"]);
  }
}
