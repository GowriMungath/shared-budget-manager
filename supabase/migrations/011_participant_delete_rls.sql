-- ============================================================================
-- MIGRATION 011: Add RLS DELETE Policy for External Participant Deletion
-- ============================================================================
-- Purpose: Enable safe deletion of unused external participants with RLS protection
-- 
-- Design:
-- - Follows the household-membership authorization pattern from 002_row_level_security.sql
-- - Uses private.is_household_member() helper for household verification
-- - Restricts deletion to external participants only (household members never deletable)
-- - Application reference checks (PeopleUseCases.permanentlyDeleteParticipant) provide first line of defense
-- - RLS policy provides second line of defense
-- - ON DELETE RESTRICT foreign key constraints provide final database-level backstop
--
-- Defense in Depth:
-- 1. UI confirmation (user must confirm deletion)
-- 2. Application reference checks (detect transactions/settlements with participant)
-- 3. RLS DELETE policy (enforce authorization at database level)
-- 4. Foreign key ON DELETE RESTRICT (prevent deletion if references exist)
--
-- This ensures that even if application checks are bypassed, the database
-- prevents orphaned references through FK constraints.
-- ============================================================================

-- ============================================================================
-- PARTICIPANTS DELETE POLICY
-- ============================================================================
-- Restrict deletion to:
-- - Authenticated users who are household members
-- - Only external participants (kind = 'external')
-- - Household members can never be deleted (kind = 'household-member')
--
-- The RLS policy prevents unauthorized deletion. The foreign key constraints
-- then prevent deletion of participants that have transaction/settlement references.
-- ============================================================================

CREATE POLICY "users_can_delete_external_participants"
ON public.participants
FOR DELETE
TO authenticated
USING (
  private.is_household_member(household_id)
  AND kind = 'external'
);
-- ============================================================================
-- GRANT DELETE PRIVILEGE TO AUTHENTICATED USERS
-- ============================================================================
-- Already granted in 002_row_level_security.sql:
-- GRANT SELECT, INSERT, UPDATE ON participants TO authenticated;
--
-- Now add DELETE to support external participant removal:
-- ============================================================================

GRANT DELETE ON participants TO authenticated;

-- ============================================================================
-- DESIGN DOCUMENTATION FOR RLS POLICY VERIFICATION
-- ============================================================================
--
-- Policy: "users_can_delete_external_participants"
-- Table: participants
-- Operation: DELETE
-- 
-- Authorization Requirements:
-- 1. User must be authenticated (implicit - policy only visible to authenticated)
-- 2. User must be a household member: private.is_household_member(household_id)
--    This checks: auth.uid() IN (SELECT user_id FROM household_members WHERE household_id = participants.household_id)
-- 3. Participant must be external: kind = 'external'
--    This prevents accidental deletion of household members
--
-- Test Scenarios:
-- ✓ Household member can delete unused external participant in own household
-- ✓ Cannot delete household-member participants (kind = 'household-member')
-- ✓ Cannot delete participant in another household (is_household_member fails)
-- ✓ Unauthenticated delete denied (no auth.uid())
-- ✓ Referenced external participant remains blocked by ON DELETE RESTRICT FK
--    - transactions(payer_participant_id) FK → participants(id) ON DELETE RESTRICT
--    - allocations(participant_id) FK → participants(id) ON DELETE RESTRICT
--    - settlements(from_participant_id, to_participant_id) FK → participants(id) ON DELETE RESTRICT
--    - payment_methods(owner_participant_id) FK → participants(id) ON DELETE RESTRICT
--    - goals(owner_participant_id) FK → participants(id) ON DELETE RESTRICT
--    - obligations(owner_participant_id) FK → participants(id) ON DELETE SET NULL
--
-- This creates fail-closed deletion: if RLS somehow permits deletion but
-- the participant is referenced, FK constraints will prevent it.
-- ============================================================================
