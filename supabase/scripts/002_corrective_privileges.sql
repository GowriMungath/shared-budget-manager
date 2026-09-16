-- ============================================================================
-- CORRECTIVE SQL: Fix Over-Granted Privileges on Live Database
-- ============================================================================
-- 
-- This script corrects the privilege over-grant issue that occurred when
-- migration 002 was applied without first revoking pre-existing authenticated
-- default grants.
--
-- Run this in Supabase SQL Editor after identifying the privilege issue.
-- This script:
-- 1. Completely revokes all privileges from PUBLIC, anon, authenticated
-- 2. Re-grants only the minimal required privileges
-- 3. Preserves all RLS policies (no changes to RLS in this script)
--
-- Safe to run multiple times (idempotent).

-- ============================================================================
-- COMPLETE REVOKE: Clear all privileges from all roles on all app tables
-- ============================================================================

-- Revoke from PUBLIC
REVOKE ALL ON profiles FROM PUBLIC;
REVOKE ALL ON households FROM PUBLIC;
REVOKE ALL ON household_members FROM PUBLIC;
REVOKE ALL ON participants FROM PUBLIC;
REVOKE ALL ON categories FROM PUBLIC;
REVOKE ALL ON budget_periods FROM PUBLIC;
REVOKE ALL ON budget_limits FROM PUBLIC;
REVOKE ALL ON transactions FROM PUBLIC;
REVOKE ALL ON allocations FROM PUBLIC;
REVOKE ALL ON settlements FROM PUBLIC;
REVOKE ALL ON payment_methods FROM PUBLIC;
REVOKE ALL ON goals FROM PUBLIC;
REVOKE ALL ON obligations FROM PUBLIC;

-- Revoke from anon
REVOKE ALL ON profiles FROM anon;
REVOKE ALL ON households FROM anon;
REVOKE ALL ON household_members FROM anon;
REVOKE ALL ON participants FROM anon;
REVOKE ALL ON categories FROM anon;
REVOKE ALL ON budget_periods FROM anon;
REVOKE ALL ON budget_limits FROM anon;
REVOKE ALL ON transactions FROM anon;
REVOKE ALL ON allocations FROM anon;
REVOKE ALL ON settlements FROM anon;
REVOKE ALL ON payment_methods FROM anon;
REVOKE ALL ON goals FROM anon;
REVOKE ALL ON obligations FROM anon;

-- Revoke from authenticated (CRITICAL FIX: clears TRUNCATE, TRIGGER, REFERENCES)
REVOKE ALL ON profiles FROM authenticated;
REVOKE ALL ON households FROM authenticated;
REVOKE ALL ON household_members FROM authenticated;
REVOKE ALL ON participants FROM authenticated;
REVOKE ALL ON categories FROM authenticated;
REVOKE ALL ON budget_periods FROM authenticated;
REVOKE ALL ON budget_limits FROM authenticated;
REVOKE ALL ON transactions FROM authenticated;
REVOKE ALL ON allocations FROM authenticated;
REVOKE ALL ON settlements FROM authenticated;
REVOKE ALL ON payment_methods FROM authenticated;
REVOKE ALL ON goals FROM authenticated;
REVOKE ALL ON obligations FROM authenticated;

-- ============================================================================
-- RE-GRANT: Minimal least-privilege grants to authenticated users only
-- ============================================================================

-- profiles: SELECT, INSERT, UPDATE (users manage their own profile)
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

-- households: SELECT only (creation via RPC, updates only by owners via RLS)
GRANT SELECT ON households TO authenticated;

-- household_members: SELECT, INSERT (owners add members via RLS policy)
GRANT SELECT, INSERT ON household_members TO authenticated;

-- participants: SELECT, INSERT, UPDATE (members manage participants via RLS)
GRANT SELECT, INSERT, UPDATE ON participants TO authenticated;

-- categories: SELECT, INSERT, UPDATE (members manage categories via RLS)
GRANT SELECT, INSERT, UPDATE ON categories TO authenticated;

-- budget_periods: SELECT, INSERT, UPDATE (members manage periods via RLS)
GRANT SELECT, INSERT, UPDATE ON budget_periods TO authenticated;

-- budget_limits: SELECT, INSERT, UPDATE, DELETE (manage limits via RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_limits TO authenticated;

-- transactions: SELECT, INSERT, UPDATE, DELETE (record transactions via RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON transactions TO authenticated;

-- allocations: SELECT, INSERT, UPDATE, DELETE (manage allocations via RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON allocations TO authenticated;

-- settlements: SELECT, INSERT, UPDATE, DELETE (record settlements via RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON settlements TO authenticated;

-- payment_methods: SELECT, INSERT, UPDATE, DELETE (manage methods via RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_methods TO authenticated;

-- goals: SELECT, INSERT, UPDATE, DELETE (manage goals via RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON goals TO authenticated;

-- obligations: SELECT, INSERT, UPDATE, DELETE (track obligations via RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON obligations TO authenticated;

-- ============================================================================
-- VERIFICATION: Query to confirm correct privileges are in place
-- ============================================================================
--
-- After running this script, verify privileges with:
--
-- SELECT grantee, privilege_type, is_grantable
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'profiles', 'households', 'household_members', 'participants',
--     'categories', 'budget_periods', 'budget_limits', 'transactions',
--     'allocations', 'settlements', 'payment_methods', 'goals', 'obligations'
--   )
-- ORDER BY table_name, grantee, privilege_type;
--
-- Expected output:
-- - grantee 'authenticated' should have ONLY: SELECT, INSERT, UPDATE, DELETE
-- - grantee 'authenticated' should NOT have: TRUNCATE, TRIGGER, REFERENCES
-- - grantee 'anon' should have NO rows
-- - grantee 'public' should have NO rows
--
-- ============================================================================
