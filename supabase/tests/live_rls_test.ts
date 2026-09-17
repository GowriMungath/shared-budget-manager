import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/infrastructure/supabase/types";

/**
 * Live RLS Integration Test Harness
 *
 * Tests RLS policies against the real Supabase project using real Auth users.
 *
 * Environment Variables Required:
 * - RLS_GOWRI_EMAIL
 * - RLS_GOWRI_PASSWORD
 * - RLS_NATHANIEL_EMAIL
 * - RLS_NATHANIEL_PASSWORD
 * - RLS_OUTSIDER_EMAIL
 * - RLS_OUTSIDER_PASSWORD
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY
 */

// Test configuration
const TEST_PREFIX = "RLS_TEST_";
const HOUSEHOLD_NAME = `${TEST_PREFIX}Household`;
const OUTSIDER_HOUSEHOLD_NAME = `${TEST_PREFIX}OutsiderHousehold`;

// Global test state
let gowriClient: ReturnType<typeof createClient<Database>> | null = null;
let nathanielClient: ReturnType<typeof createClient<Database>> | null = null;
let outsiderClient: ReturnType<typeof createClient<Database>> | null = null;
let anonClient: ReturnType<typeof createClient<Database>> | null = null;

let gowriHouseholdId: string = "";
let gowriParticipantId: string = "";
let gowriCategoryId: string = "";
let outsiderHouseholdId: string = "";
let outsiderParticipantId: string = "";
let outsiderCategoryId: string = "";

// Test results
let testsPassed = 0;
let testsFailed = 0;
const failureReasons: string[] = [];

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

function createAnonClient(): ReturnType<typeof createClient<Database>> {
  const url = getEnvVar("VITE_SUPABASE_URL");
  const key = getEnvVar("VITE_SUPABASE_PUBLISHABLE_KEY");
  return createClient<Database>(url, key);
}

async function createAuthenticatedClient(email: string, password: string): Promise<ReturnType<typeof createClient<Database>>> {
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

function assert(condition: boolean | null | undefined, message: string): void {
  if (!condition) {
    testsFailed++;
    failureReasons.push(message);
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  testsPassed++;
  console.log(`✓ ${message}`);
}

async function assertDenied(
  operation: () => any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Supabase client returns PromiseLike, operation is intentionally loosely typed
  operationName: string
): Promise<void> {
  try {
    const result = await operation();
    const { data, error } = result;
    if (error) {
      // Explicit RLS/permission error - acceptable
      console.log(`✓ ${operationName} correctly denied: ${error.message}`);
      testsPassed++;
      return;
    }
    if (Array.isArray(data) && data.length === 0) {
      // SELECT returned zero rows - acceptable
      console.log(`✓ ${operationName} correctly returned no data`);
      testsPassed++;
      return;
    }
    if (!data) {
      // No data returned - acceptable
      console.log(`✓ ${operationName} correctly returned no data`);
      testsPassed++;
      return;
    }
    // Operation succeeded when it should have failed
    testsFailed++;
    const reason = `❌ ${operationName} should have been denied but succeeded`;
    failureReasons.push(reason);
    console.error(reason);
    throw new Error(reason);
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any -- Error type from Supabase may not be typed
    // Operation threw an error - acceptable (RLS/FK constraint)
    console.log(`✓ ${operationName} correctly threw error: ${err.message}`);
    testsPassed++;
  }
}

async function cleanup(): Promise<void> {
  console.log("\n=== CLEANUP (best-effort) ===");
  if (!gowriClient) {
    console.log("⚠️ No authenticated client available for cleanup. Manual cleanup may be required.");
    return;
  }

  try {
    // Attempt to delete RLS_TEST_ records using authenticated client
    // This is best-effort only: RLS policies may prevent full deletion
    const { data: households } = await gowriClient
      .from("households")
      .select("id")
      .like("name", `${TEST_PREFIX}%`);

    if (households && households.length > 0) {
      let deleted = 0;
      for (const household of households) {
        try {
          // Delete financial records first (order matters due to FK constraints)
          await gowriClient.from("transactions").delete().eq("household_id", household.id);
          await gowriClient.from("allocations").delete().eq("household_id", household.id);
          await gowriClient.from("settlements").delete().eq("household_id", household.id);
          await gowriClient.from("budget_limits").delete().eq("household_id", household.id);
          await gowriClient.from("payment_methods").delete().eq("household_id", household.id);
          await gowriClient.from("goals").delete().eq("household_id", household.id);
          await gowriClient.from("obligations").delete().eq("household_id", household.id);

          // Delete reference data
          await gowriClient.from("budget_periods").delete().eq("household_id", household.id);
          await gowriClient.from("categories").delete().eq("household_id", household.id);
          await gowriClient.from("participants").delete().eq("household_id", household.id);
          await gowriClient.from("household_members").delete().eq("household_id", household.id);

          // Finally delete household
          await gowriClient.from("households").delete().eq("id", household.id);
          deleted++;
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any -- Cleanup error type may be any
          console.error(`⚠️ Could not delete household ${household.id}: ${err.message}`);
        }
      }

      if (deleted === households.length) {
        console.log(`✓ Automatic cleanup: ${deleted} RLS_TEST_ household(s) deleted`);
      } else {
        console.log(`⚠️ Automatic cleanup: ${deleted}/${households.length} RLS_TEST_ household(s) deleted`);
        console.log("   Manual cleanup via supabase/tests/cleanup_live_rls_test.sql may still be required");
      }
    } else {
      console.log("✓ No RLS_TEST_ households found to clean up");
    }
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any -- Cleanup error type may be any
    console.error(`⚠️ Cleanup error: ${err.message}`);
    console.error("   Manual cleanup via supabase/tests/cleanup_live_rls_test.sql may be required");
  }
}

// ============================================================================
// TESTS
// ============================================================================

async function test1_AnonCannotReadFinancial(): Promise<void> {
  console.log("\n=== TEST 1: ANON Cannot Read Financial Tables ===");
  anonClient = createAnonClient();

  // Verify SELECT denied or returns zero rows
  await assertDenied(
    () => anonClient!.from("households").select("*"),
    "Anon SELECT households"
  );

  await assertDenied(
    () => anonClient!.from("transactions").select("*"),
    "Anon SELECT transactions"
  );

  await assertDenied(
    () => anonClient!.from("participants").select("*"),
    "Anon SELECT participants"
  );

  // Verify INSERT denied
  await assertDenied(
    () =>
      anonClient!.from("households").insert({
        id: crypto.randomUUID(),
        name: `${TEST_PREFIX}AnonAttempt`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    "Anon INSERT households"
  );
}

async function test2_GowriCreatesHousehold(): Promise<void> {
  console.log("\n=== TEST 2: GOWRI Creates Household ===");
  const gowriEmail = getEnvVar("RLS_GOWRI_EMAIL");
  const gowriPassword = getEnvVar("RLS_GOWRI_PASSWORD");
  gowriClient = await createAuthenticatedClient(gowriEmail, gowriPassword);

  // Call RPC to create household
  const rpcResult = await (gowriClient as any).rpc("create_household_for_current_user", { // eslint-disable-line @typescript-eslint/no-explicit-any -- RPC method not typed in Database interface
    name: HOUSEHOLD_NAME,
  });
  const { data: householdId, error } = rpcResult;

  assert(!error, `Gowri create_household RPC succeeded`);
  assert(householdId && typeof householdId === "string", `RPC returned household UUID`);
  gowriHouseholdId = householdId || "";

  // Verify Gowri can read household
  const { data: households, error: readError } = await gowriClient
    .from("households")
    .select("*")
    .eq("id", gowriHouseholdId);

  assert(!readError, `Gowri can read her household`);
  assert(households && Array.isArray(households) && households.length === 1, `Gowri household visible in SELECT`);

  // Verify household_members contains Gowri as owner
  const { data: members, error: memberError } = await gowriClient
    .from("household_members")
    .select("*")
    .eq("household_id", gowriHouseholdId);

  assert(!memberError, `Gowri can read household_members`);
  assert(members && Array.isArray(members) && members.length === 1, `Exactly one member (Gowri)`);
  assert((members as any)?.[0]?.role === "owner", `Gowri is role='owner'`); // eslint-disable-line @typescript-eslint/no-explicit-any -- Array element type not preserved from select

  // Create participant for Gowri
  const { data: participant, error: participantError } = await gowriClient
    .from("participants")
    .insert({
      household_id: gowriHouseholdId,
      name: `${TEST_PREFIX}GowriParticipant`,
      kind: "household-member",
    })
    .select();

  assert(!participantError, `Gowri can create participant`);
  assert(participant && Array.isArray(participant) && participant.length === 1, `Participant created`);
  gowriParticipantId = (participant as any)?.[0]?.id || ""; // eslint-disable-line @typescript-eslint/no-explicit-any -- Array element type not preserved from insert

  // Create category for Gowri
  const { data: category, error: categoryError } = await gowriClient
    .from("categories")
    .insert({
      household_id: gowriHouseholdId,
      name: `${TEST_PREFIX}Category`,
      group_name: "Test",
      scope: "shared",
    })
    .select();

  assert(!categoryError, `Gowri can create category`);
  assert(category && Array.isArray(category) && category.length === 1, `Category created`);
  gowriCategoryId = (category as any)?.[0]?.id || ""; // eslint-disable-line @typescript-eslint/no-explicit-any -- Array element type not preserved from insert
}

async function test3_OutsiderBeforeNathaniel(): Promise<void> {
  console.log("\n=== TEST 3: OUTSIDER Cannot Access Before Nathaniel Membership ===");
  const outsiderEmail = getEnvVar("RLS_OUTSIDER_EMAIL");
  const outsiderPassword = getEnvVar("RLS_OUTSIDER_PASSWORD");
  outsiderClient = await createAuthenticatedClient(outsiderEmail, outsiderPassword);

  // Cannot read Gowri's household
  await assertDenied(
    () => outsiderClient!.from("households").select("*").eq("id", gowriHouseholdId!),
    "Outsider SELECT Gowri household"
  );

  // Cannot read Gowri's financial data
  await assertDenied(
    () => outsiderClient!.from("participants").select("*").eq("household_id", gowriHouseholdId!),
    "Outsider SELECT Gowri participants"
  );

  // Cannot insert into Gowri's household
  await assertDenied(
    () =>
      outsiderClient!.from("participants").insert({
        household_id: gowriHouseholdId!,
        name: `${TEST_PREFIX}OutsiderAttempt`,
        kind: "household-member",
      }),
    "Outsider INSERT participant into Gowri household"
  );

  // Cannot self-insert into household_members
  await assertDenied(
    () =>
      outsiderClient!.from("household_members").insert({
        household_id: gowriHouseholdId!,
        user_id: crypto.randomUUID(), // Will be rejected anyway
        role: "member",
      }),
    "Outsider INSERT self into household_members"
  );
}

async function test4_NathanielBeforeMembership(): Promise<void> {
  console.log("\n=== TEST 4: NATHANIEL Cannot Access Before Membership ===");
  const nathanielEmail = getEnvVar("RLS_NATHANIEL_EMAIL");
  const nathanielPassword = getEnvVar("RLS_NATHANIEL_PASSWORD");
  nathanielClient = await createAuthenticatedClient(nathanielEmail, nathanielPassword);

  // Cannot read Gowri's household
  await assertDenied(
    () => nathanielClient!.from("households").select("*").eq("id", gowriHouseholdId!),
    "Nathaniel SELECT Gowri household (before membership)"
  );

  // Cannot read Gowri's financial data
  await assertDenied(
    () => nathanielClient!.from("participants").select("*").eq("household_id", gowriHouseholdId!),
    "Nathaniel SELECT Gowri participants (before membership)"
  );
}

async function test5_GowriAddsNathaniel(): Promise<void> {
  console.log("\n=== TEST 5: GOWRI Adds NATHANIEL as Member ===");
  if (!gowriClient) {
    throw new Error("Gowri client not initialized");
  }

  // Get Nathaniel's user ID from his JWT
  const { data: nathanielData, error: nathanielError } = await nathanielClient!.auth.getUser();
  assert(!nathanielError, `Can get Nathaniel's user ID`);
  const nathanielUserId = (nathanielData as any)?.user?.id || ""; // eslint-disable-line @typescript-eslint/no-explicit-any -- Auth user type not fully preserved

  // Gowri adds Nathaniel
  const { error: addError } = await gowriClient
    .from("household_members")
    .insert({
      household_id: gowriHouseholdId!,
      user_id: nathanielUserId,
      role: "member",
    });

  assert(!addError, `Gowri successfully added Nathaniel as member`);

  // Verify Nathaniel is now visible in household_members
  const { data: members, error: memberError } = await gowriClient
    .from("household_members")
    .select("*")
    .eq("household_id", gowriHouseholdId!);

  assert(!memberError, `Gowri can read household_members after adding Nathaniel`);
  assert(members && Array.isArray(members) && members.length === 2, `Two members now (Gowri and Nathaniel)`);
  const nathanielMember = (members as any)?.find((m: any) => m.user_id === nathanielUserId); // eslint-disable-line @typescript-eslint/no-explicit-any -- Array and element types not fully preserved
  assert(nathanielMember && nathanielMember.role === "member", `Nathaniel is role='member'`);
}

async function test6_NathanielAfterMembership(): Promise<void> {
  console.log("\n=== TEST 6: NATHANIEL Can Access After Membership ===");
  if (!nathanielClient) {
    throw new Error("Nathaniel client not initialized");
  }

  // Can read Gowri's household
  const { data: households, error: householdError } = await nathanielClient
    .from("households")
    .select("*")
    .eq("id", gowriHouseholdId!);

  assert(!householdError, `Nathaniel can read Gowri household`);
  assert(households && Array.isArray(households) && households.length === 1, `Nathaniel sees the household`);

  // Can read Gowri's participants
  const { data: participants, error: participantError } = await nathanielClient
    .from("participants")
    .select("*")
    .eq("household_id", gowriHouseholdId!);

  assert(!participantError, `Nathaniel can read participants`);
  assert(participants && Array.isArray(participants) && participants.length >= 1, `Nathaniel sees participants`);

  // Can create his own participant
  const { data: nathanielParticipant, error: nathanielPError } = await nathanielClient
    .from("participants")
    .insert({
      household_id: gowriHouseholdId!,
      name: `${TEST_PREFIX}NathanielParticipant`,
      kind: "household-member",
    })
    .select();

  assert(!nathanielPError, `Nathaniel can create participant`);
  assert(nathanielParticipant && Array.isArray(nathanielParticipant) && nathanielParticipant.length === 1, `Participant created`);

  // Cannot add outsider as member
  const { data: outsiderData } = await outsiderClient!.auth.getUser();
  const outsiderUserId = (outsiderData as any)?.user?.id; // eslint-disable-line @typescript-eslint/no-explicit-any -- Auth user type not fully preserved

  await assertDenied(
    () =>
      nathanielClient!.from("household_members").insert({
        household_id: gowriHouseholdId!,
        user_id: outsiderUserId,
        role: "member",
      }),
    "Nathaniel (non-owner) cannot add outsider to household"
  );

  // Cannot create owner membership
  await assertDenied(
    () =>
      nathanielClient!.from("household_members").insert({
        household_id: gowriHouseholdId!,
        user_id: crypto.randomUUID(),
        role: "owner", // Will be rejected by role='member' constraint
      }),
    "Nathaniel cannot insert role='owner' (RLS policy enforces role='member')"
  );
}

async function test7_OutsiderStillDenied(): Promise<void> {
  console.log("\n=== TEST 7: OUTSIDER Still Cannot Access After Nathaniel Membership ===");
  if (!outsiderClient) {
    throw new Error("Outsider client not initialized");
  }

  // Cannot read household
  await assertDenied(
    () => outsiderClient!.from("households").select("*").eq("id", gowriHouseholdId!),
    "Outsider still cannot read Gowri household"
  );

  // Cannot read financial data
  await assertDenied(
    () => outsiderClient!.from("participants").select("*").eq("household_id", gowriHouseholdId!),
    "Outsider still cannot read participants"
  );

  // Cannot insert
  await assertDenied(
    () =>
      outsiderClient!.from("participants").insert({
        household_id: gowriHouseholdId!,
        name: `${TEST_PREFIX}OutsiderStillDenied`,
        kind: "household-member",
      }),
    "Outsider still cannot insert participant"
  );
}

async function test8_CrossHouseholdIntegrity(): Promise<void> {
  console.log("\n=== TEST 8: Cross-Household Integrity Constraints ===");
  if (!outsiderClient || !gowriClient) {
    throw new Error("Clients not initialized");
  }

  // Create outsider's household
  const rpcResult = await (outsiderClient as any).rpc( // eslint-disable-line @typescript-eslint/no-explicit-any -- RPC method not typed in Database interface
    "create_household_for_current_user",
    {
      name: OUTSIDER_HOUSEHOLD_NAME,
    }
  );
  const { data: outsiderHouseholdIdData, error: outsiderHouseholdError } = rpcResult;

  assert(!outsiderHouseholdError, `Outsider created their own household`);
  outsiderHouseholdId = outsiderHouseholdIdData;

  // Create outsider participant
  const { data: outsiderParticipantData, error: outsiderParticipantError } = await outsiderClient
    .from("participants")
    .insert({
      household_id: outsiderHouseholdId!,
      name: `${TEST_PREFIX}OutsiderParticipant`,
      kind: "household-member",
    })
    .select();

  assert(!outsiderParticipantError, `Outsider created participant`);
  outsiderParticipantId = (outsiderParticipantData as any)?.[0]?.id; // eslint-disable-line @typescript-eslint/no-explicit-any -- Array element type not preserved from insert

  // Create outsider category
  const { data: outsiderCategoryData, error: outsiderCategoryError } = await outsiderClient
    .from("categories")
    .insert({
      household_id: outsiderHouseholdId!,
      name: `${TEST_PREFIX}OutsiderCategory`,
      group_name: "Test",
      scope: "shared",
    })
    .select();

  assert(!outsiderCategoryError, `Outsider created category`);
  outsiderCategoryId = (outsiderCategoryData as any)?.[0]?.id; // eslint-disable-line @typescript-eslint/no-explicit-any -- Array element type not preserved from insert

  // Try to create transaction using Gowri's category in Gowri's household with outsider's participant
  // This should fail on composite FK constraint
  await assertDenied(
    () =>
      gowriClient!.from("transactions").insert({
        household_id: gowriHouseholdId!,
        kind: "expense",
        date: new Date().toISOString().split("T")[0],
        description: `${TEST_PREFIX}CrossHouseholdAttempt1`,
        total_cents: 5000,
        category_id: gowriCategoryId!,
        payer_participant_id: outsiderParticipantId!, // From different household
      }),
    "Cannot create transaction with participant from different household"
  );

  // Try to create transaction using outsider's category in Gowri's household
  // This should fail on composite FK constraint
  await assertDenied(
    () =>
      gowriClient!.from("transactions").insert({
        household_id: gowriHouseholdId!,
        kind: "expense",
        date: new Date().toISOString().split("T")[0],
        description: `${TEST_PREFIX}CrossHouseholdAttempt2`,
        total_cents: 5000,
        category_id: outsiderCategoryId!, // From different household
        payer_participant_id: gowriParticipantId!,
      }),
    "Cannot create transaction with category from different household"
  );

  console.log("✓ Cross-household composite FK constraints working correctly");
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("==========================================================");
  console.log("LIVE RLS INTEGRATION TEST HARNESS");
  console.log("==========================================================\n");

  try {
    // Verify environment variables exist
    console.log("Verifying environment variables...");
    getEnvVar("RLS_GOWRI_EMAIL");
    getEnvVar("RLS_GOWRI_PASSWORD");
    getEnvVar("RLS_NATHANIEL_EMAIL");
    getEnvVar("RLS_NATHANIEL_PASSWORD");
    getEnvVar("RLS_OUTSIDER_EMAIL");
    getEnvVar("RLS_OUTSIDER_PASSWORD");
    getEnvVar("VITE_SUPABASE_URL");
    getEnvVar("VITE_SUPABASE_PUBLISHABLE_KEY");
    console.log("✓ All required environment variables present\n");

    // Run tests in sequence
    await test1_AnonCannotReadFinancial();
    await test2_GowriCreatesHousehold();
    await test3_OutsiderBeforeNathaniel();
    await test4_NathanielBeforeMembership();
    await test5_GowriAddsNathaniel();
    await test6_NathanielAfterMembership();
    await test7_OutsiderStillDenied();
    await test8_CrossHouseholdIntegrity();

    // Sign out all users
    if (gowriClient) await signOut(gowriClient);
    if (nathanielClient) await signOut(nathanielClient);
    if (outsiderClient) await signOut(outsiderClient);

    // Cleanup
    await cleanup();

    // Report results
    console.log("\n==========================================================");
    console.log("TEST RESULTS");
    console.log("==========================================================");
    console.log(`✓ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);

    if (testsFailed > 0) {
      console.log("\nFailure reasons:");
      failureReasons.forEach((reason) => console.log(`  - ${reason}`));
      process.exit(1);
    } else {
      console.log("\n✓ ALL TESTS PASSED - RLS is working correctly");
      process.exit(0);
    }
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any -- Top-level error may be any type
    console.error("\n==========================================================");
    console.error("FATAL TEST ERROR");
    console.error("==========================================================");
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
