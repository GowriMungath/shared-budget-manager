import type { Cents } from "../shared/types.ts";

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money must be represented as safe integer cents. Received: ${value}`);
  }

  return value as Cents;
}

export function assertPositiveCents(value: Cents, label: string): void {
  cents(value);

  if (value <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
}

export function assertNonNegativeCents(value: Cents, label: string): void {
  cents(value);

  if (value < 0) {
    throw new Error(`${label} cannot be negative`);
  }
}

export function parseMoney(input: string): Cents {
  const normalized = input.trim().replace(/^\$/, "");
  const match = /^-?\d+(\.\d{1,2})?$/.exec(normalized);

  if (!match) {
    throw new Error(`Invalid money amount: ${input}`);
  }

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [dollars, centsPart = ""] = unsigned.split(".");
  const paddedCents = centsPart.padEnd(2, "0");
  const amount = Number(dollars) * 100 + Number(paddedCents);

  return cents(negative ? -amount : amount);
}

export function formatMoney(amount: Cents): string {
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  const dollars = Math.floor(absolute / 100);
  const centsPart = String(absolute % 100).padStart(2, "0");

  return `${sign}$${dollars}.${centsPart}`;
}

export function addCents(...amounts: Cents[]): Cents {
  return cents(amounts.reduce((sum, amount) => sum + amount, 0));
}

export function subtractCents(left: Cents, right: Cents): Cents {
  return cents(left - right);
}

export function sumCents(amounts: readonly Cents[]): Cents {
  return cents(amounts.reduce((sum, amount) => sum + amount, 0));
}

export function allocateEqually(totalCents: Cents, participantCount: number): Cents[] {
  assertNonNegativeCents(totalCents, "Split total");

  if (!Number.isSafeInteger(participantCount) || participantCount <= 0) {
    throw new Error("participantCount must be a positive integer");
  }

  const baseShare = Math.trunc(totalCents / participantCount);
  const remainder = totalCents - baseShare * participantCount;

  return Array.from({ length: participantCount }, (_, index) =>
    cents(baseShare + (index < remainder ? 1 : 0)),
  );
}

export function allocateByBasisPoints(totalCents: Cents, basisPoints: readonly number[]): Cents[] {
  assertNonNegativeCents(totalCents, "Split total");

  const totalBasisPoints = basisPoints.reduce((sum, value) => sum + value, 0);

  if (totalBasisPoints !== 10_000) {
    throw new Error("Percentage allocations must total exactly 10000 basis points");
  }

  const baseAllocations = basisPoints.map((basisPoint) => {
    if (!Number.isSafeInteger(basisPoint) || basisPoint < 0) {
      throw new Error("Basis point allocations must be non-negative integers");
    }

    return Math.trunc((totalCents * basisPoint) / 10_000);
  });
  const allocated = baseAllocations.reduce((sum, amount) => sum + amount, 0);
  let remainder = totalCents - allocated;

  return baseAllocations.map((amount) => {
    const extraCent = remainder > 0 ? 1 : 0;
    remainder -= extraCent;
    return cents(amount + extraCent);
  });
}
