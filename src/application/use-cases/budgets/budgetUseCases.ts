import { calculateBudgetUsage } from "../../../domain/budget/budget.ts";
import { assertCalendarDate, periodElapsedPercent } from "../../../domain/budget/calendar.ts";
import { cents, parseMoney } from "../../../domain/money/money.ts";
import { budgetLimitId, budgetPeriodId, categoryId } from "../../../domain/shared/ids.ts";
import type { BudgetLimit, BudgetPeriod, Category, Cents } from "../../../domain/shared/types.ts";
import type {
  BudgetLimitRepository,
  BudgetPeriodRepository,
  CategoryRepository,
  ParticipantRepository,
  TransactionRepository,
} from "../../ports/repositories.ts";
import type { IdService } from "../../services/idService.ts";
import {
  BudgetApplicationError,
  type BudgetCategorySummary,
  type BudgetOverview,
  type BudgetSectionSummary,
  type CreateBudgetPeriodInput,
  type CreateCategoryInput,
  type PaceStatus,
  type SetBudgetLimitInput,
} from "./types.ts";

const paceThreshold = 0.1;

export interface BudgetUseCaseDependencies {
  budgetPeriods: BudgetPeriodRepository;
  budgetLimits: BudgetLimitRepository;
  categories: CategoryRepository;
  participants: ParticipantRepository;
  transactions: TransactionRepository;
  ids: IdService;
  today?: () => string;
}

function moneyInput(input: string): Cents {
  if (!input.trim()) {
    throw new BudgetApplicationError("Budget amount is required");
  }

  try {
    const parsed = parseMoney(input);
    if (parsed < 0) {
      throw new BudgetApplicationError("Budget amount cannot be negative");
    }
    return parsed;
  } catch (error) {
    if (error instanceof BudgetApplicationError) {
      throw error;
    }
    throw new BudgetApplicationError("Budget amount must be a valid dollar amount");
  }
}

function validatePeriodInput(input: CreateBudgetPeriodInput): void {
  if (!input.name.trim()) {
    throw new BudgetApplicationError("Budget period name is required");
  }
  assertCalendarDate(input.startDate, "Budget period startDate");
  assertCalendarDate(input.endDate, "Budget period endDate");
  if (input.startDate > input.endDate) {
    throw new BudgetApplicationError("Start date must be on or before end date");
  }
}

function paceStatus(limit: BudgetLimit | undefined, spentCents: Cents, periodElapsed: number): PaceStatus {
  if (!limit) {
    return "UNBUDGETED";
  }
  if (spentCents > limit.limitCents) {
    return "OVER_BUDGET";
  }
  const usagePercent = limit.limitCents === 0 ? 0 : spentCents / limit.limitCents;
  return usagePercent > periodElapsed + paceThreshold ? "AHEAD_OF_PACE" : "ON_TRACK";
}

export class BudgetUseCases {
  constructor(private readonly dependencies: BudgetUseCaseDependencies) {}

  async getBudgetPeriods(): Promise<BudgetPeriod[]> {
    return (await this.dependencies.budgetPeriods.listAll()).sort((left, right) =>
      left.startDate.localeCompare(right.startDate),
    );
  }

  async createBudgetPeriod(input: CreateBudgetPeriodInput): Promise<BudgetPeriod> {
    validatePeriodInput(input);
    const period: BudgetPeriod = {
      id: budgetPeriodId(this.dependencies.ids.createId()),
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
    };
    await this.dependencies.budgetPeriods.save(period);
    return period;
  }

  async setBudgetLimit(input: SetBudgetLimitInput): Promise<BudgetLimit> {
    const amount = moneyInput(input.amountInput);
    const existing = (await this.dependencies.budgetLimits.listForPeriod(input.budgetPeriodId)).find(
      (limit) => limit.categoryId === input.categoryId,
    );
    const limit: BudgetLimit = {
      id: existing?.id ?? budgetLimitId(this.dependencies.ids.createId()),
      budgetPeriodId: input.budgetPeriodId,
      categoryId: input.categoryId,
      scope: "shared",
      limitCents: amount,
    };
    await this.dependencies.budgetLimits.save(limit);
    return limit;
  }

  async removeBudgetLimit(limitId: BudgetLimit["id"]): Promise<void> {
    await this.dependencies.budgetLimits.delete(limitId);
  }

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    if (!input.name.trim()) {
      throw new BudgetApplicationError("Category name is required");
    }
    const category: Category = {
      id: categoryId(this.dependencies.ids.createId()),
      name: input.name.trim(),
      groupName: input.groupName?.trim() || "Other",
      archived: false,
    };
    await this.dependencies.categories.save(category);
    return category;
  }

  async renameCategory(categoryIdValue: Category["id"], name: string): Promise<Category> {
    const category = (await this.dependencies.categories.listAll()).find((item) => item.id === categoryIdValue);
    if (!category) {
      throw new BudgetApplicationError("Category was not found");
    }
    if (!name.trim()) {
      throw new BudgetApplicationError("Category name is required");
    }
    const updated = { ...category, name: name.trim() };
    await this.dependencies.categories.save(updated);
    return updated;
  }

  async archiveCategory(categoryIdValue: Category["id"]): Promise<Category> {
    const category = (await this.dependencies.categories.listAll()).find((item) => item.id === categoryIdValue);
    if (!category) {
      throw new BudgetApplicationError("Category was not found");
    }
    const updated = { ...category, archived: true };
    await this.dependencies.categories.save(updated);
    return updated;
  }

  async getBudgetOverview(periodIdValue?: BudgetPeriod["id"]): Promise<BudgetOverview> {
    const [periods, categories, participants, transactions] = await Promise.all([
      this.getBudgetPeriods(),
      this.dependencies.categories.listAll(),
      this.dependencies.participants.listAll(),
      this.dependencies.transactions.listAll(),
    ]);
    const period = periods.find((item) => item.id === periodIdValue) ?? periods[0];
    if (!period) {
      throw new BudgetApplicationError("No budget period exists");
    }
    const limits = await this.dependencies.budgetLimits.listForPeriod(period.id);
    const householdMembers = participants.filter((participant) => participant.kind === "household-member");
    const householdMemberIds = householdMembers.map((participant) => participant.id);
    const periodPercentElapsed = periodElapsedPercent(period, this.dependencies.today?.() ?? new Date().toISOString().slice(0, 10));
    
    // Check if this is a legacy period - uses legacy per-scope budget model
    // Legacy indicators: limits with personal scope, owner assignment, or multiple limits per category
    // (New Cycle 2 model uses only household-level limits: one per category, shared scope, no owner)
    const isLegacyPeriod = limits.some((limit) => {
      // Indicator 1: Explicit personal scope (legacy model had per-person budgets)
      if (limit.scope === "personal") return true;
      
      // Indicator 2: Owner-specific limit (legacy model tracked budgets per person)
      if (limit.ownerParticipantId) return true;
      
      // Indicator 3: Multiple limits for same category (legacy aggregated personal limits per category)
      const duplicates = limits.filter((l) => l.categoryId === limit.categoryId);
      if (duplicates.length > 1) return true;
      
      return false;
    });

    // For legacy periods: include both active and archived categories that have budget limits
    // For new periods: only show active categories
    const categoriesToDisplay = isLegacyPeriod
      ? categories.filter((cat) => limits.some((limit) => limit.categoryId === cat.id))
      : categories.filter((cat) => !cat.archived);
    
    const makeSummary = (category: Category): BudgetCategorySummary => {
      // For legacy periods: sum ALL budget limits for this category (handles multiple owner-specific rows)
      // For new periods: use single limit (one per category)
      const categoryLimits = limits.filter((item) => item.categoryId === category.id);
      const totalBudgetedCents = categoryLimits.reduce((sum, limit) => sum + limit.limitCents, 0);
      const hasLimits = categoryLimits.length > 0;
      
      // Create a neutral limit for spending calculation
      // Must NOT filter by scope/ownerParticipantId - new model sums ALL transactions in category
      // regardless of transaction.scope or allocation.participantId
      const neutralLimit: BudgetLimit = {
        id: budgetLimitId("neutral"),
        budgetPeriodId: period.id,
        categoryId: category.id,
        scope: "shared", // Always "shared" scope for calculation (counts all household members)
        limitCents: cents(totalBudgetedCents > 0 ? totalBudgetedCents : 0),
      };
      
      const usage = calculateBudgetUsage(neutralLimit, period, transactions, participants, householdMemberIds);
      const spentCents = usage.spentCents;
      
      // Pace status uses aggregated total
      const aggregatedLimit: BudgetLimit = {
        ...neutralLimit,
        limitCents: cents(totalBudgetedCents),
      };
      const status = paceStatus(hasLimits ? aggregatedLimit : undefined, spentCents, periodPercentElapsed);
      
      return {
        categoryId: category.id,
        categoryName: category.name,
        groupName: category.groupName,
        scope: "shared",
        budgetLimitId: categoryLimits[0]?.id,
        budgetedCents: hasLimits ? cents(totalBudgetedCents) : undefined,
        spentCents,
        remainingCents: hasLimits ? cents(totalBudgetedCents - spentCents) : undefined,
        percentUsed: hasLimits && totalBudgetedCents > 0 ? spentCents / totalBudgetedCents : undefined,
        periodPercentElapsed,
        paceStatus: status,
        archived: category.archived,
      };
    };
    
    const categorySummaries = categoriesToDisplay.map((category) => makeSummary(category));
    const totalBudgeted = categorySummaries.reduce((sum, item) => sum + (item.budgetedCents ?? 0), 0);
    const totalSpent = categorySummaries.reduce((sum, item) => sum + item.spentCents, 0);
    const totalRemaining = categorySummaries.reduce((sum, item) => sum + (item.remainingCents ?? 0), 0);
    const unbudgetedSpent = categorySummaries.reduce(
      (sum, item) => sum + (item.budgetedCents === undefined ? item.spentCents : 0),
      0,
    );
    
    const householdSection: BudgetSectionSummary = {
      key: "household",
      label: "Household Budget",
      scope: "shared",
      totalBudgetedCents: cents(totalBudgeted),
      totalSpentCents: cents(totalSpent),
      totalRemainingCents: cents(totalRemaining),
      unbudgetedSpentCents: cents(unbudgetedSpent),
      categories: categorySummaries,
    };
    
    return {
      period,
      periods,
      householdMembers,
      sections: [householdSection],
    };
  }
}
