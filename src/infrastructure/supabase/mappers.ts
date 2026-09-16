import type {
  BudgetLimit,
  BudgetPeriod,
  Category,
  Goal,
  Household,
  Obligation,
  Participant,
  PaymentMethod,
  HouseholdId,
  Cents,
} from "../../domain/shared/types.ts";
import * as Ids from "../../domain/shared/ids.ts";
import type { Transaction, Allocation } from "../../domain/ledger/transaction.ts";
import type { Settlement } from "../../domain/settlement/settlement.ts";
import type { Database } from "./types.ts";

type HouseholdRow = Database["public"]["Tables"]["households"]["Row"];
type ParticipantRow = Database["public"]["Tables"]["participants"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type BudgetPeriodRow = Database["public"]["Tables"]["budget_periods"]["Row"];
type BudgetLimitRow = Database["public"]["Tables"]["budget_limits"]["Row"];
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
type AllocationRow = Database["public"]["Tables"]["allocations"]["Row"];
type SettlementRow = Database["public"]["Tables"]["settlements"]["Row"];
type PaymentMethodRow = Database["public"]["Tables"]["payment_methods"]["Row"];
type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
type ObligationRow = Database["public"]["Tables"]["obligations"]["Row"];

export function householdFromRow(row: HouseholdRow): Household {
  return {
    id: Ids.householdId(row.id),
    name: row.name,
    memberIds: [], // Loaded separately via loadHouseholdMemberIds
  };
}

export function householdToRow(household: Household): Omit<HouseholdRow, "created_at" | "updated_at"> {
  return {
    id: household.id,
    name: household.name,
  };
}

export function participantFromRow(row: ParticipantRow): Participant {
  return {
    id: Ids.participantId(row.id),
    name: row.name,
    kind: row.kind,
    memberKey: row.member_key ?? undefined,
  };
}

export function participantToRow(
  participant: Participant,
  householdId: HouseholdId
): Omit<ParticipantRow, "created_at" | "updated_at"> {
  return {
    id: participant.id,
    household_id: householdId,
    name: participant.name,
    kind: participant.kind,
    member_key: participant.memberKey ?? null,
  };
}

export function categoryFromRow(row: CategoryRow): Category {
  return {
    id: Ids.categoryId(row.id),
    name: row.name,
    groupName: row.group_name,
    scope: row.scope,
    archived: row.archived,
  };
}

export function categoryToRow(
  category: Category,
  householdId: HouseholdId
): Omit<CategoryRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: category.id,
    household_id: householdId,
    name: category.name,
    group_name: category.groupName,
    scope: category.scope,
    archived: category.archived,
  };
}

export function budgetPeriodFromRow(row: BudgetPeriodRow): BudgetPeriod {
  return {
    id: Ids.budgetPeriodId(row.id),
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

export function budgetPeriodToRow(
  period: BudgetPeriod,
  householdId: HouseholdId
): Omit<BudgetPeriodRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: period.id,
    household_id: householdId,
    name: period.name,
    start_date: period.startDate,
    end_date: period.endDate,
  };
}

export function budgetLimitFromRow(row: BudgetLimitRow): BudgetLimit {
  return {
    id: Ids.budgetLimitId(row.id),
    budgetPeriodId: Ids.budgetPeriodId(row.budget_period_id),
    categoryId: Ids.categoryId(row.category_id),
    scope: row.scope,
    ownerParticipantId: row.owner_participant_id ? Ids.participantId(row.owner_participant_id) : undefined,
    limitCents: row.limit_cents as Cents,
  };
}

export function budgetLimitToRow(
  limit: BudgetLimit,
  householdId: HouseholdId
): Omit<BudgetLimitRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: limit.id,
    household_id: householdId,
    budget_period_id: limit.budgetPeriodId,
    category_id: limit.categoryId,
    scope: limit.scope,
    owner_participant_id: limit.ownerParticipantId ?? null,
    limit_cents: limit.limitCents,
  };
}

export function transactionFromRows(
  txRow: TransactionRow,
  allocations: AllocationRow[]
): Transaction {
  return {
    id: Ids.transactionId(txRow.id),
    kind: "expense",
    date: txRow.date,
    description: txRow.description,
    totalCents: txRow.total_cents as Cents,
    categoryId: Ids.categoryId(txRow.category_id),
    payerParticipantId: Ids.participantId(txRow.payer_participant_id),
    scope: "shared",
    allocations: allocations.map((a) => ({
      participantId: Ids.participantId(a.participant_id),
      amountCents: a.cents as Cents,
    })),
  };
}

export function transactionToRow(
  transaction: Transaction,
  householdId: HouseholdId
): Omit<TransactionRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: transaction.id,
    household_id: householdId,
    kind: "expense",
    date: transaction.date,
    description: transaction.description,
    total_cents: transaction.totalCents,
    category_id: transaction.categoryId,
    payer_participant_id: transaction.payerParticipantId,
  };
}

export function allocationToRow(
  allocation: Allocation,
  transactionId: string,
  householdId: HouseholdId,
  position: number
): Omit<AllocationRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: crypto.randomUUID(),
    household_id: householdId,
    transaction_id: transactionId,
    participant_id: allocation.participantId,
    position,
    cents: allocation.amountCents,
  };
}

export function settlementFromRow(row: SettlementRow): Settlement {
  return {
    id: Ids.settlementId(row.id),
    fromParticipantId: Ids.participantId(row.from_participant_id),
    toParticipantId: Ids.participantId(row.to_participant_id),
    amountCents: row.cents as Cents,
    date: row.date,
    type: "internal" as const,
    notes: row.notes ?? undefined,
  };
}

export function settlementToRow(
  settlement: Settlement,
  householdId: HouseholdId
): Omit<SettlementRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: settlement.id,
    household_id: householdId,
    from_participant_id: settlement.fromParticipantId,
    to_participant_id: settlement.toParticipantId,
    cents: settlement.amountCents,
    date: settlement.date,
    notes: settlement.notes ?? null,
  };
}

export function paymentMethodFromRow(row: PaymentMethodRow): PaymentMethod {
  return {
    id: Ids.paymentMethodId(row.id),
    name: row.name,
    ownerParticipantId: Ids.participantId(row.owner_participant_id),
  };
}

export function paymentMethodToRow(
  method: PaymentMethod,
  householdId: HouseholdId
): Omit<PaymentMethodRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: method.id,
    household_id: householdId,
    name: method.name,
    owner_participant_id: method.ownerParticipantId,
  };
}

export function goalFromRow(row: GoalRow): Goal {
  return {
    id: Ids.goalId(row.id),
    name: row.name,
    ownerParticipantId: Ids.participantId(row.owner_participant_id),
    targetCents: row.target_cents as Cents,
    currentSavedCents: row.current_saved_cents as Cents,
    deadlineMonth: row.deadline_month,
  };
}

export function goalToRow(
  goal: Goal,
  householdId: HouseholdId
): Omit<GoalRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: goal.id,
    household_id: householdId,
    name: goal.name,
    owner_participant_id: goal.ownerParticipantId,
    target_cents: goal.targetCents,
    current_saved_cents: goal.currentSavedCents,
    deadline_month: goal.deadlineMonth,
  };
}

export function obligationFromRow(row: ObligationRow): Obligation {
  return {
    id: Ids.obligationId(row.id),
    ownerScope: row.owner_scope,
    ownerParticipantId: row.owner_participant_id ? Ids.participantId(row.owner_participant_id) : undefined,
    description: row.description,
    amountCents: row.amount_cents as Cents,
    dueDate: row.due_date,
    status: row.status,
    type: row.type,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function obligationToRow(
  obligation: Obligation,
  householdId: HouseholdId
): Omit<ObligationRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: obligation.id,
    household_id: householdId,
    owner_scope: obligation.ownerScope,
    owner_participant_id: obligation.ownerParticipantId ?? null,
    description: obligation.description,
    amount_cents: obligation.amountCents,
    due_date: obligation.dueDate,
    status: obligation.status,
    type: obligation.type,
    notes: obligation.notes ?? null,
  };
}
