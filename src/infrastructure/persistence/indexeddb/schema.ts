import { z } from "zod";

const centsSchema = z.number().int().safe();
const positiveCentsSchema = centsSchema.positive();
const nonNegativeCentsSchema = centsSchema.nonnegative();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const householdRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  memberIds: z.array(z.string()),
});

export const participantRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["household-member", "external"]),
  memberKey: z.string().optional(),
});

export const categoryRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupName: z.string(),
  scope: z.enum(["shared", "personal"]),
  archived: z.boolean(),
});

export const budgetPeriodRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
});

export const budgetLimitRecordSchema = z.object({
  id: z.string(),
  budgetPeriodId: z.string(),
  categoryId: z.string(),
  scope: z.enum(["shared", "personal"]),
  ownerParticipantId: z.string().optional(),
  limitCents: nonNegativeCentsSchema,
});

export const transactionRecordSchema = z.object({
  id: z.string(),
  kind: z.literal("expense"),
  date: isoDateSchema,
  description: z.string(),
  totalCents: positiveCentsSchema,
  categoryId: z.string(),
  payerParticipantId: z.string(),
  scope: z.enum(["shared", "personal"]),
  paymentMethodId: z.string().optional(),
  notes: z.string().optional(),
});

export const allocationRecordSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  participantId: z.string(),
  position: z.number().int().nonnegative(),
  amountCents: nonNegativeCentsSchema,
});

export const settlementRecordSchema = z.object({
  id: z.string(),
  fromParticipantId: z.string(),
  toParticipantId: z.string(),
  amountCents: positiveCentsSchema,
  date: isoDateSchema,
  type: z.enum(["internal", "external"]),
  notes: z.string().optional(),
});

export const paymentMethodRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerParticipantId: z.string(),
});

export const goalRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerParticipantId: z.string(),
  targetCents: positiveCentsSchema,
  currentSavedCents: nonNegativeCentsSchema,
  deadlineMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export const obligationRecordSchema = z.object({
  id: z.string(),
  ownerScope: z.enum(["shared", "personal"]),
  ownerParticipantId: z.string().optional(),
  description: z.string(),
  amountCents: positiveCentsSchema,
  dueDate: isoDateSchema,
  status: z.enum(["pending", "paid", "cancelled"]),
  type: z.enum(["credit_card_bill", "travel", "education", "visa", "utility", "other"]),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type HouseholdRecord = z.infer<typeof householdRecordSchema>;
export type ParticipantRecord = z.infer<typeof participantRecordSchema>;
export type CategoryRecord = z.infer<typeof categoryRecordSchema>;
export type BudgetPeriodRecord = z.infer<typeof budgetPeriodRecordSchema>;
export type BudgetLimitRecord = z.infer<typeof budgetLimitRecordSchema>;
export type TransactionRecord = z.infer<typeof transactionRecordSchema>;
export type AllocationRecord = z.infer<typeof allocationRecordSchema>;
export type SettlementRecord = z.infer<typeof settlementRecordSchema>;
export type PaymentMethodRecord = z.infer<typeof paymentMethodRecordSchema>;
export type GoalRecord = z.infer<typeof goalRecordSchema>;
export type ObligationRecord = z.infer<typeof obligationRecordSchema>;

export const backupDataSchema = z.object({
  households: z.array(householdRecordSchema),
  participants: z.array(participantRecordSchema),
  categories: z.array(categoryRecordSchema),
  budgetPeriods: z.array(budgetPeriodRecordSchema),
  budgetLimits: z.array(budgetLimitRecordSchema),
  transactions: z.array(transactionRecordSchema),
  allocations: z.array(allocationRecordSchema),
  settlements: z.array(settlementRecordSchema),
  paymentMethods: z.array(paymentMethodRecordSchema),
  goals: z.array(goalRecordSchema),
  obligations: z.array(obligationRecordSchema),
});

export const backupSchema = z.object({
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  data: backupDataSchema,
});

export type BackupData = z.infer<typeof backupDataSchema>;
export type BackupDocument = z.infer<typeof backupSchema>;
