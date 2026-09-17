import type { HouseholdId } from "../../domain/shared/types.ts";
import { householdService } from "./householdService.ts";

/**
 * Resolves the user's household from Supabase
 * In cloud mode, queries household_members to find the household
 * For MVP, expects exactly one household per user
 */
export class HouseholdResolver {
  async resolveHouseholdForUser(userId: string): Promise<HouseholdId> {
    const households = await householdService.getUserHouseholds(userId);

    if (households.length === 0) {
      throw new Error(
        "No household found for this user. Please create or join a household before accessing the app."
      );
    }

    if (households.length > 1) {
      throw new Error(
        "Multiple households found. MVP only supports single household per user. Please contact support."
      );
    }

    return households[0].id;
  }
}

export const householdResolver = new HouseholdResolver();
