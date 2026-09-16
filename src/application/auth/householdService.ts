import type { User } from "@supabase/supabase-js";
import { supabase } from "../../infrastructure/supabase/client.ts";
import type { Household, HouseholdId, MemberId } from "../../domain/shared/types.ts";
import { householdId, memberId } from "../../domain/shared/ids.ts";

interface HouseholdMemberRow {
  households: {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  } | null;
}

export class HouseholdService {
  /**
   * Get the primary household for the current user
   * Returns the first household they are a member of
   */
  async getPrimaryHousehold(userId: string): Promise<Household | null> {
    const { data, error } = await supabase
      .from("household_members")
      .select("households(id, name, created_at, updated_at)")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    const typedData = data as HouseholdMemberRow;
    const householdData = typedData.households;
    if (!householdData) {
      return null;
    }

    const hId = householdId(householdData.id);
    const memberIds = await this.loadHouseholdMemberIds(hId);

    return {
      id: hId,
      name: householdData.name,
      memberIds,
    };
  }

  /**
   * Get all households for the current user
   */
  async getUserHouseholds(userId: string): Promise<Household[]> {
    const { data, error } = await supabase
      .from("household_members")
      .select("households(id, name, created_at, updated_at)")
      .eq("user_id", userId);

    if (error || !data) {
      return [];
    }

    const typedData = data as HouseholdMemberRow[];
    const results: Household[] = [];
    for (const row of typedData) {
      const h = row.households;
      if (h) {
        const hId = householdId(h.id);
        const memberIds = await this.loadHouseholdMemberIds(hId);
        results.push({
          id: hId,
          name: h.name,
          memberIds,
        });
      }
    }
    return results;
  }

  /**
   * Load all participant IDs for household-member kind participants in a household
   */
  private async loadHouseholdMemberIds(householdId: HouseholdId): Promise<MemberId[]> {
    const { data, error } = await supabase
      .from("participants")
      .select("id")
      .eq("household_id", householdId)
      .eq("kind", "household-member");

    if (error || !data) {
      return [];
    }

    return data.map((p) => memberId(p.id));
  }

  /**
   * Create a new household and add the creator as owner
   */
  async createHousehold(user: User, householdName: string): Promise<{ household: Household | null; error: string | null }> {
    // Generate a UUID for the household
    const hId = householdId(crypto.randomUUID());

    // Create the household
    const { error: householdError } = await supabase.from("households").insert({
      id: hId,
      name: householdName,
    });

    if (householdError) {
      return { household: null, error: householdError.message };
    }

    // Add creator as owner
    const { error: memberError } = await supabase.from("household_members").insert({
      household_id: hId,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      return { household: null, error: memberError.message };
    }

    return {
      household: {
        id: hId,
        name: householdName,
        memberIds: [],
      },
      error: null,
    };
  }

  /**
   * Add an existing user to a household
   * Only household owners can do this
   */
  async addMemberToHousehold(
    householdId: HouseholdId,
    userId: string,
    requestingUserId: string
  ): Promise<{ error: string | null }> {
    // Check if requesting user is household owner
    const { data: member, error: checkError } = await supabase
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", requestingUserId)
      .single();

    if (checkError || !member || member.role !== "owner") {
      return { error: "Only household owners can add members" };
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", userId)
      .single();

    if (existingMember) {
      return { error: "User is already a member of this household" };
    }

    // Add the user as member
    const { error: addError } = await supabase.from("household_members").insert({
      household_id: householdId,
      user_id: userId,
      role: "member",
    });

    if (addError) {
      return { error: addError.message };
    }

    return { error: null };
  }

  /**
   * Get all members of a household
   */
  async getHouseholdMembers(householdId: HouseholdId) {
    const { data, error } = await supabase
      .from("household_members")
      .select("id, user_id, role, profiles(display_name)")
      .eq("household_id", householdId);

    if (error) {
      return { members: [], error: error.message };
    }

    return { members: data || [], error: null };
  }
}

export const householdService = new HouseholdService();
