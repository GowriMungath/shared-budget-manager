import { validateTransaction } from "../../../domain/ledger/transaction.ts";
import { backupSchema, type BackupData, type BackupDocument } from "./schema.ts";
import type { SharedBudgetManagerDatabase } from "./database.ts";
import { UnsupportedBackupVersionError, PersistenceValidationError } from "./errors.ts";
import {
  budgetLimitFromRecord,
  budgetPeriodFromRecord,
  categoryFromRecord,
  goalFromRecord,
  householdFromRecord,
  obligationFromRecord,
  participantFromRecord,
  paymentMethodFromRecord,
  settlementFromRecord,
  transactionFromRecords,
} from "./mappers.ts";

export const BACKUP_SCHEMA_VERSION = 1;

export async function exportBackup(db: SharedBudgetManagerDatabase): Promise<BackupDocument> {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      households: await db.households.toArray(),
      participants: await db.participants.toArray(),
      categories: await db.categories.toArray(),
      budgetPeriods: await db.budgetPeriods.toArray(),
      budgetLimits: await db.budgetLimits.toArray(),
      transactions: await db.transactions.toArray(),
      allocations: await db.allocations.toArray(),
      settlements: await db.settlements.toArray(),
      paymentMethods: await db.paymentMethods.toArray(),
      goals: await db.goals.toArray(),
      obligations: await db.obligations.toArray(),
    },
  };
}

function validateBackupRecords(data: BackupData): void {
  data.households.forEach(householdFromRecord);
  data.participants.forEach(participantFromRecord);
  data.categories.forEach(categoryFromRecord);
  data.budgetPeriods.forEach(budgetPeriodFromRecord);
  data.budgetLimits.forEach(budgetLimitFromRecord);
  data.settlements.forEach(settlementFromRecord);
  data.paymentMethods.forEach(paymentMethodFromRecord);
  data.goals.forEach(goalFromRecord);
  data.obligations.forEach(obligationFromRecord);

  for (const transaction of data.transactions) {
    const allocations = data.allocations.filter((allocation) => allocation.transactionId === transaction.id);
    validateTransaction(transactionFromRecords(transaction, allocations));
  }
}

export async function restoreBackup(db: SharedBudgetManagerDatabase, input: unknown): Promise<void> {
  const parsed = backupSchema.safeParse(input);

  if (!parsed.success) {
    throw new PersistenceValidationError("Invalid backup format", parsed.error);
  }

  if (parsed.data.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new UnsupportedBackupVersionError(parsed.data.schemaVersion);
  }

  validateBackupRecords(parsed.data.data);

  await db.transaction(
    "rw",
    [
      db.households,
      db.participants,
      db.categories,
      db.budgetPeriods,
      db.budgetLimits,
      db.transactions,
      db.allocations,
      db.settlements,
      db.paymentMethods,
      db.goals,
      db.obligations,
    ],
    async () => {
      await Promise.all([
        db.households.clear(),
        db.participants.clear(),
        db.categories.clear(),
        db.budgetPeriods.clear(),
        db.budgetLimits.clear(),
        db.transactions.clear(),
        db.allocations.clear(),
        db.settlements.clear(),
        db.paymentMethods.clear(),
        db.goals.clear(),
        db.obligations.clear(),
      ]);

      await Promise.all([
        db.households.bulkPut(parsed.data.data.households),
        db.participants.bulkPut(parsed.data.data.participants),
        db.categories.bulkPut(parsed.data.data.categories),
        db.budgetPeriods.bulkPut(parsed.data.data.budgetPeriods),
        db.budgetLimits.bulkPut(parsed.data.data.budgetLimits),
        db.transactions.bulkPut(parsed.data.data.transactions),
        db.allocations.bulkPut(parsed.data.data.allocations),
        db.settlements.bulkPut(parsed.data.data.settlements),
        db.paymentMethods.bulkPut(parsed.data.data.paymentMethods),
        db.goals.bulkPut(parsed.data.data.goals),
        db.obligations.bulkPut(parsed.data.data.obligations),
      ]);
    },
  );
}
