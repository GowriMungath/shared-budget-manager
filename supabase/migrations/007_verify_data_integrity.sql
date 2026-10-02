-- Migration 007: Verify data integrity after migrations 004-006
-- Purpose: Ensure all migrations succeeded and data integrity maintained
-- Safety: All checks must pass before proceeding to migration 008

-- Verify all transactions have valid category_id
SELECT COUNT(*) as orphaned_transactions
FROM public.transactions t
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id);
-- Expected: 0

-- Verify all transactions have scope set
SELECT COUNT(*) as null_scope_transactions
FROM public.transactions 
WHERE scope IS NULL;
-- Expected: 0

-- Verify scope matches old category (for audit verification)
SELECT COUNT(*) as scope_mismatches
FROM public.transactions t
JOIN public.categories c ON t.category_id = c.id
WHERE t.scope != c.scope;
-- Expected: 0

-- Verify transaction count matches historical
SELECT COUNT(*) as total_transactions
FROM public.transactions;
-- Expected: 33

-- Verify no allocations are orphaned
SELECT COUNT(*) as orphaned_allocations
FROM public.allocations a
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = a.transaction_id);
-- Expected: 0

-- Verify settlement count
SELECT COUNT(*) as settlement_count
FROM public.settlements;
-- Expected: 0

-- Timestamp: Generated for Cycle 2 implementation
-- Status: Ready for execution on production after code deployment
