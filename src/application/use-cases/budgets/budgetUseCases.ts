import { calculateBudgetUsage } from "../../../domain/budget/budget.ts";
import { assertCalendarDate, periodElapsedPercent } from "../../../domain/budget/calendar.ts";
import { cents, parseMoney } from "../../../domain/money/money.ts";
import { budgetLimitId, budgetPeriodId, categoryId } from "../../../domain/shared/ids.ts";
import type { BudgetLimit, BudgetPeriod, Category, Cents, ParticipantId } from "../../../domain/shared/types.ts";
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
    if (input.scope === "personal" && !input.ownerParticipantId) {
      throw new BudgetApplicationError("Personal budget requires an owner");
    }
    const existing = (await this.dependencies.budgetLimits.listForPeriod(input.budgetPeriodId)).find(
      (limit) =>
        limit.categoryId === input.categoryId &&
        limit.scope === input.scope &&
        (limit.ownerParticipantId ?? undefined) === (input.ownerParticipantId ?? undefined),
    );
    const limit: BudgetLimit = {
      id: existing?.id ?? budgetLimitId(this.dependencies.ids.createId()),
      budgetPeriodId: input.budgetPeriodId,
      categoryId: input.categoryId,
      scope: input.scope,
      ownerParticipantId: input.ownerParticipantId,
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
      groupName: input.groupName?.trim() || (input.scope === "shared" ? "Shared" : "Personal"),
      scope: input.scope,
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
    const makeSummary = (
      category: Category,
      scope: "shared" | "personal",
      ownerParticipantId?: ParticipantId,
    ): BudgetCategorySummary => {
      const limit = limits.find(
        (item) =>
          item.categoryId === category.id &&
          item.scope === scope &&
          (item.ownerParticipantId ?? undefined) === (ownerParticipantId ?? undefined),
      );
      const syntheticLimit: BudgetLimit =
        limit ??
        ({
          id: budgetLimitId("unbudgeted"),
          budgetPeriodId: period.id,
          categoryId: category.id,
          scope,
          ownerParticipantId,
          limitCents: cents(0),
        } satisfies BudgetLimit);
      const usage = calculateBudgetUsage(syntheticLimit, period, transactions, participants, householdMemberIds);
      const spentCents = usage.spentCents;
      const status = paceStatus(limit, spentCents, periodPercentElapsed);
      return {
        categoryId: category.id,
        categoryName: category.name,
        groupName: category.groupName,
        scope,
        ownerParticipantId,
        budgetLimitId: limit?.id,
        budgetedCents: limit?.limitCents,
        spentCents,
        remainingCents: limit ? cents(limit.limitCents - spentCents) : undefined,
        percentUsed: limit && limit.limitCents > 0 ? spentCents / limit.limitCents : undefined,
        periodPercentElapsed,
        paceStatus: status,
        archived: category.archived,
      };
    };
    const summarizeSection = (
      key: string,
      label: string,
      scope: "shared" | "personal",
      ownerParticipantId: ParticipantId | undefined,
      sectionCategories: Category[],
    ): BudgetSectionSummary => {
      const categorySummaries = sectionCategories.map((category) => makeSummary(category, scope, ownerParticipantId));
      const totalBudgeted = categorySummaries.reduce((sum, item) => sum + (item.budgetedCents ?? 0), 0);
      const totalSpent = categorySummaries.reduce((sum, item) => sum + item.spentCents, 0);
      const totalRemaining = categorySummaries.reduce((sum, item) => sum + (item.remainingCents ?? 0), 0);
      const unbudgetedSpent = categorySummaries.reduce(
        (sum, item) => sum + (item.budgetedCents === undefined ? item.spentCents : 0),
        0,
      );
      return {
        key,
        label,
        scope,
        ownerParticipantId,
        totalBudgetedCents: cents(totalBudgeted),
        totalSpentCents: cents(totalSpent),
        totalRemainingCents: cents(totalRemaining),
        unbudgetedSpentCents: cents(unbudgetedSpent),
        categories: categorySummaries,
      };
    };
    const sharedCategories = categories.filter((category) => category.scope === "shared");
    const personalCategories = categories.filter((category) => category.scope === "personal");
    return {
      period,
      periods,
      householdMembers,
      sections: [
        summarizeSection("shared", "Shared", "shared", undefined, sharedCategories),
        ...householdMembers.map((member) =>
          summarizeSection(member.id, `${member.name} Personal`, "personal", member.id, personalCategories),
        ),
      ],
    };
  }
}
