-- ============================================================================
-- ROW LEVEL SECURITY: Enable and Configure
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- EXPLICIT GRANTS: Least-Privilege Access Control
-- ============================================================================

-- STEP 1: Revoke all privileges from anon on all tables
REVOKE ALL ON profiles FROM anon;
REVOKE ALL ON households FROM anon;
REVOKE ALL ON household_members FROM anon;
REVOKE ALL ON participants FROM anon;
REVOKE ALL ON categories FROM anon;
REVOKE ALL ON budget_periods FROM anon;
REVOKE ALL ON budget_limits FROM anon;
REVOKE ALL ON transactions FROM anon;
REVOKE ALL ON allocations FROM anon;
REVOKE ALL ON settlements FROM anon;
REVOKE ALL ON payment_methods FROM anon;
REVOKE ALL ON goals FROM anon;
REVOKE ALL ON obligations FROM anon;

-- STEP 2: Grant minimal privileges to authenticated users
-- Profiles: users can read/update/insert their own
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

-- Households: users can only read (via RLS); creation only via RPC
GRANT SELECT ON households TO authenticated;

-- Household_members: users can read and insert (via RLS/policy, owners can add members only)
GRANT SELECT, INSERT ON household_members TO authenticated;

-- Financial read/write: RLS enforces household membership
-- Participants: read/write (member can create/update participants in their household)
GRANT SELECT, INSERT, UPDATE ON participants TO authenticated;

-- Categories: read/write (members manage categories)
GRANT SELECT, INSERT, UPDATE ON categories TO authenticated;

-- Budget_periods: read/write (members manage budget periods)
GRANT SELECT, INSERT, UPDATE ON budget_periods TO authenticated;

-- Budget_limits: read/write/delete (members manage limits, delete when not applicable)
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_limits TO authenticated;

-- Transactions: read/write/delete (members record and delete transactions)
GRANT SELECT, INSERT, UPDATE, DELETE ON transactions TO authenticated;

-- Allocations: read/write/delete (part of transaction; can modify allocations)
GRANT SELECT, INSERT, UPDATE, DELETE ON allocations TO authenticated;

-- Settlements: read/write/delete (members record settlements)
GRANT SELECT, INSERT, UPDATE, DELETE ON settlements TO authenticated;

-- Payment_methods: read/write/delete (members manage payment methods)
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_methods TO authenticated;

-- Goals: read/write/delete (members manage goals)
GRANT SELECT, INSERT, UPDATE, DELETE ON goals TO authenticated;

-- Obligations: read/write/delete (members track obligations)
GRANT SELECT, INSERT, UPDATE, DELETE ON obligations TO authenticated;

-- ============================================================================
-- NOTE: No direct INSERT on households
-- Household creation only via public.create_household_for_current_user() RPC
-- ============================================================================

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

-- Users can only read/write their own profile
CREATE POLICY "users_can_read_own_profile" ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_can_update_own_profile" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow insert on signup
CREATE POLICY "users_can_create_own_profile" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- HOUSEHOLDS POLICIES
-- ============================================================================

-- Users can read households they are members of (using helper function)
CREATE POLICY "users_can_read_households_they_belong_to" ON households FOR SELECT
  USING (private.is_household_member(id));

-- Only owners can update household (using helper function)
CREATE POLICY "owners_can_update_household" ON households FOR UPDATE
  USING (private.is_household_owner(id))
  WITH CHECK (private.is_household_owner(id));

-- Household creation is exclusively through private.create_household_for_current_user()
-- No direct INSERT policy on households

-- ============================================================================
-- HOUSEHOLD_MEMBERS POLICIES (using helper functions to avoid recursion)
-- ============================================================================

-- Users can read household_members of households they belong to
CREATE POLICY "users_can_read_household_members" ON household_members FOR SELECT
  USING (private.is_household_member(household_id));

-- Only owners can add members
-- Explicit: role must be 'member' (not 'owner' or other values)
-- This prevents owners from accidentally creating other owners
CREATE POLICY "owners_can_add_members" ON household_members FOR INSERT
  WITH CHECK (
    role = 'member' AND
    private.is_household_owner(household_id)
  );

-- MVP: No role editing support yet
-- Role changes/member removal can be added later via dedicated RPCs

-- ============================================================================
-- PARTICIPANTS POLICIES
-- ============================================================================

-- Users can read participants in their households
CREATE POLICY "users_can_read_participants" ON participants FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can insert participants in their households
CREATE POLICY "users_can_create_participants" ON participants FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

-- Users can update participants in their households
CREATE POLICY "users_can_update_participants" ON participants FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

-- ============================================================================
-- CATEGORIES POLICIES
-- ============================================================================

-- Users can read categories in their households
CREATE POLICY "users_can_read_categories" ON categories FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage categories in their households
CREATE POLICY "users_can_manage_categories" ON categories FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_categories" ON categories FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

-- ============================================================================
-- BUDGET_PERIODS POLICIES
-- ============================================================================

-- Users can read budget periods in their households
CREATE POLICY "users_can_read_budget_periods" ON budget_periods FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage budget periods in their households
CREATE POLICY "users_can_manage_budget_periods" ON budget_periods FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_budget_periods" ON budget_periods FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

-- ============================================================================
-- BUDGET_LIMITS POLICIES
-- ============================================================================

-- Users can read budget limits in their households
CREATE POLICY "users_can_read_budget_limits" ON budget_limits FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage budget limits in their households
CREATE POLICY "users_can_manage_budget_limits" ON budget_limits FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_budget_limits" ON budget_limits FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_delete_budget_limits" ON budget_limits FOR DELETE
  USING (private.is_household_member(household_id));

-- ============================================================================
-- TRANSACTIONS POLICIES
-- ============================================================================

-- Users can read transactions in their households
CREATE POLICY "users_can_read_transactions" ON transactions FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage transactions in their households
CREATE POLICY "users_can_manage_transactions" ON transactions FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_transactions" ON transactions FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_delete_transactions" ON transactions FOR DELETE
  USING (private.is_household_member(household_id));

-- ============================================================================
-- ALLOCATIONS POLICIES
-- ============================================================================

-- Users can read allocations in their households
CREATE POLICY "users_can_read_allocations" ON allocations FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage allocations in their households
CREATE POLICY "users_can_manage_allocations" ON allocations FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_allocations" ON allocations FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_delete_allocations" ON allocations FOR DELETE
  USING (private.is_household_member(household_id));

-- ============================================================================
-- SETTLEMENTS POLICIES
-- ============================================================================

-- Users can read settlements in their households
CREATE POLICY "users_can_read_settlements" ON settlements FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage settlements in their households
CREATE POLICY "users_can_manage_settlements" ON settlements FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_settlements" ON settlements FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_delete_settlements" ON settlements FOR DELETE
  USING (private.is_household_member(household_id));

-- ============================================================================
-- PAYMENT_METHODS POLICIES
-- ============================================================================

-- Users can read payment methods in their households
CREATE POLICY "users_can_read_payment_methods" ON payment_methods FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage payment methods in their households
CREATE POLICY "users_can_manage_payment_methods" ON payment_methods FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_payment_methods" ON payment_methods FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_delete_payment_methods" ON payment_methods FOR DELETE
  USING (private.is_household_member(household_id));

-- ============================================================================
-- GOALS POLICIES
-- ============================================================================

-- Users can read goals in their households
CREATE POLICY "users_can_read_goals" ON goals FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage goals in their households
CREATE POLICY "users_can_manage_goals" ON goals FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_goals" ON goals FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_delete_goals" ON goals FOR DELETE
  USING (private.is_household_member(household_id));

-- ============================================================================
-- OBLIGATIONS POLICIES
-- ============================================================================

-- Users can read obligations in their households
CREATE POLICY "users_can_read_obligations" ON obligations FOR SELECT
  USING (private.is_household_member(household_id));

-- Users can manage obligations in their households
CREATE POLICY "users_can_manage_obligations" ON obligations FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_obligations" ON obligations FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_delete_obligations" ON obligations FOR DELETE
  USING (private.is_household_member(household_id));
