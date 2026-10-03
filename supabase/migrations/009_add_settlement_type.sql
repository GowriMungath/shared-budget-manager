-- Migration 009: Add settlement type column with safe backfill
-- Purpose: Persist settlement type (internal vs external) as authoritative source
-- Rationale: Domain logic filters settlements by type; persisting enables efficient RLS policies,
--           prevents inconsistencies from participant changes, and maintains parity with IndexedDB schema
--
-- Safety approach: Do NOT use DEFAULT 'internal' on new rows blindly
-- Instead:
-- 1. Add type column as NULLABLE to preserve existing data
-- 2. Backfill by deriving from participant kinds:
--    - household-member ↔ household-member = "internal"
--    - anything involving external = "external"
-- 3. Verify all rows successfully classified (fail loudly if any cannot be)
-- 4. Make column NOT NULL to enforce classification
-- 5. Add constraint and index
-- Timeline: Must run before code that uses external settlements

-- Step 1: Add type column as NULLABLE (safe, no data loss)
ALTER TABLE public.settlements
ADD COLUMN IF NOT EXISTS type TEXT
CHECK (type IN ('internal', 'external'));

-- Step 2: Backfill by deriving from participant kinds
-- Join to participants table to determine settlement type
UPDATE public.settlements s
SET type = CASE
  WHEN (
    (SELECT kind FROM public.participants WHERE id = s.from_participant_id)
    = 'household-member'
  ) AND (
    (SELECT kind FROM public.participants WHERE id = s.to_participant_id)
    = 'household-member'
  )
  THEN 'internal'
  ELSE 'external'
END
WHERE type IS NULL;

-- Step 3: Verify all rows have been classified
-- This query will raise an error if any settlement lacks a type
-- (Required for safety - prevents silent misclassification)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.settlements WHERE type IS NULL) THEN
    RAISE EXCEPTION 'Migration 009 failed: Found settlements without derived type. This indicates missing participants or data inconsistency. Check and rerun.';
  END IF;
END $$;

-- Step 4: Make column NOT NULL (now safe because all rows are classified)
ALTER TABLE public.settlements
ALTER COLUMN type SET NOT NULL;

-- Step 5: Ensure constraint is defined
ALTER TABLE public.settlements
DROP CONSTRAINT IF EXISTS settlements_type_check;

ALTER TABLE public.settlements
ADD CONSTRAINT settlements_type_check
CHECK (type IN ('internal', 'external'));

-- Step 6: Add index for efficient filtering by settlement type
CREATE INDEX IF NOT EXISTS idx_settlements_household_type 
ON public.settlements(household_id, type);

-- Status: Idempotent with safety checks
-- - Attempts to add columns/constraints that may already exist (IF NOT EXISTS / DROP IF EXISTS)
-- - Fails loudly if backfill encounters unclassifiable rows
-- - Does NOT silently default to 'internal'
