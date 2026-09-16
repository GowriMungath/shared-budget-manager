-- ============================================================================
-- RLS SECURITY TESTS
-- ============================================================================
-- These tests verify that RLS policies are working correctly.
-- Run these in a Supabase SQL editor after applying migrations 001 and 002.
--
-- Note: These are reference tests. Integrate them into your test suite
-- using Supabase's pgsql test framework or similar.

-- ============================================================================
-- TEST SETUP
-- ============================================================================

-- Create test users (these are UUIDs for reference; use actual auth.users IDs)
-- In real tests, create users via auth and capture their UIDs.

-- For this reference test, we assume:
-- gowri_id = '11111111-1111-1111-1111-111111111111'
-- nathaniel_id = '22222222-2222-2222-2222-222222222222'
-- unrelated_id = '33333333-3333-3333-3333-333333333333'

-- ============================================================================
-- TEST 1: Anon cannot read financial tables
-- ============================================================================

-- This test uses SET LOCAL ROLE to simulate anon
-- Expected: SELECT returns 0 rows due to RLS
-- Actual test would need proper anon session

/*
BEGIN;
SET LOCAL ROLE anon;
SELECT COUNT(*) FROM public.transactions;
-- Expected: 0 (or error if privileges denied)
ROLLBACK;
*/

-- ============================================================================
-- TEST 2: Gowri can create a household
-- ============================================================================

/*
-- Simulate Gowri's session
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '11111111-1111-1111-1111-111111111111';

-- Create household via secure function
SELECT private.create_household_for_current_user('Gowri and Nathaniel');

-- Expected: Returns a UUID for the new household_id
COMMIT;
*/

-- ============================================================================
-- TEST 3: Gowri can access her household
-- ============================================================================

/*
-- Assume gowri_household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '11111111-1111-1111-1111-111111111111';

SELECT COUNT(*) FROM public.households WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- Expected: 1 (Gowri is member, can see household)

COMMIT;
*/

-- ============================================================================
-- TEST 4: Nathaniel can access same household after being added
-- ============================================================================

/*
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '11111111-1111-1111-1111-111111111111'; -- Gowri

-- Gowri adds Nathaniel
INSERT INTO public.household_members (household_id, user_id, role)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member');

COMMIT;

-- Now switch to Nathaniel
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '22222222-2222-2222-2222-222222222222'; -- Nathaniel

SELECT COUNT(*) FROM public.households WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- Expected: 1 (Nathaniel is member, can see household)

COMMIT;
*/

-- ============================================================================
-- TEST 5: Unrelated user cannot access Gowri's household
-- ============================================================================

/*
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '33333333-3333-3333-3333-333333333333'; -- Unrelated user

SELECT COUNT(*) FROM public.households WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- Expected: 0 (not a member, cannot see household)

COMMIT;
*/

-- ============================================================================
-- TEST 6: Normal member cannot promote themselves to owner
-- ============================================================================

/*
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '22222222-2222-2222-2222-222222222222'; -- Nathaniel (member)

-- Try to update own role to owner (should fail due to policy and role constraint)
UPDATE public.household_members
SET role = 'owner'
WHERE household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND user_id = '22222222-2222-2222-2222-222222222222';

-- Expected: UPDATE 0 (policy denies, only owners can update)

COMMIT;
*/

-- ============================================================================
-- TEST 7: Normal member cannot add themselves to arbitrary household
-- ============================================================================

/*
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '22222222-2222-2222-2222-222222222222'; -- Nathaniel (member)

-- Create another household (not member)
CREATE TEMPORARY TABLE test_household AS
SELECT private.create_household_for_current_user('Other Household');
-- other_household_id = result

-- Try to add self to other_household (should fail, Nathaniel is not owner)
INSERT INTO public.household_members (household_id, user_id, role)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'member');

-- Expected: INSERT 0 (policy denies, must be owner of target household)

COMMIT;
*/

-- ============================================================================
-- TEST 8: Owner can add a member
-- ============================================================================

/*
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '11111111-1111-1111-1111-111111111111'; -- Gowri (owner)

INSERT INTO public.household_members (household_id, user_id, role)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member');

-- Expected: INSERT 1 (owner can add members)

COMMIT;
*/

-- ============================================================================
-- TEST 9: Cross-household insert attempts fail (same-household constraint)
-- ============================================================================

/*
-- Assume:
-- gowri_household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
-- nathaniel_household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
-- gowri_participant_id in gowri_household_id
-- nathaniel_participant_id in nathaniel_household_id

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '11111111-1111-1111-1111-111111111111'; -- Gowri

-- Try to create transaction with participant from different household (should fail)
INSERT INTO public.transactions (
  household_id, kind, date, description, total_cents, category_id, payer_participant_id
)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  -- Gowri's household
  'expense',
  '2024-01-01',
  'Cross-household transaction',
  5000,
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  -- Gowri's category
  'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'   -- Nathaniel's participant (different household)
);

-- Expected: INSERT fails due to payer_same_household CHECK constraint

COMMIT;
*/

-- ============================================================================
-- TEST 10: Household creation RPC makes caller owner
-- ============================================================================

/*
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = '44444444-4444-4444-4444-444444444444'; -- New user

SELECT private.create_household_for_current_user('New Household')::text AS new_household_id;
-- new_household_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

-- Verify caller is owner
SELECT COUNT(*) FROM public.household_members
WHERE household_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  AND user_id = '44444444-4444-4444-4444-444444444444'
  AND role = 'owner';
-- Expected: 1 (caller is owner)

COMMIT;
*/

-- ============================================================================
-- INTEGRATION TEST SUMMARY
-- ============================================================================

/*
These tests verify:

1. Anon cannot read/write financial tables (RLS blocks access)
2. Gowri can create households via secure RPC
3. Gowri can read her household
4. Nathaniel can read same household after being added by Gowri
5. Unrelated user cannot read Gowri's household
6. Normal member cannot self-promote to owner
7. Normal member cannot join arbitrary household
8. Owner can add members
9. Cross-household inserts fail due to CHECK constraints
10. Household creation RPC correctly assigns creator as owner

All tests should pass with these migrations in place.
*/
