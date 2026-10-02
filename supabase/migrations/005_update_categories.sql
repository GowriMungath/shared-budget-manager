-- Migration 005: Rename existing categories and create new common categories
-- Purpose: Establish 15 common category taxonomy (scope-neutral)
-- Strategy: Preserve existing IDs where possible, create new IDs only for genuinely new categories

-- Rename existing categories (preserve IDs)
UPDATE public.categories 
SET name = 'Car Fuel', group_name = 'Transportation' 
WHERE name = 'Fuel' AND scope = 'shared';

UPDATE public.categories 
SET name = 'Entertainment & Fun' 
WHERE name = 'Entertainment' AND scope = 'shared';

UPDATE public.categories 
SET name = 'Personal Care' 
WHERE name = 'Hair / Beauty' AND scope = 'personal';

-- Create 4 genuinely new categories with new IDs
-- Clothing (for historical Shopping transactions)
INSERT INTO public.categories (id, household_id, name, group_name, scope)
SELECT uuid_generate_v4(), 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581', 'Clothing', 'Shopping', 'personal';

-- Household Shopping (for future use)
INSERT INTO public.categories (id, household_id, name, group_name, scope)
SELECT uuid_generate_v4(), 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581', 'Household Shopping', 'Shopping', 'shared';

-- Transportation (for future use)
INSERT INTO public.categories (id, household_id, name, group_name, scope)
SELECT uuid_generate_v4(), 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581', 'Transportation', 'Transport', 'shared';

-- Subscriptions (for future use)
INSERT INTO public.categories (id, household_id, name, group_name, scope)
SELECT uuid_generate_v4(), 'c05db94e-ddd0-46e3-afee-6a6d9b5a0581', 'Subscriptions', 'Utilities', 'shared';

-- Timestamp: Generated for Cycle 2 implementation
-- Status: Ready for execution on production after code deployment
