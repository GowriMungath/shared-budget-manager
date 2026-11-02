import type { BudgetPeriod, Participant } from "../../domain/shared/types.ts";
import type { Transaction } from "../../domain/ledger/transaction.ts";
import type { DashboardOverview } from "../../application/use-cases/dashboard/types.ts";
import type { BudgetOverview } from "../../application/use-cases/budgets/types.ts";
import type { TransactionListItem } from "../../application/use-cases/transactions/types.ts";

/**
 * Session-level cache for reducing redundant repository calls.
 * Caches are keyed by relevant identifiers and invalidated on mutations.
 * 
 * Lifetime: Application session (cleared on page reload)
 */
export class SessionCache {
  // Dashboard caches by period ID
  private dashboardCache = new Map<BudgetPeriod["id"], DashboardOverview>();

  // Budget overview caches by period ID
  private budgetCache = new Map<BudgetPeriod["id"], BudgetOverview>();

  // Transactions list cache (single instance)
  private transactionsCache: TransactionListItem[] | null = null;

  // People (participants + balances) cache
  private participantsCache: Participant[] | null = null;
  private transactionsForPeopleCache: Transaction[] | null = null;

  // Reference data cache
  private referenceDataCacheKey = Symbol("referenceData");
  private referenceDataCache: Map<symbol, unknown> = new Map();

  // Invalidation trackers to detect mutations
  private transactionMutationCount = 0;
  private settlementMutationCount = 0;
  private budgetMutationCount = 0;
  private participantMutationCount = 0;
  private categoryMutationCount = 0;

  /**
   * Get cached dashboard overview if exists
   */
  getDashboard(periodId: BudgetPeriod["id"]): DashboardOverview | null {
    return this.dashboardCache.get(periodId) ?? null;
  }

  /**
   * Cache dashboard overview for a period
   */
  setDashboard(periodId: BudgetPeriod["id"], overview: DashboardOverview): void {
    this.dashboardCache.set(periodId, overview);
  }

  /**
   * Get cached budget overview if exists
   */
  getBudget(periodId: BudgetPeriod["id"]): BudgetOverview | null {
    return this.budgetCache.get(periodId) ?? null;
  }

  /**
   * Cache budget overview for a period
   */
  setBudget(periodId: BudgetPeriod["id"], overview: BudgetOverview): void {
    this.budgetCache.set(periodId, overview);
  }

  /**
   * Get cached transaction list if exists
   */
  getTransactions(): TransactionListItem[] | null {
    return this.transactionsCache;
  }

  /**
   * Cache transaction list
   */
  setTransactions(items: TransactionListItem[]): void {
    this.transactionsCache = items;
  }

  /**
   * Get cached participants if exists
   */
  getParticipants(): Participant[] | null {
    return this.participantsCache;
  }

  /**
   * Cache participants
   */
  setParticipants(participants: Participant[]): void {
    this.participantsCache = participants;
  }

  /**
   * Get cached transactions for people view if exists
   */
  getTransactionsForPeople(): Transaction[] | null {
    return this.transactionsForPeopleCache;
  }

  /**
   * Cache transactions for people view
   */
  setTransactionsForPeople(transactions: Transaction[]): void {
    this.transactionsForPeopleCache = transactions;
  }

  /**
   * Store reference data with a specific key
   */
  setReferenceData<T>(key: string, data: T): void {
    this.referenceDataCache.set(key as unknown as symbol, data);
  }

  /**
   * Retrieve reference data
   */
  getReferenceData<T>(key: string): T | null {
    return (this.referenceDataCache.get(key as unknown as symbol) as T) ?? null;
  }

  /**
   * Invalidate dashboard cache for affected periods
   * If periodId provided, invalidate only that period; otherwise invalidate all
   */
  invalidateDashboard(periodId?: BudgetPeriod["id"]): void {
    if (periodId) {
      this.dashboardCache.delete(periodId);
    } else {
      this.dashboardCache.clear();
    }
    this.transactionMutationCount++;
  }

  /**
   * Invalidate budget cache for affected periods
   */
  invalidateBudget(periodId?: BudgetPeriod["id"]): void {
    if (periodId) {
      this.budgetCache.delete(periodId);
    } else {
      this.budgetCache.clear();
    }
    this.budgetMutationCount++;
  }

  /**
   * Invalidate transactions cache
   */
  invalidateTransactions(): void {
    this.transactionsCache = null;
    this.transactionMutationCount++;
  }

  /**
   * Invalidate participants/people cache
   */
  invalidateParticipants(): void {
    this.participantsCache = null;
    this.transactionsForPeopleCache = null;
    this.participantMutationCount++;
  }

  /**
   * Invalidate reference data by key
   */
  invalidateReferenceData(key?: string): void {
    if (key) {
      this.referenceDataCache.delete(key as unknown as symbol);
    } else {
      this.referenceDataCache.clear();
    }
  }

  /**
   * Invalidate all caches (used on major mutations)
   */
  invalidateAll(): void {
    this.dashboardCache.clear();
    this.budgetCache.clear();
    this.transactionsCache = null;
    this.participantsCache = null;
    this.transactionsForPeopleCache = null;
    this.referenceDataCache.clear();
    this.transactionMutationCount++;
    this.settlementMutationCount++;
    this.budgetMutationCount++;
    this.participantMutationCount++;
    this.categoryMutationCount++;
  }

  /**
   * Clear all caches completely (for testing)
   */
  clear(): void {
    this.dashboardCache.clear();
    this.budgetCache.clear();
    this.transactionsCache = null;
    this.participantsCache = null;
    this.transactionsForPeopleCache = null;
    this.referenceDataCache.clear();
  }

  /**
   * Get stats for debugging
   */
  getStats(): {
    dashboardCacheSize: number;
    budgetCacheSize: number;
    hasTransactionsCache: boolean;
    hasParticipantsCache: boolean;
    referenceDataKeys: number;
  } {
    return {
      dashboardCacheSize: this.dashboardCache.size,
      budgetCacheSize: this.budgetCache.size,
      hasTransactionsCache: this.transactionsCache !== null,
      hasParticipantsCache: this.participantsCache !== null,
      referenceDataKeys: this.referenceDataCache.size,
    };
  }
}

// Global session cache instance
export const sessionCache = new SessionCache();
