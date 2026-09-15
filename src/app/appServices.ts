import { cryptoIdService } from "../application/services/idService.ts";
import { BudgetUseCases } from "../application/use-cases/budgets/budgetUseCases.ts";
import { DashboardUseCases } from "../application/use-cases/dashboard/dashboardUseCases.ts";
import { TransactionUseCases } from "../application/use-cases/transactions/transactionUseCases.ts";
import { createDatabase, type SharedBudgetManagerDatabase } from "../infrastructure/persistence/indexeddb/database.ts";
import { createRepositories } from "../infrastructure/persistence/indexeddb/repositories.ts";
import { initializeDatabase } from "../infrastructure/persistence/indexeddb/seed.ts";

export interface AppServices {
  db: SharedBudgetManagerDatabase;
  transactions: TransactionUseCases;
  budgets: BudgetUseCases;
  dashboard: DashboardUseCases;
}

export async function createAppServices(): Promise<AppServices> {
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

  return {
    db,
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
