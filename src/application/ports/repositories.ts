import type {
  BudgetLimit,
  BudgetPeriod,
  Category,
  Goal,
  Household,
  Obligation,
  Participant,
  ParticipantId,
  PaymentMethod,
} from "../../domain/shared/types.ts";
import type { Transaction } from "../../domain/ledger/transaction.ts";
import type { Settlement } from "../../domain/settlement/settlement.ts";

export interface HouseholdRepository {
  getPrimary(): Promise<Household | undefined>;
  save(household: Household): Promise<void>;
  listAll(): Promise<Household[]>;
}

export interface ParticipantRepository {
  listAll(): Promise<Participant[]>;
  save(participant: Participant): Promise<void>;
}

export interface CategoryRepository {
  listAll(): Promise<Category[]>;
  save(category: Category): Promise<void>;
}

export interface BudgetPeriodRepository {
  listAll(): Promise<BudgetPeriod[]>;
  save(period: BudgetPeriod): Promise<void>;
}

export interface BudgetLimitRepository {
  listForPeriod(periodId: BudgetLimit["budgetPeriodId"]): Promise<BudgetLimit[]>;
  save(limit: BudgetLimit): Promise<void>;
  delete(id: BudgetLimit["id"]): Promise<void>;
}

export interface TransactionRepository {
  create(transaction: Transaction): Promise<void>;
  update(transaction: Transaction): Promise<void>;
  delete(id: Transaction["id"]): Promise<void>;
  getById(id: Transaction["id"]): Promise<Transaction | undefined>;
  listByPeriod(startDate: string, endDate: string): Promise<Transaction[]>;
  listAll(): Promise<Transaction[]>;
}

export interface ReferenceDataRepository {
  listHouseholds(): Promise<Household[]>;
  listParticipants(): Promise<Participant[]>;
  listCategories(): Promise<Category[]>;
  listBudgetPeriods(): Promise<BudgetPeriod[]>;
  listBudgetLimits(): Promise<BudgetLimit[]>;
  listPaymentMethods(): Promise<PaymentMethod[]>;
  listGoals(): Promise<Goal[]>;
  listObligations(): Promise<Obligation[]>;
}

export interface SettlementRepository {
  list(): Promise<Settlement[]>;
  listAll(): Promise<Settlement[]>;
  listForParticipant(participantId: ParticipantId): Promise<Settlement[]>;
  save(settlement: Settlement): Promise<void>;
}

export interface PaymentMethodRepository {
  listAll(): Promise<PaymentMethod[]>;
  save(paymentMethod: PaymentMethod): Promise<void>;
}

export interface GoalRepository {
  listAll(): Promise<Goal[]>;
  save(goal: Goal): Promise<void>;
}

export interface ObligationRepository {
  listAll(): Promise<Obligation[]>;
  save(obligation: Obligation): Promise<void>;
}
