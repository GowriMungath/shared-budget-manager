import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/infrastructure/supabase/types.ts";

/**
 * One-Time Migration: Seed Reference Data (Local IndexedDB → Supabase)
 *
 * Migrates 21 seeded/reference records from local IndexedDB to permanent Supabase household.
 * - 14 categories
 * - 1 budget period
 * - 4 payment methods
 * - 2 goals
 *
 * DOES NOT migrate:
 * - household (uses permanent cloud ID)
 * - participants (uses permanent cloud IDs)
 * - any financial data (transactions, allocations, settlements, budgetLimits, obligations)
 *
 * Environment Variables (from .env.rls.local or shell):
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY
 * - RLS_GOWRI_EMAIL
 *
 * Environment Variables (from shell only, NOT in .env file):
 * - RLS_GOWRI_PASSWORD
 */

// Permanent cloud IDs
const PERMANENT_HOUSEHOLD_ID = "c05db94e-ddd0-46e3-afee-6a6d9b5a0581";
const PERMANENT_GOWRI_PARTICIPANT_ID = "8d02cd0b-93f1-4a98-ab22-d397515504e5";
const PERMANENT_NATHANIEL_PARTICIPANT_ID = "b8412b87-8885-47f4-a25d-815d569208d7";

// Migration data (21 records total)
const CATEGORIES_TO_MIGRATE = [
  { id: "1e5490a7-ad19-4f73-aa2b-fb1eed6da842", name: "Car Maintenance", groupName: "Shared", scope: "shared", archived: false },
  { id: "29d9eb4d-9d5e-4b31-9dbb-a87958ba1021", name: "Personal Food", groupName: "Personal", scope: "personal", archived: false },
  { id: "5ac543a2-3ae6-4055-91e0-3cf9e0387cd8", name: "Miscellaneous", groupName: "Shared", scope: "shared", archived: false },
  { id: "647521d8-695e-4f66-9772-c131b361efd3", name: "Groceries", groupName: "Shared", scope: "shared", archived: false },
  { id: "7e092932-9567-444d-9515-1d9d8321138f", name: "Car Insurance", groupName: "Shared", scope: "shared", archived: false },
  { id: "aff97128-4700-4ddd-9fd7-a5b7c3134ac4", name: "Fuel", groupName: "Shared", scope: "shared", archived: false },
  { id: "b7a297b5-a1e4-4e94-8bcc-a28ee5415aec", name: "Utilities", groupName: "Shared", scope: "shared", archived: false },
  { id: "b7b6a797-740b-4219-88aa-5c32dcdd3524", name: "Rent", groupName: "Shared", scope: "shared", archived: false },
  { id: "bb43fdf6-7197-4eb6-bf74-c80ec7832ffe", name: "Eating Out", groupName: "Shared", scope: "shared", archived: false },
  { id: "df19f4c3-ad16-4c1f-b957-e71b52a1fa94", name: "Shopping", groupName: "Personal", scope: "personal", archived: false },
  { id: "df2b24ea-c102-41e3-bfdd-343f2440e4f6", name: "Entertainment", groupName: "Shared", scope: "shared", archived: false },
  { id: "e4f1a1e7-1030-411c-9231-eb486473ecd6", name: "Hair / Beauty", groupName: "Personal", scope: "personal", archived: false },
  { id: "ed1a768a-44d9-4d02-93b0-d2822ee963d2", name: "Personal Miscellaneous", groupName: "Personal", scope: "personal", archived: false },
  { id: "fd3e53b7-85c3-4fc8-850a-1d18c1e28c67", name: "Travel", groupName: "Shared", scope: "shared", archived: false },
];

const BUDGET_PERIOD_TO_MIGRATE = {
  id: "f786e4d2-c537-4693-8c9e-3a5b695c8397",
  name: "Trial MVP",
  startDate: "2026-09-15",
  endDate: "2026-09-30",
};

const PAYMENT_METHODS_TO_MIGRATE = [
  { id: "64b9d7a6-2a9a-405e-8974-5f97bfe42a1b", name: "Nathaniel Discover", ownerParticipantId: PERMANENT_NATHANIEL_PARTICIPANT_ID },
  { id: "6579ad31-3093-40ea-a5ac-c9ec7a9c5907", name: "Gowri Discover", ownerParticipantId: PERMANENT_GOWRI_PARTICIPANT_ID },
  { id: "6c920955-0513-4714-b09f-8a6a215c062f", name: "Nathaniel BofA", ownerParticipantId: PERMANENT_NATHANIEL_PARTICIPANT_ID },
  { id: "6f619e90-250f-49cc-9cfa-5f9479cd10e8", name: "Gowri BofA", ownerParticipantId: PERMANENT_GOWRI_PARTICIPANT_ID },
];

const GOALS_TO_MIGRATE = [
  { id: "e939ae4d-806d-4cce-b417-85f31ab62616", name: "Nathaniel Tuition", ownerParticipantId: PERMANENT_NATHANIEL_PARTICIPANT_ID, targetCents: 650000, currentSavedCents: 0, deadlineMonth: "2027-02" },
  { id: "fef828e5-d283-45a4-84ec-c831b6bffd85", name: "Gowri Tuition", ownerParticipantId: PERMANENT_GOWRI_PARTICIPANT_ID, targetCents: 650000, currentSavedCents: 0, deadlineMonth: "2027-02" },
];

// Migration stats
const stats = {
  created: 0,
  alreadyExisting: 0,
  failed: 0,
};

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

function log(message: string): void {
  console.log(`[MIGRATE] ${message}`);
}

function logSuccess(message: string): void {
  console.log(`✓ ${message}`);
}

// ============================================================================
// PREFLIGHT CHECKS
// ============================================================================

async function preflightHouseholdCheck(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Preflight: Verifying permanent household...");

  const { data: household, error } = await client
    .from("households")
    .select("id, name")
    .eq("id", PERMANENT_HOUSEHOLD_ID)
    .single();

  if (error || !household) {
    throw new Error(`Permanent household ${PERMANENT_HOUSEHOLD_ID} not found`);
  }

  if (household.name !== "Gowri & Nathaniel") {
    throw new Error(`Permanent household has unexpected name: ${household.name}`);
  }

  logSuccess(`Permanent household verified: ${household.name}`);
}

async function preflightParticipantCheck(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Preflight: Verifying permanent participants...");

  const { data: participants, error } = await client
    .from("participants")
    .select("id, name, member_key")
    .in("id", [PERMANENT_GOWRI_PARTICIPANT_ID, PERMANENT_NATHANIEL_PARTICIPANT_ID]);

  if (error || !participants || participants.length !== 2) {
    throw new Error(`Failed to verify participants: ${error?.message || "Missing participants"}`);
  }

  const gowri = participants.find((p) => p.id === PERMANENT_GOWRI_PARTICIPANT_ID);
  const nathaniel = participants.find((p) => p.id === PERMANENT_NATHANIEL_PARTICIPANT_ID);

  if (!gowri || gowri.member_key !== "gowri") {
    throw new Error(`Gowri participant not found or member_key mismatch`);
  }

  if (!nathaniel || nathaniel.member_key !== "nathaniel") {
    throw new Error(`Nathaniel participant not found or member_key mismatch`);
  }

  logSuccess(`Gowri participant verified (member_key="gowri")`);
  logSuccess(`Nathaniel participant verified (member_key="nathaniel")`);
}

async function preflightUUIDCollisionCheck(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Preflight: Checking for UUID collisions in permanent household...");

  // Check categories
  const { data: existingCategories, error: categoriesError } = await client
    .from("categories")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID)
    .in("id", CATEGORIES_TO_MIGRATE.map((c) => c.id));

  if (categoriesError) {
    throw new Error(`Failed to check category collisions: ${categoriesError.message}`);
  }

  // Check budget periods
  const { data: existingPeriods, error: periodsError } = await client
    .from("budget_periods")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID)
    .eq("id", BUDGET_PERIOD_TO_MIGRATE.id);

  if (periodsError) {
    throw new Error(`Failed to check budget period collision: ${periodsError.message}`);
  }

  // Check payment methods
  const { data: existingPaymentMethods, error: paymentMethodsError } = await client
    .from("payment_methods")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID)
    .in("id", PAYMENT_METHODS_TO_MIGRATE.map((pm) => pm.id));

  if (paymentMethodsError) {
    throw new Error(`Failed to check payment method collisions: ${paymentMethodsError.message}`);
  }

  // Check goals
  const { data: existingGoals, error: goalsError } = await client
    .from("goals")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID)
    .in("id", GOALS_TO_MIGRATE.map((g) => g.id));

  if (goalsError) {
    throw new Error(`Failed to check goal collisions: ${goalsError.message}`);
  }

  const collidedUUIDs = [
    ...(existingCategories || []).map((c) => c.id),
    ...(existingPeriods || []).map((p) => p.id),
    ...(existingPaymentMethods || []).map((pm) => pm.id),
    ...(existingGoals || []).map((g) => g.id),
  ];

  if (collidedUUIDs.length > 0) {
    logSuccess(`${collidedUUIDs.length} records already exist (will verify and reuse)`);
  } else {
    logSuccess(`No UUID collisions detected`);
  }
}

async function preflightSemanticDuplicateCheck(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Preflight: Checking for semantic duplicates...");

  // Check for categories with same name but different ID
  for (const category of CATEGORIES_TO_MIGRATE) {
    const { data: existing, error } = await client
      .from("categories")
      .select("id")
      .eq("household_id", PERMANENT_HOUSEHOLD_ID)
      .eq("name", category.name)
      .neq("id", category.id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to check category duplicate: ${error.message}`);
    }

    if (existing) {
      throw new Error(`Semantic duplicate: Category "${category.name}" already exists with different ID: ${existing.id}`);
    }
  }

  // Check for budget periods with same name/dates but different ID
  const { data: existingPeriod, error: periodError } = await client
    .from("budget_periods")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID)
    .eq("name", BUDGET_PERIOD_TO_MIGRATE.name)
    .neq("id", BUDGET_PERIOD_TO_MIGRATE.id)
    .single();

  if (periodError && periodError.code !== "PGRST116") {
    throw new Error(`Failed to check budget period duplicate: ${periodError.message}`);
  }

  if (existingPeriod) {
    throw new Error(
      `Semantic duplicate: Budget period "${BUDGET_PERIOD_TO_MIGRATE.name}" already exists with different ID: ${existingPeriod.id}`
    );
  }

  // Check for payment methods with same name but different ID
  for (const paymentMethod of PAYMENT_METHODS_TO_MIGRATE) {
    const { data: existing, error } = await client
      .from("payment_methods")
      .select("id")
      .eq("household_id", PERMANENT_HOUSEHOLD_ID)
      .eq("name", paymentMethod.name)
      .neq("id", paymentMethod.id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to check payment method duplicate: ${error.message}`);
    }

    if (existing) {
      throw new Error(
        `Semantic duplicate: Payment method "${paymentMethod.name}" already exists with different ID: ${existing.id}`
      );
    }
  }

  // Check for goals with same name but different ID
  for (const goal of GOALS_TO_MIGRATE) {
    const { data: existing, error } = await client
      .from("goals")
      .select("id")
      .eq("household_id", PERMANENT_HOUSEHOLD_ID)
      .eq("name", goal.name)
      .neq("id", goal.id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to check goal duplicate: ${error.message}`);
    }

    if (existing) {
      throw new Error(`Semantic duplicate: Goal "${goal.name}" already exists with different ID: ${existing.id}`);
    }
  }

  logSuccess("No semantic duplicates detected");
}

// ============================================================================
// MIGRATION
// ============================================================================

async function migrateCategories(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Migrating 14 categories...");

  for (const category of CATEGORIES_TO_MIGRATE) {
    // Check if exists
    const { data: existing, error: checkError } = await client
      .from("categories")
      .select("id, name, group_name, scope, archived")
      .eq("household_id", PERMANENT_HOUSEHOLD_ID)
      .eq("id", category.id)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      throw new Error(`Failed to check category ${category.id}: ${checkError.message}`);
    }

    if (existing) {
      // Verify values match
      if (
        existing.name === category.name &&
        existing.group_name === category.groupName &&
        existing.scope === category.scope &&
        existing.archived === category.archived
      ) {
        stats.alreadyExisting++;
        continue;
      } else {
        throw new Error(`Category ${category.id} exists but values differ`);
      }
    }

    // Insert
    const { error: insertError } = await client.from("categories").insert({
      id: category.id,
      household_id: PERMANENT_HOUSEHOLD_ID,
      name: category.name,
      group_name: category.groupName,
      scope: category.scope as "shared" | "personal",
      archived: category.archived,
    });

    if (insertError) {
      stats.failed++;
      throw new Error(`Failed to insert category ${category.name}: ${insertError.message}`);
    }

    stats.created++;
  }

  logSuccess(`Migrated ${CATEGORIES_TO_MIGRATE.length} categories`);
}

async function migrateBudgetPeriod(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Migrating 1 budget period...");

  // Check if exists
  const { data: existing, error: checkError } = await client
    .from("budget_periods")
    .select("id, name, start_date, end_date")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID)
    .eq("id", BUDGET_PERIOD_TO_MIGRATE.id)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    throw new Error(`Failed to check budget period: ${checkError.message}`);
  }

  if (existing) {
    // Verify values match
    if (
      existing.name === BUDGET_PERIOD_TO_MIGRATE.name &&
      existing.start_date === BUDGET_PERIOD_TO_MIGRATE.startDate &&
      existing.end_date === BUDGET_PERIOD_TO_MIGRATE.endDate
    ) {
      stats.alreadyExisting++;
      logSuccess(`Budget period already exists (${BUDGET_PERIOD_TO_MIGRATE.name})`);
      return;
    } else {
      throw new Error(`Budget period ${BUDGET_PERIOD_TO_MIGRATE.id} exists but values differ`);
    }
  }

  // Insert
  const { error: insertError } = await client.from("budget_periods").insert({
    id: BUDGET_PERIOD_TO_MIGRATE.id,
    household_id: PERMANENT_HOUSEHOLD_ID,
    name: BUDGET_PERIOD_TO_MIGRATE.name,
    start_date: BUDGET_PERIOD_TO_MIGRATE.startDate,
    end_date: BUDGET_PERIOD_TO_MIGRATE.endDate,
  });

  if (insertError) {
    stats.failed++;
    throw new Error(`Failed to insert budget period: ${insertError.message}`);
  }

  stats.created++;
  logSuccess(`Migrated 1 budget period (${BUDGET_PERIOD_TO_MIGRATE.name})`);
}

async function migratePaymentMethods(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Migrating 4 payment methods...");

  for (const paymentMethod of PAYMENT_METHODS_TO_MIGRATE) {
    // Check if exists
    const { data: existing, error: checkError } = await client
      .from("payment_methods")
      .select("id, name, owner_participant_id")
      .eq("household_id", PERMANENT_HOUSEHOLD_ID)
      .eq("id", paymentMethod.id)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      throw new Error(`Failed to check payment method ${paymentMethod.id}: ${checkError.message}`);
    }

    if (existing) {
      // Verify values match
      if (existing.name === paymentMethod.name && existing.owner_participant_id === paymentMethod.ownerParticipantId) {
        stats.alreadyExisting++;
        continue;
      } else {
        throw new Error(`Payment method ${paymentMethod.id} exists but values differ`);
      }
    }

    // Insert
    const { error: insertError } = await client.from("payment_methods").insert({
      id: paymentMethod.id,
      household_id: PERMANENT_HOUSEHOLD_ID,
      name: paymentMethod.name,
      owner_participant_id: paymentMethod.ownerParticipantId,
    });

    if (insertError) {
      stats.failed++;
      throw new Error(`Failed to insert payment method ${paymentMethod.name}: ${insertError.message}`);
    }

    stats.created++;
  }

  logSuccess(`Migrated ${PAYMENT_METHODS_TO_MIGRATE.length} payment methods`);
}

async function migrateGoals(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Migrating 2 goals...");

  for (const goal of GOALS_TO_MIGRATE) {
    // Check if exists
    const { data: existing, error: checkError } = await client
      .from("goals")
      .select("id, name, owner_participant_id, target_cents, current_saved_cents, deadline_month")
      .eq("household_id", PERMANENT_HOUSEHOLD_ID)
      .eq("id", goal.id)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      throw new Error(`Failed to check goal ${goal.id}: ${checkError.message}`);
    }

    if (existing) {
      // Verify values match
      if (
        existing.name === goal.name &&
        existing.owner_participant_id === goal.ownerParticipantId &&
        existing.target_cents === goal.targetCents &&
        existing.current_saved_cents === goal.currentSavedCents &&
        existing.deadline_month === goal.deadlineMonth
      ) {
        stats.alreadyExisting++;
        continue;
      } else {
        throw new Error(`Goal ${goal.id} exists but values differ`);
      }
    }

    // Insert
    const { error: insertError } = await client.from("goals").insert({
      id: goal.id,
      household_id: PERMANENT_HOUSEHOLD_ID,
      name: goal.name,
      owner_participant_id: goal.ownerParticipantId,
      target_cents: goal.targetCents,
      current_saved_cents: goal.currentSavedCents,
      deadline_month: goal.deadlineMonth,
    });

    if (insertError) {
      stats.failed++;
      throw new Error(`Failed to insert goal ${goal.name}: ${insertError.message}`);
    }

    stats.created++;
  }

  logSuccess(`Migrated ${GOALS_TO_MIGRATE.length} goals`);
}

// ============================================================================
// VERIFICATION
// ============================================================================

async function verifyMigration(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  log("Final verification...");

  // Verify 14 categories
  const { data: categories, error: categoriesError } = await client
    .from("categories")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID);

  if (categoriesError) {
    throw new Error(`Failed to verify categories: ${categoriesError.message}`);
  }

  const categoryCount = (categories || []).filter((c) => CATEGORIES_TO_MIGRATE.some((m) => m.id === c.id)).length;
  if (categoryCount !== 14) {
    throw new Error(`Expected 14 categories, found ${categoryCount}`);
  }

  // Verify 1 budget period
  const { data: periods, error: periodsError } = await client
    .from("budget_periods")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID)
    .eq("id", BUDGET_PERIOD_TO_MIGRATE.id);

  if (periodsError) {
    throw new Error(`Failed to verify budget period: ${periodsError.message}`);
  }

  if (!periods || periods.length !== 1) {
    throw new Error(`Expected 1 budget period, found ${periods?.length || 0}`);
  }

  // Verify 4 payment methods
  const { data: paymentMethods, error: paymentMethodsError } = await client
    .from("payment_methods")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID);

  if (paymentMethodsError) {
    throw new Error(`Failed to verify payment methods: ${paymentMethodsError.message}`);
  }

  const paymentMethodCount = (paymentMethods || []).filter((pm) => PAYMENT_METHODS_TO_MIGRATE.some((m) => m.id === pm.id)).length;
  if (paymentMethodCount !== 4) {
    throw new Error(`Expected 4 payment methods, found ${paymentMethodCount}`);
  }

  // Verify 2 goals
  const { data: goals, error: goalsError } = await client
    .from("goals")
    .select("id")
    .eq("household_id", PERMANENT_HOUSEHOLD_ID);

  if (goalsError) {
    throw new Error(`Failed to verify goals: ${goalsError.message}`);
  }

  const goalCount = (goals || []).filter((g) => GOALS_TO_MIGRATE.some((m) => m.id === g.id)).length;
  if (goalCount !== 2) {
    throw new Error(`Expected 2 goals, found ${goalCount}`);
  }

  logSuccess("14 categories verified");
  logSuccess("1 budget period verified");
  logSuccess("4 payment methods verified");
  logSuccess("2 goals verified");
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("========================================================");
  console.log("SEED REFERENCE DATA MIGRATION");
  console.log("========================================================\n");

  let client: ReturnType<typeof createClient<Database>> | null = null;

  try {
    // Verify environment variables
    log("Verifying environment variables...");
    getEnvVar("VITE_SUPABASE_URL");
    getEnvVar("VITE_SUPABASE_PUBLISHABLE_KEY");
    getEnvVar("RLS_GOWRI_EMAIL");
    getEnvVar("RLS_GOWRI_PASSWORD");
    logSuccess("All required environment variables present\n");

    // Authenticate as Gowri
    log("Authenticating as Gowri...");
    const gowriEmail = getEnvVar("RLS_GOWRI_EMAIL");
    const gowriPassword = getEnvVar("RLS_GOWRI_PASSWORD");
    client = await createAuthenticatedClient(gowriEmail, gowriPassword);
    logSuccess(`Authenticated (${gowriEmail})\n`);

    // Preflight checks
    log("Running preflight checks...\n");
    await preflightHouseholdCheck(client);
    await preflightParticipantCheck(client);
    await preflightUUIDCollisionCheck(client);
    await preflightSemanticDuplicateCheck(client);
    console.log("");

    // Migration
    log("Starting migration...\n");
    await migrateCategories(client);
    await migrateBudgetPeriod(client);
    await migratePaymentMethods(client);
    await migrateGoals(client);
    console.log("");

    // Verification
    log("Running final verification...\n");
    await verifyMigration(client);
    console.log("");

    // Report
    console.log("========================================================");
    console.log("MIGRATION COMPLETE");
    console.log("========================================================");
    console.log(`Created:        ${stats.created}`);
    console.log(`Already exist:  ${stats.alreadyExisting}`);
    console.log(`Failed:         ${stats.failed}`);
    console.log(`Total:          ${stats.created + stats.alreadyExisting}`);
    console.log("");
    console.log("21 seeded reference records successfully migrated to Supabase.");
    console.log("========================================================\n");

    process.exit(0);
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Top-level error catch
    const error = err as any;
    console.error("\n========================================================");
    console.error("MIGRATION FAILED");
    console.error("========================================================");
    console.error(error?.message || String(err));
    console.error(error?.stack || "");
    console.error("");
    console.error(`Created before failure: ${stats.created}`);
    console.error("Rerun the script after fixing the issue.");
    console.error("========================================================\n");
    process.exit(1);
  }
}

main();
