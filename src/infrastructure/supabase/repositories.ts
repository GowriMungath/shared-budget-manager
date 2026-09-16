import type {
  BudgetLimitRepository,
  BudgetPeriodRepository,
  CategoryRepository,
  GoalRepository,
  HouseholdRepository,
  ObligationRepository,
  ParticipantRepository,
  PaymentMethodRepository,
  SettlementRepository,
  TransactionRepository,
} from "../../application/ports/repositories.ts";
import type { Transaction } from "../../domain/ledger/transaction.ts";
import type {
  BudgetLimit,
  BudgetPeriod,
  Category,
  Goal,
  Household,
  HouseholdId,
  Obligation,
  Participant,
  ParticipantId,
  PaymentMethod,
} from "../../domain/shared/types.ts";
import type { Settlement } from "../../domain/settlement/settlement.ts";
import { supabase } from "./client.ts";
import {
  allocationToRow,
  budgetLimitFromRow,
  budgetLimitToRow,
  budgetPeriodFromRow,
  budgetPeriodToRow,
  categoryFromRow,
  categoryToRow,
  goalFromRow,
  goalToRow,
  householdFromRow,
  householdToRow,
  obligationFromRow,
  obligationToRow,
  participantFromRow,
  participantToRow,
  paymentMethodFromRow,
  paymentMethodToRow,
  settlementFromRow,
  settlementToRow,
  transactionFromRows,
  transactionToRow,
} from "./mappers.ts";

/**
 * Cloud-backed repository implementations using Supabase
 * These are foundation implementations without sync logic yet
 */

export class SupabaseHouseholdRepository implements HouseholdRepository {
  constructor(private householdId: HouseholdId) {}

  async getPrimary(): Promise<Household | undefined> {
    const { data, error } = await supabase
      .from("households")
      .select("*")
      .eq("id", this.householdId)
      .single();

    if (error || !data) return undefined;
    return householdFromRow(data);
  }

  async save(household: Household): Promise<void> {
    const row = householdToRow(household);
    const { error } = await supabase.from("households").upsert(row);
    if (error) throw new Error(`Failed to save household: ${error.message}`);
  }

  async listAll(): Promise<Household[]> {
    const { data, error } = await supabase.from("households").select("*").eq("id", this.householdId);
    if (error) throw new Error(`Failed to list households: ${error.message}`);
    return (data || []).map(householdFromRow);
  }
}

export class SupabaseParticipantRepository implements ParticipantRepository {
  constructor(private householdId: HouseholdId) {}

  async listAll(): Promise<Participant[]> {
    const { data, error } = await supabase
      .from("participants")
      .select("*")
      .eq("household_id", this.householdId);

    if (error) throw new Error(`Failed to list participants: ${error.message}`);
    return (data || []).map(participantFromRow);
  }

  async save(participant: Participant): Promise<void> {
    const row = participantToRow(participant, this.householdId);
    const { error } = await supabase.from("participants").upsert(row);
    if (error) throw new Error(`Failed to save participant: ${error.message}`);
  }
}

export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private householdId: HouseholdId) {}

  async listAll(): Promise<Category[]> {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("household_id", this.householdId)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to list categories: ${error.message}`);
    return (data || []).map(categoryFromRow);
  }

  async save(category: Category): Promise<void> {
    const row = categoryToRow(category, this.householdId);
    const { error } = await supabase.from("categories").upsert(row);
    if (error) throw new Error(`Failed to save category: ${error.message}`);
  }
}

export class SupabaseBudgetPeriodRepository implements BudgetPeriodRepository {
  constructor(private householdId: HouseholdId) {}

  async listAll(): Promise<BudgetPeriod[]> {
    const { data, error } = await supabase
      .from("budget_periods")
      .select("*")
      .eq("household_id", this.householdId)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to list budget periods: ${error.message}`);
    return (data || []).map(budgetPeriodFromRow);
  }

  async save(period: BudgetPeriod): Promise<void> {
    const row = budgetPeriodToRow(period, this.householdId);
    const { error } = await supabase.from("budget_periods").upsert(row);
    if (error) throw new Error(`Failed to save budget period: ${error.message}`);
  }
}

export class SupabaseBudgetLimitRepository implements BudgetLimitRepository {
  constructor(private householdId: HouseholdId) {}

  async listForPeriod(periodId: string): Promise<BudgetLimit[]> {
    const { data, error } = await supabase
      .from("budget_limits")
      .select("*")
      .eq("household_id", this.householdId)
      .eq("budget_period_id", periodId)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to list budget limits: ${error.message}`);
    return (data || []).map(budgetLimitFromRow);
  }

  async save(limit: BudgetLimit): Promise<void> {
    const row = budgetLimitToRow(limit, this.householdId);
    const { error } = await supabase.from("budget_limits").upsert(row);
    if (error) throw new Error(`Failed to save budget limit: ${error.message}`);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("budget_limits").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(`Failed to delete budget limit: ${error.message}`);
  }
}

export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private householdId: HouseholdId) {}

  async create(transaction: Transaction): Promise<void> {
    const txRow = transactionToRow(transaction, this.householdId);

    // Insert transaction
    const { error: txError } = await supabase.from("transactions").insert(txRow);
    if (txError) throw new Error(`Failed to create transaction: ${txError.message}`);

    // Insert allocations
    for (let i = 0; i < transaction.allocations.length; i++) {
      const allocation = transaction.allocations[i];
      const allocationRow = allocationToRow(allocation, transaction.id, this.householdId, i);
      const { error: allocError } = await supabase.from("allocations").insert(allocationRow);
      if (allocError) throw new Error(`Failed to create allocation: ${allocError.message}`);
    }
  }

  async update(transaction: Transaction): Promise<void> {
    const txRow = transactionToRow(transaction, this.householdId);

    // Update transaction
    const { error: txError } = await supabase.from("transactions").update(txRow).eq("id", transaction.id);
    if (txError) throw new Error(`Failed to update transaction: ${txError.message}`);

    // Delete old allocations and insert new ones
    await supabase.from("allocations").delete().eq("transaction_id", transaction.id);

    for (let i = 0; i < transaction.allocations.length; i++) {
      const allocation = transaction.allocations[i];
      const allocationRow = allocationToRow(allocation, transaction.id, this.householdId, i);
      const { error: allocError } = await supabase.from("allocations").insert(allocationRow);
      if (allocError) throw new Error(`Failed to update allocation: ${allocError.message}`);
    }
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(`Failed to delete transaction: ${error.message}`);
  }

  async getById(id: string): Promise<Transaction | undefined> {
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (txError || !txData) return undefined;

    const { data: allocations, error: allocError } = await supabase
      .from("allocations")
      .select("*")
      .eq("transaction_id", id)
      .is("deleted_at", null);

    if (allocError) throw new Error(`Failed to load allocations: ${allocError.message}`);

    return transactionFromRows(txData, allocations || []);
  }

  async listByPeriod(startDate: string, endDate: string): Promise<Transaction[]> {
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", this.householdId)
      .gte("date", startDate)
      .lte("date", endDate)
      .is("deleted_at", null);

    if (txError) throw new Error(`Failed to list transactions: ${txError.message}`);

    const transactions: Transaction[] = [];
    for (const tx of txData || []) {
      const { data: allocations, error: allocError } = await supabase
        .from("allocations")
        .select("*")
        .eq("transaction_id", tx.id)
        .is("deleted_at", null);

      if (allocError) throw new Error(`Failed to load allocations: ${allocError.message}`);
      transactions.push(transactionFromRows(tx, allocations || []));
    }

    return transactions;
  }

  async listAll(): Promise<Transaction[]> {
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", this.householdId)
      .is("deleted_at", null);

    if (txError) throw new Error(`Failed to list transactions: ${txError.message}`);

    const transactions: Transaction[] = [];
    for (const tx of txData || []) {
      const { data: allocations, error: allocError } = await supabase
        .from("allocations")
        .select("*")
        .eq("transaction_id", tx.id)
        .is("deleted_at", null);

      if (allocError) throw new Error(`Failed to load allocations: ${allocError.message}`);
      transactions.push(transactionFromRows(tx, allocations || []));
    }

    return transactions;
  }
}

export class SupabaseSettlementRepository implements SettlementRepository {
  constructor(private householdId: HouseholdId) {}

  async list(): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from("settlements")
      .select("*")
      .eq("household_id", this.householdId)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to list settlements: ${error.message}`);
    return (data || []).map(settlementFromRow);
  }

  async listAll(): Promise<Settlement[]> {
    return this.list();
  }

  async listForParticipant(participantId: ParticipantId): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from("settlements")
      .select("*")
      .eq("household_id", this.householdId)
      .or(`from_participant_id.eq.${participantId},to_participant_id.eq.${participantId}`)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to list settlements: ${error.message}`);
    return (data || []).map(settlementFromRow);
  }

  async save(settlement: Settlement): Promise<void> {
    const row = settlementToRow(settlement, this.householdId);
    const { error } = await supabase.from("settlements").upsert(row);
    if (error) throw new Error(`Failed to save settlement: ${error.message}`);
  }
}

export class SupabasePaymentMethodRepository implements PaymentMethodRepository {
  constructor(private householdId: HouseholdId) {}

  async listAll(): Promise<PaymentMethod[]> {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("household_id", this.householdId)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to list payment methods: ${error.message}`);
    return (data || []).map(paymentMethodFromRow);
  }

  async save(method: PaymentMethod): Promise<void> {
    const row = paymentMethodToRow(method, this.householdId);
    const { error } = await supabase.from("payment_methods").upsert(row);
    if (error) throw new Error(`Failed to save payment method: ${error.message}`);
  }
}

export class SupabaseGoalRepository implements GoalRepository {
  constructor(private householdId: HouseholdId) {}

  async listAll(): Promise<Goal[]> {
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("household_id", this.householdId)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to list goals: ${error.message}`);
    return (data || []).map(goalFromRow);
  }

  async save(goal: Goal): Promise<void> {
    const row = goalToRow(goal, this.householdId);
    const { error } = await supabase.from("goals").upsert(row);
    if (error) throw new Error(`Failed to save goal: ${error.message}`);
  }
}

export class SupabaseObligationRepository implements ObligationRepository {
  constructor(private householdId: HouseholdId) {}

  async listAll(): Promise<Obligation[]> {
    const { data, error } = await supabase
      .from("obligations")
      .select("*")
      .eq("household_id", this.householdId)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to list obligations: ${error.message}`);
    return (data || []).map(obligationFromRow);
  }

  async save(obligation: Obligation): Promise<void> {
    const row = obligationToRow(obligation, this.householdId);
    const { error } = await supabase.from("obligations").upsert(row);
    if (error) throw new Error(`Failed to save obligation: ${error.message}`);
  }
}

/**
 * Factory function to create all cloud repositories for a household
 */
export function createSupabaseRepositories(householdId: HouseholdId) {
  return {
    households: new SupabaseHouseholdRepository(householdId),
    participants: new SupabaseParticipantRepository(householdId),
    categories: new SupabaseCategoryRepository(householdId),
    budgetPeriods: new SupabaseBudgetPeriodRepository(householdId),
    budgetLimits: new SupabaseBudgetLimitRepository(householdId),
    transactions: new SupabaseTransactionRepository(householdId),
    settlements: new SupabaseSettlementRepository(householdId),
    paymentMethods: new SupabasePaymentMethodRepository(householdId),
    goals: new SupabaseGoalRepository(householdId),
    obligations: new SupabaseObligationRepository(householdId),
  };
}
