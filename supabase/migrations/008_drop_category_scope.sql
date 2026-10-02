-- Migration 008: Drop scope column from categories (CONTRACT PHASE - POST-DEPLOY)
-- Purpose: Remove obsolete category.scope after successful code deployment
-- CRITICAL: Only run AFTER:
-- 1. New code deployed and running in production
-- 2. All transactions have been verified with non-NULL scope
-- 3. All RLS policies reviewed and updated if needed
-- Timeline: 24-48 hours after production code deployment
-- Scope: Our household (c05db94e-ddd0-46e3-afee-6a6d9b5a0581) and others

-- SAFETY: Do NOT use CASCADE - inspect dependencies explicitly

-- Step 1: Verify NO code is still reading category.scope
-- This requires manual verification that production code uses transaction.scope only

-- Step 2: Check for RLS policies that reference category.scope
-- Run: SELECT pg_get_policydefs('categories'::regclass);
-- If category.scope is referenced in policy conditions, update them first

-- Step 3: Check for other dependencies
-- Run: SELECT obj_description(dep_id, dep_type) FROM pg_depend WHERE refobjid = 
--      (SELECT attrelid FROM pg_attribute WHERE attrelname = 'scope' AND 
--       relname = 'categories' JOIN pg_class ON pg_class.oid = attrelid);

-- Step 4: Verify ALL transactions have non-NULL scope globally
-- FAIL explicitly if any NULLs exist - do NOT proceed with NOT NULL constraint
-- This must succeed before we can safely set NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions WHERE scope IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot contract schema: transactions with NULL scope still exist. Migration 004 backfill or transaction writes may have failed.';
  END IF;
END
$$;

-- Step 5: Enforce NOT NULL constraint on transactions.scope
-- Now that all rows are backfilled and new code explicitly sets scope
ALTER TABLE public.transactions
ALTER COLUMN scope SET NOT NULL;

-- Step 6: Remove temporary compatibility trigger created in migration 004
DROP TRIGGER IF EXISTS trg_derive_transaction_scope ON public.transactions;

-- Step 7: Remove temporary compatibility function created in migration 004
DROP FUNCTION IF EXISTS derive_transaction_scope();

-- Step 8: Drop the obsolete scope column from categories
-- Using RESTRICT (not CASCADE) to fail if unexpected dependencies remain
ALTER TABLE public.categories
DROP COLUMN scope RESTRICT;

-- Notes:
-- - NOT NULL constraint enforces that all future writes must include scope
-- - RESTRICT will raise an error if any objects depend on categories.scope column
-- - If error occurs, identify the dependency and manually update it
-- - Only use CASCADE after all dependencies have been explicitly addressed
-- - RLS policies should NOT be affected (they don't depend on the column itself)
-- - If RLS depends on category.scope values, those policies must be updated separately

-- Timestamp: Generated for Cycle 2 implementation (revised: explicit safety gate, SET NOT NULL, drop scope)
-- Status: Ready for execution AFTER code deployment verification (24-48 hours post-deploy)
