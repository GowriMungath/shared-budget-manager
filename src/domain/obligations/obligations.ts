import { assertPositiveCents } from "../money/money.ts";
import type { Obligation } from "../shared/types.ts";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T/;

function assertIsoDate(value: string, label: string): void {
  if (!isoDatePattern.test(value)) {
    throw new Error(`${label} must be an ISO YYYY-MM-DD date`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date`);
  }
}

function assertIsoDateTime(value: string, label: string): void {
  if (!isoDateTimePattern.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${label} must be a valid ISO date-time`);
  }
}

export function validateObligation(obligation: Obligation): void {
  assertPositiveCents(obligation.amountCents, "Obligation amount");
  assertIsoDate(obligation.dueDate, "Obligation dueDate");
  assertIsoDateTime(obligation.createdAt, "Obligation createdAt");
  assertIsoDateTime(obligation.updatedAt, "Obligation updatedAt");

  if (obligation.description.trim().length === 0) {
    throw new Error("Obligation description is required");
  }

  if (obligation.ownerScope === "personal" && !obligation.ownerParticipantId) {
    throw new Error("Personal obligation requires ownerParticipantId");
  }

  if (obligation.ownerScope === "shared" && obligation.ownerParticipantId) {
    throw new Error("Shared obligation must not include ownerParticipantId");
  }
}
