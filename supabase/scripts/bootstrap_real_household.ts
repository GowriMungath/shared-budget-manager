import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/infrastructure/supabase/types.ts";

/**
 * Bootstrap Real Household (One-Time Setup)
 *
 * This script creates the permanent household and adds Gowri and Nathaniel
 * with their participant records.
 *
 * IMPORTANT:
 * - Passwords must come from shell environment variables only
 * - This script uses the publishable key (not service_role)
 * - It is idempotent: safe to run multiple times
 * - It does NOT create financial data (categories, budgets, transactions)
 * - It does NOT start Phase B sync
 * - It does NOT modify IndexedDB
 *
 * Environment Variables (from .env.rls.local or shell):
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY
 * - RLS_GOWRI_EMAIL
 * - RLS_NATHANIEL_EMAIL
 *
 * Environment Variables (from shell only, NOT in .env file):
 * - RLS_GOWRI_PASSWORD
 * - RLS_NATHANIEL_PASSWORD
 */

// Configuration
const PERMANENT_HOUSEHOLD_NAME = "Gowri & Nathaniel";
const GOWRI_PARTICIPANT_NAME = "Gowri";
const NATHANIEL_PARTICIPANT_NAME = "Nathaniel";
const GOWRI_MEMBER_KEY = "gowri";
const NATHANIEL_MEMBER_KEY = "nathaniel";

// Test configuration
const TEST_PREFIX = "RLS_TEST_";

// Global state
let gowriClient: ReturnType<typeof createClient<Database>> | null = null;
let nathanielClient: ReturnType<typeof createClient<Database>> | null = null;
let gowriUserId: string = "";
let nathanielUserId: string = "";
let householdId: string = "";

// ============================================================================
// UTILITIES
// ============================================================================

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<ReturnType<typeof createClient<Database>>> {
  const url = getEnvVar("VITE_SUPABASE_URL");
  const key = getEnvVar("VITE_SUPABASE_PUBLISHABLE_KEY");
  const client = createClient<Database>(url, key);

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Failed to authenticate ${email}: ${error?.message || "No session"}`);
  }

  return client;
}

async function signOut(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  await client.auth.signOut();
}

function log(message: string): void {
  console.log(`[BOOTSTRAP] ${message}`);
}

function logSuccess(message: string): void {
  console.log(`✓ ${message}`);
}

function logWarning(message: string): void {
  console.warn(`⚠️  ${message}`);
}

// ============================================================================
// MAIN FLOW
// ============================================================================

async function main(): Promise<void> {
  log("========================================================");
  log("REAL HOUSEHOLD BOOTSTRAP");
  log("========================================================\n");

  try {
    // Verify environment variables
    log("Verifying environment variables...");
    getEnvVar("VITE_SUPABASE_URL");
    getEnvVar("VITE_SUPABASE_PUBLISHABLE_KEY");
    getEnvVar("RLS_GOWRI_EMAIL");
    getEnvVar("RLS_GOWRI_PASSWORD");
    getEnvVar("RLS_NATHANIEL_EMAIL");
    getEnvVar("RLS_NATHANIEL_PASSWORD");
    logSuccess("All required environment variables present\n");

    // Step 1: Authenticate Gowri
    log("Step 1: Authenticating Gowri...");
    const gowriEmail = getEnvVar("RLS_GOWRI_EMAIL");
    const gowriPassword = getEnvVar("RLS_GOWRI_PASSWORD");
    gowriClient = await createAuthenticatedClient(gowriEmail, gowriPassword);

    const { data: gowriAuthData, error: gowriAuthError } = await gowriClient.auth.getUser();
    if (gowriAuthError || !gowriAuthData.user) {
      throw new Error(`Failed to get Gowri's user data: ${gowriAuthError?.message || "Unknown error"}`);
    }
    gowriUserId = gowriAuthData.user.id;
    logSuccess(`Gowri authenticated (${gowriEmail})`);
    logSuccess(`Gowri user ID: ${gowriUserId}\n`);

    // Step 2: Check for existing permanent household or create new one
    log("Step 2: Checking for existing permanent household...");
    let existingHousehold = false;

    const { data: households, error: householdError } = await gowriClient
      .from("households")
      .select("id")
      .eq("name", PERMANENT_HOUSEHOLD_NAME);

    if (householdError) {
      throw new Error(`Failed to query households: ${householdError.message}`);
    }

    // Filter out any RLS_TEST_ households (should not exist in permanent setup, but be safe)
    const permanentHouseholds = (households || []).filter((h) => !h.id.includes(TEST_PREFIX));

    if (permanentHouseholds.length > 0) {
      householdId = permanentHouseholds[0].id;
      existingHousehold = true;
      logWarning(`Permanent household already exists (${PERMANENT_HOUSEHOLD_NAME})`);
      logSuccess(`Reusing household ID: ${householdId}\n`);

      // Verify Gowri is owner
      const { data: gowriMembership, error: membershipError } = await gowriClient
        .from("household_members")
        .select("role")
        .eq("household_id", householdId)
        .eq("user_id", gowriUserId)
        .single();

      if (membershipError) {
        throw new Error(`Failed to verify Gowri's membership: ${membershipError.message}`);
      }

      if (!gowriMembership || gowriMembership.role !== "owner") {
        throw new Error(`Gowri is not owner of the permanent household`);
      }

      logSuccess("Gowri is owner of the permanent household\n");
    } else {
      log("Creating new permanent household...");

      // Use the RPC to create household (same as test flow)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC method not in type definitions
      const rpcResult = await (gowriClient as any).rpc("create_household_for_current_user", {
        name: PERMANENT_HOUSEHOLD_NAME,
      });

      const { data: newHouseholdId, error: rpcError } = rpcResult;

      if (rpcError || !newHouseholdId) {
        throw new Error(
          `Failed to create household: ${rpcError?.message || "No household ID returned"}`
        );
      }

      householdId = newHouseholdId;
      logSuccess(`Created permanent household: ${PERMANENT_HOUSEHOLD_NAME}`);
      logSuccess(`Household ID: ${householdId}`);
      logSuccess("Gowri is owner\n");
    }

    // Step 3: Authenticate Nathaniel
    log("Step 3: Authenticating Nathaniel...");
    const nathanielEmail = getEnvVar("RLS_NATHANIEL_EMAIL");
    const nathanielPassword = getEnvVar("RLS_NATHANIEL_PASSWORD");
    nathanielClient = await createAuthenticatedClient(nathanielEmail, nathanielPassword);

    const { data: nathanielAuthData, error: nathanielAuthError } = await nathanielClient.auth.getUser();
    if (nathanielAuthError || !nathanielAuthData.user) {
      throw new Error(
        `Failed to get Nathaniel's user data: ${nathanielAuthError?.message || "Unknown error"}`
      );
    }
    nathanielUserId = nathanielAuthData.user.id;
    logSuccess(`Nathaniel authenticated (${nathanielEmail})`);
    logSuccess(`Nathaniel user ID: ${nathanielUserId}\n`);

    // Step 4: Add Nathaniel to household if needed
    log("Step 4: Checking Nathaniel's household membership...");

    const { data: nathanielExisting, error: nathanielCheckError } = await gowriClient
      .from("household_members")
      .select("id, role")
      .eq("household_id", householdId)
      .eq("user_id", nathanielUserId)
      .single();

    if (nathanielCheckError && nathanielCheckError.code !== "PGRST116") {
      // PGRST116 = not found (expected if not a member yet)
      throw new Error(`Failed to check Nathaniel's membership: ${nathanielCheckError.message}`);
    }

    if (nathanielExisting) {
      // Already a member
      if (nathanielExisting.role !== "member") {
        throw new Error(`Nathaniel exists but has unexpected role: ${nathanielExisting.role}`);
      }
      logWarning("Nathaniel is already a member of the permanent household");
      logSuccess(`Reusing membership\n`);
    } else {
      // Add as member
      log("Adding Nathaniel as member...");

      const { error: addError } = await gowriClient
        .from("household_members")
        .insert({
          household_id: householdId,
          user_id: nathanielUserId,
          role: "member",
        });

      if (addError) {
        throw new Error(`Failed to add Nathaniel: ${addError.message}`);
      }

      logSuccess("Nathaniel added as member\n");
    }

    // Step 5: Create/verify permanent participant records
    log("Step 5: Creating permanent participant records...");

    // Gowri participant
    let gowriParticipantExists = false;
    let gowriParticipantId = "";

    const { data: existingGowriParticipants, error: gowriParticipantError } = await gowriClient
      .from("participants")
      .select("id")
      .eq("household_id", householdId)
      .eq("member_key", GOWRI_MEMBER_KEY)
      .single();

    if (gowriParticipantError && gowriParticipantError.code !== "PGRST116") {
      throw new Error(`Failed to check Gowri participant: ${gowriParticipantError.message}`);
    }

    if (existingGowriParticipants) {
      gowriParticipantExists = true;
      gowriParticipantId = existingGowriParticipants.id;
      logWarning(`Gowri participant already exists (member_key="${GOWRI_MEMBER_KEY}")`);
      logSuccess(`Reusing participant ID: ${gowriParticipantId}`);
    } else {
      const { data: newGowriParticipant, error: createGowriError } = await gowriClient
        .from("participants")
        .insert({
          household_id: householdId,
          name: GOWRI_PARTICIPANT_NAME,
          kind: "household-member",
          member_key: GOWRI_MEMBER_KEY,
        })
        .select()
        .single();

      if (createGowriError || !newGowriParticipant) {
        throw new Error(`Failed to create Gowri participant: ${createGowriError?.message}`);
      }

      gowriParticipantId = newGowriParticipant.id;
      logSuccess(`Created Gowri participant (member_key="${GOWRI_MEMBER_KEY}")`);
      logSuccess(`Gowri participant ID: ${gowriParticipantId}`);
    }

    // Nathaniel participant
    let nathanielParticipantExists = false;
    let nathanielParticipantId = "";

    const { data: existingNathanielParticipants, error: nathanielParticipantError } = await gowriClient
      .from("participants")
      .select("id")
      .eq("household_id", householdId)
      .eq("member_key", NATHANIEL_MEMBER_KEY)
      .single();

    if (nathanielParticipantError && nathanielParticipantError.code !== "PGRST116") {
      throw new Error(`Failed to check Nathaniel participant: ${nathanielParticipantError.message}`);
    }

    if (existingNathanielParticipants) {
      nathanielParticipantExists = true;
      nathanielParticipantId = existingNathanielParticipants.id;
      logWarning(`Nathaniel participant already exists (member_key="${NATHANIEL_MEMBER_KEY}")`);
      logSuccess(`Reusing participant ID: ${nathanielParticipantId}`);
    } else {
      const { data: newNathanielParticipant, error: createNathanielError } = await gowriClient
        .from("participants")
        .insert({
          household_id: householdId,
          name: NATHANIEL_PARTICIPANT_NAME,
          kind: "household-member",
          member_key: NATHANIEL_MEMBER_KEY,
        })
        .select()
        .single();

      if (createNathanielError || !newNathanielParticipant) {
        throw new Error(`Failed to create Nathaniel participant: ${createNathanielError?.message}`);
      }

      nathanielParticipantId = newNathanielParticipant.id;
      logSuccess(`Created Nathaniel participant (member_key="${NATHANIEL_MEMBER_KEY}")`);
      logSuccess(`Nathaniel participant ID: ${nathanielParticipantId}`);
    }

    // Sign out
    await signOut(gowriClient);
    await signOut(nathanielClient);

    // Report final state
    console.log("\n========================================================");
    console.log("BOOTSTRAP COMPLETE - PERMANENT HOUSEHOLD STATE");
    console.log("========================================================");
    console.log(`Household: ${PERMANENT_HOUSEHOLD_NAME}`);
    console.log(`Household ID: ${householdId}`);
    console.log("");
    console.log(`Members:`);
    console.log(`  - Gowri (${gowriEmail}), role=owner`);
    console.log(`  - Nathaniel (${nathanielEmail}), role=member`);
    console.log("");
    console.log(`Participants (Financial):`);
    console.log(`  - ${GOWRI_PARTICIPANT_NAME} (ID: ${gowriParticipantId}, member_key="${GOWRI_MEMBER_KEY}")`);
    console.log(`  - ${NATHANIEL_PARTICIPANT_NAME} (ID: ${nathanielParticipantId}, member_key="${NATHANIEL_MEMBER_KEY}")`);
    console.log("");
    console.log(`Idempotency:`);
    console.log(`  - Household: ${existingHousehold ? "reused" : "created"}`);
    console.log(
      `  - Gowri participant: ${gowriParticipantExists ? "reused" : "created"}`
    );
    console.log(
      `  - Nathaniel participant: ${nathanielParticipantExists ? "reused" : "created"}`
    );
    console.log("");
    console.log("Ready for Phase A financial data migration.");
    console.log("========================================================\n");

    process.exit(0);
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Top-level error catch
    const error = err as any;
    console.error("\n========================================================");
    console.error("BOOTSTRAP FAILED");
    console.error("========================================================");
    console.error(error?.message || String(err));
    console.error(error?.stack || "");
    process.exit(1);
  }
}

main();
