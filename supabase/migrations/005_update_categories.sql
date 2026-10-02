-- Migration 005: Rename existing categories for new common taxonomy
-- Purpose: Update category names in preparation for scope-neutral model
-- Strategy: Preserve existing IDs where they'll be reused
-- Scope: Only our household (c05db94e-ddd0-46e3-afee-6a6d9b5a0581)

-- Rename Fuel -> Car Fuel (preserve ID: aff97128-4700-4ddd-9fd7-a5b7c3134ac4)
UPDATE public.categories 
SET name = 'Car Fuel', group_name = 'Transportation' 
WHERE id = 'aff97128-4700-4ddd-9fd7-a5b7c3134ac4'
  AND household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND name = 'Fuel';

-- Rename Entertainment -> Entertainment & Fun (preserve ID: df2b24ea-c102-41e3-bfdd-343f2440e4f6)
UPDATE public.categories 
SET name = 'Entertainment & Fun' 
WHERE id = 'df2b24ea-c102-41e3-bfdd-343f2440e4f6'
  AND household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND name = 'Entertainment';

-- Rename Hair / Beauty -> Personal Care (preserve ID: e4f1a1e7-1030-411c-9231-eb486473ecd6)
UPDATE public.categories 
SET name = 'Personal Care'
WHERE id = 'e4f1a1e7-1030-411c-9231-eb486473ecd6'
  AND household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND name = 'Hair / Beauty';

-- Rename Shopping -> Clothing (preserve ID: df19f4c3-ad16-4c1f-b957-e71b52a1fa94)
-- This is CRITICAL: All 5 historical Shopping transactions are confirmed as Clothing
-- Preserving this ID maintains references in:
-- - Historical transactions
-- - Historical budget limit records
UPDATE public.categories 
SET name = 'Clothing'
WHERE id = 'df19f4c3-ad16-4c1f-b957-e71b52a1fa94'
  AND household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND name = 'Shopping';

-- Archive Personal Food (don't delete - historical records reference it)
UPDATE public.categories 
SET archived = true
WHERE id = '29d9eb4d-9d5e-4b31-9dbb-a87958ba1021'
  AND household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND name = 'Personal Food';

-- Archive Personal Miscellaneous (don't delete - historical records reference it)
UPDATE public.categories 
SET archived = true
WHERE id = 'ed1a768a-44d9-4d02-93b0-d2822ee963d2'
  AND household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581'
  AND name = 'Personal Miscellaneous';

-- Create 4 genuinely new categories with new IDs (only if not already present)

-- Household Shopping (new)
INSERT INTO public.categories (id, household_id, name, group_name, scope)
SELECT uuid_generate_v4(), 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581', 'Household Shopping', 'Shopping', 'shared'
WHERE NOT EXISTS (
  SELECT 1 FROM categories 
  WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581' 
  AND name = 'Household Shopping'
);

-- Transportation (new)
INSERT INTO public.categories (id, household_id, name, group_name, scope)
SELECT uuid_generate_v4(), 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581', 'Transportation', 'Transport', 'shared'
WHERE NOT EXISTS (
  SELECT 1 FROM categories 
  WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581' 
  AND name = 'Transportation'
);

-- Subscriptions (new)
INSERT INTO public.categories (id, household_id, name, group_name, scope)
SELECT uuid_generate_v4(), 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581', 'Subscriptions', 'Utilities', 'shared'
WHERE NOT EXISTS (
  SELECT 1 FROM categories 
  WHERE household_id = 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581' 
  AND name = 'Subscriptions'
);

-- Timestamp: Generated for Cycle 2 implementation (revised with household scope)
-- Status: Ready for execution after migration 004
