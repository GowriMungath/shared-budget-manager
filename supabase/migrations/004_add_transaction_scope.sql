-- Migration 004: Add transaction scope column
-- Purpose: Persist transaction scope (was lost due to missing column)
-- Safety: Nullable initially, then backfill from category.scope (verified safe), then NOT NULL

ALTER TABLE public.transactions
ADD COLUMN scope TEXT CHECK (scope IN ('shared', 'personal'));

-- Backfill from category scope (verified safe via audit: zero violations)
UPDATE public.transactions t
SET scope = c.scope
FROM public.categories c
WHERE t.category_id = c.id;

-- Verify: confirm all transactions now have scope
-- SELECT COUNT(*) FROM transactions WHERE scope IS NULL;
-- Expected: 0

-- Make NOT NULL
ALTER TABLE public.transactions
ALTER COLUMN scope SET NOT NULL;

-- Add indexes for performance
CREATE INDEX idx_transactions_scope 
ON public.transactions(household_id, scope);

CREATE INDEX idx_transactions_household_scope 
ON public.transactions(household_id, scope, date DESC);

-- Timestamp: Generated for Cycle 2 implementation
-- Status: Ready for execution on production after code deployment
