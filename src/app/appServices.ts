import type { User } from "@supabase/supabase-js";
import { cryptoIdService } from "../application/services/idService.ts";
import { BudgetUseCases } from "../application/use-cases/budgets/budgetUseCases.ts";
import { DashboardUseCases } from "../application/use-cases/dashboard/dashboardUseCases.ts";
import { TransactionUseCases } from "../application/use-cases/transactions/transactionUseCases.ts";
import { PeopleUseCases } from "../application/use-cases/people/peopleUseCases.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../infrastructure/persistence/indexeddb/repositories.ts";
import { initializeDatabase } from "../infrastructure/persistence/indexeddb/seed.ts";
import { isCloudMode } from "../infrastructure/config.ts";
import { createCloudAppServices } from "./cloudAppServices.ts";

export interface AppServices {
  db: SharedBudgetManagerDatabase | null;
  householdName: string;
  transactions: TransactionUseCases;
  budgets: BudgetUseCases;
  dashboard: DashboardUseCases;
  people: PeopleUseCases;
}

/**
 * Create app services based on mode
 * LOCAL MODE: IndexedDB-backed with seeded reference data
 * CLOUD MODE: Supabase-backed, requires authenticated user
 */
export async function createAppServices(user?: User): Promise<AppServices> {
  if (isCloudMode()) {
    if (!user) {
      throw new Error("Cloud mode requires an authenticated user");
    }
    return createCloudAppServices(user);
  }

  // LOCAL MODE: use IndexedDB
  const db = createDatabase();
  await db.open();
  await initializeDatabase(db);
  const repositories = createRepositories(db);

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

  const people = new PeopleUseCases({
    participants: repositories.participants,
    settlements: repositories.settlements,
    transactions: repositories.transactions,
    ids: cryptoIdService,
  });

  return {
    db,
    householdName: "Gowri & Nathaniel", // Local mode uses seeded household name
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
    people,
  };
}
