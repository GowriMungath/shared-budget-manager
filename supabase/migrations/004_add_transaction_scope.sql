-- Migration 004: Add transaction scope column (EXPAND PHASE)
-- Purpose: Persist transaction scope (was lost due to missing column)
-- Safety: Nullable initially for backward compatibility with old app running simultaneously
-- Timeline: Safe to execute while old code still runs (writes get NULL, trigger provides default)
-- Sequence: Must run BEFORE new code deployment

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('shared', 'personal'));

-- Backfill ALL existing transactions (multi-household safe with defensive matching)
-- Each transaction gets scope from its category.scope, which is deterministic
-- Match BOTH category ID AND household ID to prevent cross-household references
-- Only backfill if not already set (safe for partial retries)
UPDATE public.transactions t
SET scope = c.scope
FROM public.categories c
WHERE t.category_id = c.id 
  AND t.household_id = c.household_id
  AND t.scope IS NULL;

-- Add compatibility trigger for old app writes during deployment window (idempotent)
-- Old app doesn't set scope; trigger derives it from category.scope
-- New app will set scope explicitly, trigger passes it through
DROP TRIGGER IF EXISTS trg_derive_transaction_scope ON public.transactions;
DROP FUNCTION IF EXISTS derive_transaction_scope();

CREATE FUNCTION derive_transaction_scope()
RETURNS TRIGGER AS $
BEGIN
  IF NEW.scope IS NULL THEN
    SELECT c.scope INTO NEW.scope
    FROM public.categories c
    WHERE c.id = NEW.category_id
      AND c.household_id = NEW.household_id;
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER trg_derive_transaction_scope
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION derive_transaction_scope();

-- Add indexes for performance (safely, if not already present)
CREATE INDEX IF NOT EXISTS idx_transactions_scope 
ON public.transactions(household_id, scope);

CREATE INDEX IF NOT EXISTS idx_transactions_household_scope 
ON public.transactions(household_id, scope, date DESC);

-- Verification queries (run manually to confirm)
-- SELECT COUNT(*) as total_txns FROM transactions;
-- SELECT COUNT(*) as null_scopes FROM transactions WHERE scope IS NULL;
-- SELECT COUNT(*) FROM transactions WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581';
-- Expected: All transactions backfilled with non-NULL scope

-- Timestamp: Generated for Cycle 2 implementation (EXPAND phase, idempotent)
-- Status: Deploy this migration FIRST, before new code
