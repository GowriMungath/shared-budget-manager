import type { User } from "@supabase/supabase-js";
import { cryptoIdService } from "../application/services/idService.ts";
import { BudgetUseCases } from "../application/use-cases/budgets/budgetUseCases.ts";
import { DashboardUseCases } from "../application/use-cases/dashboard/dashboardUseCases.ts";
import { TransactionUseCases } from "../application/use-cases/transactions/transactionUseCases.ts";
import { createSupabaseRepositories } from "../infrastructure/supabase/repositories.ts";
import { householdResolver } from "../application/auth/householdResolver.ts";
import { householdService } from "../application/auth/householdService.ts";
import type { AppServices } from "./appServices.ts";

/**
 * Create app services for CLOUD mode using Supabase repositories
 * Resolves user's household from Supabase first
 */
export async function createCloudAppServices(user: User): Promise<AppServices> {
  // Resolve the user's household from Supabase
  const householdId = await householdResolver.resolveHouseholdForUser(user.id);

  // Load household details
  const household = await householdService.getPrimaryHousehold(user.id);
  if (!household) {
    throw new Error("Could not load household details");
  }

  // Create Supabase-backed repositories for this household
  const repositories = createSupabaseRepositories(householdId);

  const transactions = new TransactionUseCases({
    transactions: repositories.transactions,
    participants: repositories.participants,
    categories: repositories.categories,
    paymentMethods: repositories.paymentMethods,
    ids: cryptoIdService,
  });

  const budgets = new BudgetUseCases({
    budgetPeriods: repositories.budgetPeriods,
    budgetLimits: repositories.budgetLimits,
    categories: repositories.categories,
    participants: repositories.participants,
    transactions: repositories.transactions,
    ids: cryptoIdService,
  });

  return {
    db: null, // Cloud mode doesn't use IndexedDB as primary storage
    householdName: household.name,
    transactions,
    budgets,
    dashboard: new DashboardUseCases({
      budgets,
      transactions: repositories.transactions,
      participants: repositories.participants,
      categories: repositories.categories,
      settlements: repositories.settlements,
      goals: repositories.goals,
      obligations: repositories.obligations,
    }),
  };
}
