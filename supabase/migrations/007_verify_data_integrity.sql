-- Migration 007: Verify data integrity after EXPAND/REMAP phases
-- Purpose: Ensure all migrations succeeded and data integrity maintained
-- Scope: Our household (c05db94e-ddd0-46e3-afee-6a6d9b5a0581)
-- Safety: All checks must pass before proceeding to migration 008

-- Verify all our household transactions have valid category_id
SELECT COUNT(*) as orphaned_transactions
FROM public.transactions t
WHERE t.household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND NOT EXISTS (SELECT 1 FROM categories c 
                   WHERE c.id = t.category_id 
                   AND c.household_id = t.household_id);
-- Expected: 0

-- Verify all our household transactions have scope set
SELECT COUNT(*) as null_scope_transactions
FROM public.transactions 
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND scope IS NULL;
-- Expected: 0

-- Verify our household transaction count matches historical (33)
SELECT COUNT(*) as total_transactions
FROM public.transactions
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581';
-- Expected: 33

-- Verify no allocations are orphaned globally (true orphans: no transaction exists anywhere)
-- This checks if allocation.transaction_id matches ANY transaction in the database
SELECT COUNT(*) as orphaned_allocations_global
FROM public.allocations a
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = a.transaction_id);
-- Expected: 0 (all allocations must have a corresponding transaction)

-- Verify household transaction allocation integrity
-- For every transaction in our household: SUM(allocations.cents) must equal transaction.total_cents
-- LEFT JOIN detects transactions with zero allocations (unbudgeted) as mismatches
SELECT COUNT(*) as allocation_mismatches
FROM (
  SELECT t.id, t.total_cents
  FROM public.transactions t
  LEFT JOIN public.allocations a ON a.transaction_id = t.id
  WHERE t.household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  GROUP BY t.id, t.total_cents
  HAVING COALESCE(SUM(a.cents), 0) <> t.total_cents
) mismatches;
-- Expected: 0 (all transactions must have allocations that sum to total)

-- Verify settlement count for our household
SELECT COUNT(*) as settlement_count
FROM public.settlements s
WHERE s.household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581';
-- Expected: 0

-- Verify no remaining references to archived Personal Food category
SELECT COUNT(*) as personal_food_txns
FROM public.transactions t
WHERE t.household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND t.category_id = '29d9eb4d-9d5e-4b31-9dbb-a87958ba1021';
-- Expected: 0 (all remapped)

-- Verify no remaining references to archived Personal Miscellaneous category
SELECT COUNT(*) as personal_misc_txns
FROM public.transactions t
WHERE t.household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND t.category_id = 'ed1a768a-44d9-4d02-93b0-d2822ee963d2';
-- Expected: 0 (all remapped)

-- Verify all 5 Shopping/Clothing transactions are preserved and remapped
SELECT COUNT(*) as clothing_txns
FROM public.transactions
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND category_id = 'df19f4c3-ad16-4c1f-b957-e71b52a1fa94'
  AND id IN ('c704ef09-1ba9-45dc-a7f8-d368844e7e1c', 'e0ebba3c-cb7e-4049-bc27-14a45d0b6dd6',
             'bd4baaa0-ffa3-49eb-b44f-0dd003b507bb', '2e5e566d-a808-4587-9224-0003012cb0d6',
             '454c681f-d0a0-4b43-a99b-203bd8e2e2ec');
-- Expected: 5

-- Verify Personal Food remaps (4 transactions -> Groceries or Eating Out)
SELECT COUNT(*) as remapped_personal_food
FROM public.transactions
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND id IN ('842c8935-a691-4df2-91c5-d173659d6183',   -- Banana -> Groceries
             '99ce59a1-d014-4924-85e6-fba0e8662881',   -- Panda Bowl -> Eating Out
             'a0a2dd39-fb68-439a-b03e-2682be2e96ff',   -- Chipotle -> Eating Out
             'ca4a9e8c-c597-4ec7-bcd3-0dc3385853e5')  -- Banana -> Groceries
  AND category_id IN ('647521d8-695e-4f66-9772-c131b361efd3',  -- Groceries
                      'bb43fdf6-7197-4eb6-bf74-c80ec7832ffe'); -- Eating Out
-- Expected: 4

-- Timestamp: Generated for Cycle 2 implementation (revised: household-scoped, removed invalid logic, fixed column name)
-- Status: Ready for execution after migration 006
-- Note: Scope verification removed - transaction.scope should match OLD category.scope (pre-remap),
--       not new category.scope. Each transaction's scope is immutable (set at creation/backfill).
