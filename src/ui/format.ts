import { formatMoney } from "../domain/money/money.ts";
import type { Cents } from "../domain/shared/types.ts";

export function dollars(amount: Cents): string {
  return formatMoney(amount);
}
