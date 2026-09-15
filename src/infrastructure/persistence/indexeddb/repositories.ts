import type {
  BudgetLimitRepository,
  BudgetPeriodRepository,
  CategoryRepository,
  GoalRepository,
  HouseholdRepository,
  ObligationRepository,
  ParticipantRepository,
  PaymentMethodRepository,
  ReferenceDataRepository,
  SettlementRepository,
  TransactionRepository,
} from "../../../application/ports/repositories.ts";
import type { Transaction } from "../../../domain/ledger/transaction.ts";
import { validateTransaction } from "../../../domain/ledger/transaction.ts";
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
} from "../../../domain/shared/types.ts";
import type { Settlement } from "../../../domain/settlement/settlement.ts";
import type { SharedBudgetManagerDatabase } from "./database.ts";
import {
  allocationToRecord,
  budgetLimitFromRecord,
  budgetLimitToRecord,
  budgetPeriodFromRecord,
  budgetPeriodToRecord,
  categoryFromRecord,
  categoryToRecord,
  goalFromRecord,
  goalToRecord,
  householdFromRecord,
  householdToRecord,
  obligationFromRecord,
  obligationToRecord,
  participantFromRecord,
  participantToRecord,
  paymentMethodFromRecord,
  paymentMethodToRecord,
  settlementFromRecord,
  settlementToRecord,
  transactionFromRecords,
  transactionToRecord,
} from "./mappers.ts";

export class DexieHouseholdRepository implements HouseholdRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async getPrimary(): Promise<Household | undefined> {
    const record = await this.db.households.orderBy("id").first();
    return record ? householdFromRecord(record) : undefined;
  }

  async save(household: Household): Promise<void> {
    await this.db.households.put(householdToRecord(household));
  }

  async listAll(): Promise<Household[]> {
    return (await this.db.households.toArray()).map(householdFromRecord);
  }
}

export class DexieParticipantRepository implements ParticipantRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async listAll(): Promise<Participant[]> {
    return (await this.db.participants.toArray()).map(participantFromRecord);
  }

  async save(participant: Participant): Promise<void> {
    await this.db.participants.put(participantToRecord(participant));
  }
}

export class DexieCategoryRepository implements CategoryRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async listAll(): Promise<Category[]> {
    return (await this.db.categories.toArray()).map(categoryFromRecord);
  }

  async save(category: Category): Promise<void> {
    await this.db.categories.put(categoryToRecord(category));
  }
}

export class DexieBudgetPeriodRepository implements BudgetPeriodRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async listAll(): Promise<BudgetPeriod[]> {
    return (await this.db.budgetPeriods.toArray()).map(budgetPeriodFromRecord);
  }

  async save(period: BudgetPeriod): Promise<void> {
    await this.db.budgetPeriods.put(budgetPeriodToRecord(period));
  }
}

export class DexieBudgetLimitRepository implements BudgetLimitRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async listForPeriod(periodId: BudgetLimit["budgetPeriodId"]): Promise<BudgetLimit[]> {
    return (await this.db.budgetLimits.where("budgetPeriodId").equals(periodId).toArray()).map(
      budgetLimitFromRecord,
    );
  }

  async save(limit: BudgetLimit): Promise<void> {
    await this.db.budgetLimits.put(budgetLimitToRecord(limit));
  }

  async delete(id: BudgetLimit["id"]): Promise<void> {
    await this.db.budgetLimits.delete(id);
  }
}

export class DexieTransactionRepository implements TransactionRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async create(transaction: Transaction): Promise<void> {
    validateTransaction(transaction);

    await this.db.transaction("rw", this.db.transactions, this.db.allocations, async () => {
      await this.db.transactions.add(transactionToRecord(transaction));
      await this.db.allocations.bulkAdd(
        transaction.allocations.map((allocation, index) => allocationToRecord(transaction, allocation, index)),
      );
    });
  }

  async update(transaction: Transaction): Promise<void> {
    validateTransaction(transaction);

    await this.db.transaction("rw", this.db.transactions, this.db.allocations, async () => {
      await this.db.transactions.put(transactionToRecord(transaction));
      await this.db.allocations.where("transactionId").equals(transaction.id).delete();
      await this.db.allocations.bulkPut(
        transaction.allocations.map((allocation, index) => allocationToRecord(transaction, allocation, index)),
      );
    });
  }

  async delete(id: Transaction["id"]): Promise<void> {
    await this.db.transaction("rw", this.db.transactions, this.db.allocations, async () => {
      await this.db.transactions.delete(id);
      await this.db.allocations.where("transactionId").equals(id).delete();
    });
  }

  async getById(id: Transaction["id"]): Promise<Transaction | undefined> {
    const record = await this.db.transactions.get(id);

    if (!record) {
      return undefined;
    }

    const allocations = await this.db.allocations.where("transactionId").equals(id).toArray();
    return transactionFromRecords(record, allocations);
  }

  async listByPeriod(startDate: string, endDate: string): Promise<Transaction[]> {
    const records = await this.db.transactions.where("date").between(startDate, endDate, true, true).toArray();
    return Promise.all(records.map((record) => this.getById(record.id as Transaction["id"]))).then((items) =>
      items.filter((item): item is Transaction => item !== undefined),
    );
  }

  async listAll(): Promise<Transaction[]> {
    const records = await this.db.transactions.toArray();
    return Promise.all(records.map((record) => this.getById(record.id as Transaction["id"]))).then((items) =>
      items.filter((item): item is Transaction => item !== undefined),
    );
  }
}

export class DexieSettlementRepository implements SettlementRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async list(): Promise<Settlement[]> {
    return this.listAll();
  }

  async listAll(): Promise<Settlement[]> {
    return (await this.db.settlements.toArray()).map(settlementFromRecord);
  }

  async listForParticipant(participantId: ParticipantId): Promise<Settlement[]> {
    const [from, to] = await Promise.all([
      this.db.settlements.where("fromParticipantId").equals(participantId).toArray(),
      this.db.settlements.where("toParticipantId").equals(participantId).toArray(),
    ]);
    const recordsById = new Map([...from, ...to].map((record) => [record.id, record]));
    return Array.from(recordsById.values()).map(settlementFromRecord);
  }

  async save(settlement: Settlement): Promise<void> {
    await this.db.settlements.put(settlementToRecord(settlement));
  }
}

export class DexiePaymentMethodRepository implements PaymentMethodRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async listAll(): Promise<PaymentMethod[]> {
    return (await this.db.paymentMethods.toArray()).map(paymentMethodFromRecord);
  }

  async save(paymentMethod: PaymentMethod): Promise<void> {
    await this.db.paymentMethods.put(paymentMethodToRecord(paymentMethod));
  }
}

export class DexieGoalRepository implements GoalRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async listAll(): Promise<Goal[]> {
    return (await this.db.goals.toArray()).map(goalFromRecord);
  }

  async save(goal: Goal): Promise<void> {
    await this.db.goals.put(goalToRecord(goal));
  }
}

export class DexieObligationRepository implements ObligationRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async listAll(): Promise<Obligation[]> {
    return (await this.db.obligations.toArray()).map(obligationFromRecord);
  }

  async save(obligation: Obligation): Promise<void> {
    await this.db.obligations.put(obligationToRecord(obligation));
  }
}

export class DexieReferenceDataRepository implements ReferenceDataRepository {
  constructor(private readonly db: SharedBudgetManagerDatabase) {}

  async listHouseholds(): Promise<Household[]> {
    return (await this.db.households.toArray()).map(householdFromRecord);
  }

  async listParticipants(): Promise<Participant[]> {
    return (await this.db.participants.toArray()).map(participantFromRecord);
  }

  async listCategories(): Promise<Category[]> {
    return (await this.db.categories.toArray()).map(categoryFromRecord);
  }

  async listBudgetPeriods(): Promise<BudgetPeriod[]> {
    return (await this.db.budgetPeriods.toArray()).map(budgetPeriodFromRecord);
  }

  async listBudgetLimits(): Promise<BudgetLimit[]> {
    return (await this.db.budgetLimits.toArray()).map(budgetLimitFromRecord);
  }

  async listPaymentMethods(): Promise<PaymentMethod[]> {
    return (await this.db.paymentMethods.toArray()).map(paymentMethodFromRecord);
  }

  async listGoals(): Promise<Goal[]> {
    return (await this.db.goals.toArray()).map(goalFromRecord);
  }

  async listObligations(): Promise<Obligation[]> {
    return (await this.db.obligations.toArray()).map(obligationFromRecord);
  }
}

export function createRepositories(db: SharedBudgetManagerDatabase) {
  return {
    households: new DexieHouseholdRepository(db),
    participants: new DexieParticipantRepository(db),
    categories: new DexieCategoryRepository(db),
    budgetPeriods: new DexieBudgetPeriodRepository(db),
    budgetLimits: new DexieBudgetLimitRepository(db),
    transactions: new DexieTransactionRepository(db),
    settlements: new DexieSettlementRepository(db),
    paymentMethods: new DexiePaymentMethodRepository(db),
    goals: new DexieGoalRepository(db),
    obligations: new DexieObligationRepository(db),
    referenceData: new DexieReferenceDataRepository(db),
  };
}
