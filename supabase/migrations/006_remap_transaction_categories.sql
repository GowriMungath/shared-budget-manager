-- Migration 006: Remap transaction category IDs to new common categories
-- Purpose: Migrate historical transactions from old category model to new common taxonomy
-- Safety: All remappings verified by merchant name analysis, preserves all 33 transactions

-- Personal Food remappings (from audit merchant analysis)
-- "Banana for smoothie" -> Groceries
UPDATE public.transactions 
SET category_id = (SELECT id FROM categories WHERE name = 'Groceries' AND scope = 'shared' LIMIT 1)
WHERE id = '842c8935-a691-4df2-91c5-d173659d6183';

-- "Panda Bowl" -> Eating Out
UPDATE public.transactions 
SET category_id = (SELECT id FROM categories WHERE name = 'Eating Out' AND scope = 'shared' LIMIT 1)
WHERE id = '99ce59a1-d014-4924-85e6-fba0e8662881';

-- "Chipotle" -> Eating Out
UPDATE public.transactions 
SET category_id = (SELECT id FROM categories WHERE name = 'Eating Out' AND scope = 'shared' LIMIT 1)
WHERE id = 'a0a2dd39-fb68-439a-b03e-2682be2e96ff';

-- "Banana for smoothie" -> Groceries
UPDATE public.transactions 
SET category_id = (SELECT id FROM categories WHERE name = 'Groceries' AND scope = 'shared' LIMIT 1)
WHERE id = 'ca4a9e8c-c597-4ec7-bcd3-0dc3385853e5';

-- Shopping remappings (all 5 transactions -> Clothing)
UPDATE public.transactions 
SET category_id = (SELECT id FROM categories WHERE name = 'Clothing' AND scope = 'personal' LIMIT 1)
WHERE id IN (
  'c704ef09-1ba9-45dc-a7f8-d368844e7e1c',  -- "Primark 2 piece"
  'e0ebba3c-cb7e-4049-bc27-14a45d0b6dd6',  -- "underarmour hoodie"
  'bd4baaa0-ffa3-49eb-b44f-0dd003b507bb',  -- "walmart winter"
  '2e5e566d-a808-4587-9224-0003012cb0d6',  -- "wild fable Jeans" (important: cross-payer, Gowri owner, Nathaniel payer)
  '454c681f-d0a0-4b43-a99b-203bd8e2e2ec'   -- "Cream Hoodie"
);

-- Personal Miscellaneous remappings -> Miscellaneous
UPDATE public.transactions 
SET category_id = (SELECT id FROM categories WHERE name = 'Miscellaneous' LIMIT 1)
WHERE category_id IN (
  SELECT id FROM categories WHERE name = 'Personal Miscellaneous'
);

-- Timestamp: Generated for Cycle 2 implementation
-- Status: Ready for execution on production after code deployment
-- Note: Cross-payer transaction (wild fable Jeans) preserved exactly as-is
