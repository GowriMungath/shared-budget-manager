-- Migration 006: Remap transaction categories to new common taxonomy
-- Purpose: Migrate historical transactions from old categories to new common categories
-- Scope: Only our household (c05db94e-ddd0-46e3-afee-6a6d9b5a0581)
-- Safety: All remappings verified by merchant name analysis, preserves all 33 transactions

-- Personal Food remappings (from audit merchant analysis)

-- "Banana for smoothie" (id: 842c8935-a691-4df2-91c5-d173659d6183) -> Groceries (id: 647521d8-695e-4f66-9772-c131b361efd3)
UPDATE public.transactions 
SET category_id = '647521d8-695e-4f66-9772-c131b361efd3'
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND id = '842c8935-a691-4df2-91c5-d173659d6183';

-- "Panda Bowl" (id: 99ce59a1-d014-4924-85e6-fba0e8662881) -> Eating Out (id: bb43fdf6-7197-4eb6-bf74-c80ec7832ffe)
UPDATE public.transactions 
SET category_id = 'bb43fdf6-7197-4eb6-bf74-c80ec7832ffe'
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND id = '99ce59a1-d014-4924-85e6-fba0e8662881';

-- "Chipotle" (id: a0a2dd39-fb68-439a-b03e-2682be2e96ff) -> Eating Out (id: bb43fdf6-7197-4eb6-bf74-c80ec7832ffe)
UPDATE public.transactions 
SET category_id = 'bb43fdf6-7197-4eb6-bf74-c80ec7832ffe'
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND id = 'a0a2dd39-fb68-439a-b03e-2682be2e96ff';

-- "Banana for smoothie" (id: ca4a9e8c-c597-4ec7-bcd3-0dc3385853e5) -> Groceries (id: 647521d8-695e-4f66-9772-c131b361efd3)
UPDATE public.transactions 
SET category_id = '647521d8-695e-4f66-9772-c131b361efd3'
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND id = 'ca4a9e8c-c597-4ec7-bcd3-0dc3385853e5';

-- Shopping remappings (all 5 transactions -> Clothing, id: df19f4c3-ad16-4c1f-b957-e71b52a1fa94)
-- These are already shopping category ID; since we renamed Shopping->Clothing with preserved ID,
-- no remap needed. But verify explicitly for clarity.
-- Transaction IDs: c704ef09-1ba9-45dc-a7f8-d368844e7e1c, e0ebba3c-cb7e-4049-bc27-14a45d0b6dd6,
-- bd4baaa0-ffa3-49eb-b44f-0dd003b507bb, 2e5e566d-a808-4587-9224-0003012cb0d6 (cross-payer),
-- 454c681f-d0a0-4b43-a99b-203bd8e2e2ec

-- Verify all 5 Shopping transactions have the correct (renamed) category ID
-- SELECT COUNT(*) FROM transactions 
-- WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
-- AND category_id = 'df19f4c3-ad16-4c1f-b957-e71b52a1fa94'
-- AND id IN ('c704ef09-1ba9-45dc-a7f8-d368844e7e1c', 'e0ebba3c-cb7e-4049-bc27-14a45d0b6dd6',
--            'bd4baaa0-ffa3-49eb-b44f-0dd003b507bb', '2e5e566d-a808-4587-9224-0003012cb0d6',
--            '454c681f-d0a0-4b43-a99b-203bd8e2e2ec');
-- Expected: 5

-- Personal Miscellaneous remappings -> Miscellaneous (id: 5ac543a2-3ae6-4055-91e0-3cf9e0387cd8)
UPDATE public.transactions 
SET category_id = '5ac543a2-3ae6-4055-91e0-3cf9e0387cd8'
WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND category_id = 'ed1a768a-44d9-4d02-93b0-d2822ee963d2';

-- Timestamp: Generated for Cycle 2 implementation (revised with household scope and deterministic IDs)
-- Status: Ready for execution after migration 005
-- Note: Cross-payer transaction (wild fable Jeans) preserved exactly as-is
