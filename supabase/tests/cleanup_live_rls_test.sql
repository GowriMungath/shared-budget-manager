BEGIN;

-- Child/dependent tables first
DELETE FROM public.allocations
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

DELETE FROM public.budget_limits
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

DELETE FROM public.settlements
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

DELETE FROM public.payment_methods
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

DELETE FROM public.goals
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

DELETE FROM public.obligations
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

DELETE FROM public.transactions
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

-- Reference data
DELETE FROM public.budget_periods
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

DELETE FROM public.categories
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

DELETE FROM public.participants
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

-- Memberships
DELETE FROM public.household_members
WHERE household_id IN (
  SELECT id FROM public.households
  WHERE name LIKE 'RLS_TEST_%'
);

-- Finally delete the test households themselves
DELETE FROM public.households
WHERE name LIKE 'RLS_TEST_%';

COMMIT;

-- Verification
SELECT id, name
FROM public.households
WHERE name LIKE 'RLS_TEST_%';