-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create private schema for internal functions (not exposed to clients)
CREATE SCHEMA IF NOT EXISTS private;

-- Profiles table (minimal user profile)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Households table
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Household members (junction table for users and households)
CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- Participants (household members + external participants)
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'household-member' CHECK (kind IN ('household-member', 'external')),
  member_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Composite unique key for foreign key references
  UNIQUE (household_id, id)
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared', 'personal')),
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite unique key for foreign key references
  UNIQUE (household_id, id)
);

-- Budget periods
CREATE TABLE IF NOT EXISTS budget_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite unique key for foreign key references
  UNIQUE (household_id, id)
);

-- Budget limits
CREATE TABLE IF NOT EXISTS budget_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  budget_period_id UUID NOT NULL,
  category_id UUID NOT NULL,
  scope TEXT NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared', 'personal')),
  owner_participant_id UUID,
  limit_cents BIGINT NOT NULL CHECK (limit_cents >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite foreign keys ensure same household
  FOREIGN KEY (household_id, budget_period_id)
    REFERENCES budget_periods (household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, category_id)
    REFERENCES categories (household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, owner_participant_id)
    REFERENCES participants (household_id, id) ON DELETE SET NULL
);

-- Transactions (expenses)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind = 'expense'),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  total_cents BIGINT NOT NULL CHECK (total_cents > 0),
  category_id UUID NOT NULL,
  payer_participant_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite foreign keys ensure same household
  FOREIGN KEY (household_id, category_id)
    REFERENCES categories (household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, payer_participant_id)
    REFERENCES participants (household_id, id) ON DELETE RESTRICT,
  -- Composite unique key for foreign key references
  UNIQUE (household_id, id)
);

-- Allocations (expense distribution)
CREATE TABLE IF NOT EXISTS allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL,
  participant_id UUID NOT NULL,
  position INT NOT NULL CHECK (position >= 0),
  cents BIGINT NOT NULL CHECK (cents >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite foreign keys ensure same household
  FOREIGN KEY (household_id, transaction_id)
    REFERENCES transactions (household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, participant_id)
    REFERENCES participants (household_id, id) ON DELETE RESTRICT
);

-- Settlements (balance payments)
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  from_participant_id UUID NOT NULL,
  to_participant_id UUID NOT NULL,
  cents BIGINT NOT NULL CHECK (cents > 0),
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite foreign keys ensure both participants belong to same household
  FOREIGN KEY (household_id, from_participant_id)
    REFERENCES participants (household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, to_participant_id)
    REFERENCES participants (household_id, id) ON DELETE RESTRICT
);

-- Payment methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_participant_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite foreign key ensures owner_participant belongs to same household
  FOREIGN KEY (household_id, owner_participant_id)
    REFERENCES participants (household_id, id) ON DELETE RESTRICT
);

-- Goals
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_participant_id UUID NOT NULL,
  target_cents BIGINT NOT NULL CHECK (target_cents > 0),
  current_saved_cents BIGINT DEFAULT 0 CHECK (current_saved_cents >= 0),
  deadline_month TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite foreign key ensures owner_participant belongs to same household
  FOREIGN KEY (household_id, owner_participant_id)
    REFERENCES participants (household_id, id) ON DELETE RESTRICT
);

-- Obligations (future commitments)
CREATE TABLE IF NOT EXISTS obligations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_scope TEXT NOT NULL DEFAULT 'shared' CHECK (owner_scope IN ('shared', 'personal')),
  owner_participant_id UUID,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('credit_card_bill', 'travel', 'education', 'visa', 'utility', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Composite foreign key ensures owner_participant belongs to same household (when not null)
  FOREIGN KEY (household_id, owner_participant_id)
    REFERENCES participants (household_id, id) ON DELETE SET NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON household_members(household_id);

CREATE INDEX IF NOT EXISTS idx_participants_household_id ON participants(household_id);

CREATE INDEX IF NOT EXISTS idx_categories_household_id ON categories(household_id);

CREATE INDEX IF NOT EXISTS idx_budget_periods_household_id ON budget_periods(household_id);

CREATE INDEX IF NOT EXISTS idx_budget_limits_household_id ON budget_limits(household_id);
CREATE INDEX IF NOT EXISTS idx_budget_limits_budget_period_id ON budget_limits(budget_period_id);
CREATE INDEX IF NOT EXISTS idx_budget_limits_category_id ON budget_limits(category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_household_id ON transactions(household_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payer_participant_id ON transactions(payer_participant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_household_id_updated_at ON transactions(household_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_allocations_household_id ON allocations(household_id);
CREATE INDEX IF NOT EXISTS idx_allocations_transaction_id ON allocations(transaction_id);
CREATE INDEX IF NOT EXISTS idx_allocations_participant_id ON allocations(participant_id);

CREATE INDEX IF NOT EXISTS idx_settlements_household_id ON settlements(household_id);
CREATE INDEX IF NOT EXISTS idx_settlements_from_participant_id ON settlements(from_participant_id);
CREATE INDEX IF NOT EXISTS idx_settlements_to_participant_id ON settlements(to_participant_id);
CREATE INDEX IF NOT EXISTS idx_settlements_household_id_updated_at ON settlements(household_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_payment_methods_household_id ON payment_methods(household_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_owner_participant_id ON payment_methods(owner_participant_id);

CREATE INDEX IF NOT EXISTS idx_goals_household_id ON goals(household_id);
CREATE INDEX IF NOT EXISTS idx_goals_owner_participant_id ON goals(owner_participant_id);

CREATE INDEX IF NOT EXISTS idx_obligations_household_id ON obligations(household_id);
CREATE INDEX IF NOT EXISTS idx_obligations_due_date ON obligations(due_date);
CREATE INDEX IF NOT EXISTS idx_obligations_owner_participant_id ON obligations(owner_participant_id);

-- Create trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_timestamp BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_households_timestamp BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_household_members_timestamp BEFORE UPDATE ON household_members
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_participants_timestamp BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_categories_timestamp BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_budget_periods_timestamp BEFORE UPDATE ON budget_periods
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_budget_limits_timestamp BEFORE UPDATE ON budget_limits
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_transactions_timestamp BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_allocations_timestamp BEFORE UPDATE ON allocations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_settlements_timestamp BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_payment_methods_timestamp BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_goals_timestamp BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_obligations_timestamp BEFORE UPDATE ON obligations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- PRIVATE HELPER FUNCTIONS (for RLS and internal use)
-- ============================================================================

-- Check if current user is a member of a household
CREATE OR REPLACE FUNCTION private.is_household_member(household_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.household_members
    WHERE household_members.household_id = household_uuid
      AND household_members.user_id = auth.uid()
  );
$$;

-- Check if current user is an owner of a household
CREATE OR REPLACE FUNCTION private.is_household_owner(household_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.household_members
    WHERE household_members.household_id = household_uuid
      AND household_members.user_id = auth.uid()
      AND household_members.role = 'owner'
  );
$$;

-- ============================================================================
-- PUBLIC RPC: Household Creation (exposed via Data API)
-- ============================================================================

-- Create a new household and add creator as owner
CREATE OR REPLACE FUNCTION public.create_household_for_current_user(name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  household_id UUID;
  current_user_id UUID;
BEGIN
  -- Verify user is authenticated
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to create a household';
  END IF;

  -- Validate household name is non-empty and bounded
  IF name IS NULL OR TRIM(name) = '' THEN
    RAISE EXCEPTION 'Household name cannot be empty';
  END IF;
  IF LENGTH(name) > 255 THEN
    RAISE EXCEPTION 'Household name cannot exceed 255 characters';
  END IF;

  -- Create household
  INSERT INTO public.households (name)
  VALUES (TRIM(name))
  RETURNING id INTO household_id;

  -- Add creator as owner
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (household_id, current_user_id, 'owner');

  RETURN household_id;
END;
$$;

-- ============================================================================
-- GRANT EXECUTION PRIVILEGES FOR FUNCTIONS
-- ============================================================================

-- Private helper functions: only authenticated
REVOKE EXECUTE ON FUNCTION private.is_household_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_household_member(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION private.is_household_member(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION private.is_household_owner(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_household_owner(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION private.is_household_owner(UUID) TO authenticated;

-- Public RPC: authenticated users can call
REVOKE EXECUTE ON FUNCTION public.create_household_for_current_user(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_household_for_current_user(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_household_for_current_user(TEXT) TO authenticated;


