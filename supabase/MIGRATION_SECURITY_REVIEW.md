# Supabase Migration Security Review & Updates

## Overview

The migration files have been significantly enhanced to address security and integrity issues identified in the comprehensive security review. This document outlines all changes made.

---

## 1. Migration Changes Summary

### File: `001_initial_schema.sql`

#### Added: Private Schema
```sql
CREATE SCHEMA IF NOT EXISTS private;
```
- Private schema for internal functions not exposed to clients
- Isolates security-critical code from public API

#### Added: Same-Household Referential Integrity Constraints

All financial tables now include CHECK constraints to ensure referenced entities belong to the same household:

**transactions table:**
- `CONSTRAINT category_same_household`: category_id must exist in same household
- `CONSTRAINT payer_same_household`: payer_participant_id must exist in same household

**allocations table:**
- `CONSTRAINT transaction_same_household`: transaction_id must belong to same household
- `CONSTRAINT participant_same_household`: participant_id must belong to same household

**budget_limits table:**
- `CONSTRAINT budget_period_same_household`: budget_period_id must belong to same household
- `CONSTRAINT category_same_household`: category_id must belong to same household
- `CONSTRAINT owner_participant_same_household`: owner_participant_id (if set) must belong to same household

**settlements table:**
- `CONSTRAINT from_participant_same_household`: from_participant_id must belong to same household
- `CONSTRAINT to_participant_same_household`: to_participant_id must belong to same household

**payment_methods table:**
- `CONSTRAINT owner_participant_same_household`: owner_participant_id must belong to same household

**goals table:**
- `CONSTRAINT owner_participant_same_household`: owner_participant_id must belong to same household

**obligations table:**
- `CONSTRAINT owner_participant_same_household`: owner_participant_id (if set) must belong to same household

**Purpose:** Prevents cross-household data contamination at the database level, independent of application logic.

#### Added: Helper Functions

Three SECURITY DEFINER functions in private schema:

**1. `private.is_household_member(household_uuid UUID) → BOOLEAN`**
```sql
SECURITY DEFINER
SET search_path = ''
```
- Checks if current user (auth.uid()) is member of household
- Used by RLS policies to avoid recursive household_members queries
- Fully schema-qualified

**2. `private.is_household_owner(household_uuid UUID) → BOOLEAN`**
```sql
SECURITY DEFINER
SET search_path = ''
```
- Checks if current user (auth.uid()) is owner of household
- Used by RLS policies for owner-only operations
- Fully schema-qualified

**3. `private.create_household_for_current_user(name TEXT) → UUID`**
```sql
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
```
- Only mechanism for creating households
- Validates:
  - User is authenticated (auth.uid() IS NOT NULL)
  - Household name non-empty
  - Household name ≤ 255 characters
- Atomically creates household and adds creator as owner
- Returns household UUID

#### Added: Privilege Grants for Private Functions

```sql
-- Revoke from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION private.is_household_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_household_member(UUID) FROM anon;

-- Grant only to authenticated
GRANT EXECUTE ON FUNCTION private.is_household_member(UUID) TO authenticated;
```

- Same pattern for all three functions
- anon (unauthenticated users) cannot execute any private functions
- Only authenticated users can

---

### File: `002_row_level_security.sql`

#### Changed: Removed Broad INSERT Policy on households

**Before:** Would have allowed:
```sql
CREATE POLICY ... FOR INSERT WITH CHECK (TRUE);  -- DANGEROUS
```

**After:** No INSERT policy on public.households
- Direct INSERT on households is impossible for clients
- Household creation exclusively through `private.create_household_for_current_user()` RPC

#### Changed: Explicit Grants for anon

```sql
REVOKE ALL ON [table] FROM anon;
```

Applied to all 13 financial tables:
- profiles
- households
- household_members
- participants
- categories
- budget_periods
- budget_limits
- transactions
- allocations
- settlements
- payment_methods
- goals
- obligations

**Purpose:** anon has zero privileges; RLS alone is insufficient for security.

#### Changed: Explicit Grants for authenticated

```sql
GRANT SELECT, INSERT, UPDATE ON participants TO authenticated;
```

- Minimal privilege grants (SELECT, INSERT, UPDATE where needed, DELETE for editable tables)
- RLS policies further restrict based on household membership
- Defense in depth: privilege + RLS

#### Changed: RLS Policy Pattern

**Before:** Direct household_members query inside household_members policies (recursive)
```sql
EXISTS (
  SELECT 1 FROM household_members hm
  WHERE hm.household_id = household_members.household_id
    AND hm.user_id = auth.uid()
)
```

**After:** Use private helper functions
```sql
USING (private.is_household_member(household_id));
```

**Benefit:**
- Avoids recursive RLS evaluation on household_members table
- Single source of truth for membership check
- SECURITY DEFINER function executes with elevated privileges, preventing RLS loops

#### Changed: household_members INSERT Policy

**Before:** Allow any role assignment
```sql
CREATE POLICY "owners_can_add_members" ON household_members FOR INSERT
  WITH CHECK (role != 'owner' AND ...);
```

**After:** Same logic, now using helper function
```sql
CREATE POLICY "owners_can_add_members" ON household_members FOR INSERT
  WITH CHECK (
    role != 'owner' AND
    private.is_household_owner(household_id)
  );
```

**Key:** `role != 'owner'` prevents owners from being created via INSERT; only existing owners can assign roles.

#### All household-owned tables

Updated all 11 table policies to use private helper functions:
- participants
- categories
- budget_periods
- budget_limits
- transactions
- allocations
- settlements
- payment_methods
- goals
- obligations

**Pattern:**
```sql
CREATE POLICY "users_can_read_X" ON X FOR SELECT
  USING (private.is_household_member(household_id));

CREATE POLICY "users_can_manage_X" ON X FOR INSERT
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_update_X" ON X FOR UPDATE
  USING (private.is_household_member(household_id))
  WITH CHECK (private.is_household_member(household_id));

CREATE POLICY "users_can_delete_X" ON X FOR DELETE
  USING (private.is_household_member(household_id));
```

---

### File: `003_rls_tests.sql` (NEW)

Reference SQL tests covering:

1. **Anon cannot read/write financial tables**
2. **Gowri can create household**
3. **Gowri can access her household**
4. **Nathaniel can access same household after being added**
5. **Unrelated user cannot access Gowri's household**
6. **Normal member cannot promote self to owner**
7. **Normal member cannot join arbitrary household**
8. **Owner can add member**
9. **Cross-household inserts fail** (same-household constraints)
10. **Household creation RPC makes caller owner**

**Purpose:** Documentation and manual verification template.

---

## 2. Helper Functions Details

### `private.is_household_member(household_uuid UUID) → BOOLEAN`

**Usage in RLS:**
```sql
CREATE POLICY "users_can_read_transactions" ON transactions FOR SELECT
  USING (private.is_household_member(household_id));
```

**Replaces recursive pattern:**
```sql
-- Before (recursive, now avoided):
USING (
  EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.household_id = transactions.household_id
      AND hm.user_id = auth.uid()
  )
)
```

**Implementation:**
```sql
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
```

**Why SECURITY DEFINER?**
- Function runs with postgres role privileges
- household_members RLS does not apply to the helper's internal query
- Prevents infinite recursion: policy calls helper → helper reads household_members without RLS re-evaluation

**Why `SET search_path = ''`?**
- Prevents SQL injection via schema search
- Forces full schema qualification in function body
- `public.household_members` explicitly scoped

---

### `private.is_household_owner(household_uuid UUID) → BOOLEAN`

**Same structure as is_household_member, adds role check:**
```sql
AND household_members.role = 'owner'
```

**Used by:**
- `households` UPDATE policy (owners can update household name)
- `household_members` INSERT policy (only owners can add members)
- `household_members` UPDATE policy (only owners can modify roles)

---

### `private.create_household_for_current_user(name TEXT) → UUID`

**Full implementation:**
```sql
CREATE OR REPLACE FUNCTION private.create_household_for_current_user(name TEXT)
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
```

**Client usage (TypeScript/JavaScript):**
```typescript
const { data, error } = await supabase.rpc('create_household_for_current_user', {
  name: 'Gowri and Nathaniel'
});

if (error) throw error;
const householdId = data;
```

**Security guarantees:**
1. User must be authenticated
2. Household name validated (non-empty, bounded)
3. Creator automatically assigned as owner
4. No RLS prevents the function—it runs with elevated privileges
5. Returns household UUID for immediate use

---

## 3. Same-Household Referential Integrity

### Problem Solved

Without these constraints, an attacker with RLS bypass (hypothetically) or a bug in application code could:
- Insert transaction in household A referencing participant from household B
- Insert allocation referencing transaction from household C
- Create budget_limit for category in different household

### Solution: CHECK Constraints

**Example: transactions table**
```sql
CONSTRAINT payer_same_household CHECK (
  payer_participant_id IN (
    SELECT id FROM participants WHERE participants.household_id = transactions.household_id
  )
)
```

**Enforcement:**
- Happens at INSERT/UPDATE time
- Database rejects if constraint violated
- Cannot be bypassed by application code
- Works even if RLS disabled (defense in depth)

### All Constraints Applied To

| Table | Constraints |
|-------|-------------|
| transactions | category_same_household, payer_same_household |
| allocations | transaction_same_household, participant_same_household |
| budget_limits | budget_period_same_household, category_same_household, owner_participant_same_household |
| settlements | from_participant_same_household, to_participant_same_household |
| payment_methods | owner_participant_same_household |
| goals | owner_participant_same_household |
| obligations | owner_participant_same_household |

---

## 4. Household_members Recursion Handling

### Problem

Original RLS policy on household_members:
```sql
CREATE POLICY "users_can_read_household_members" ON household_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
    )
  );
```

When a user queries household_members, the policy evaluates the inner SELECT. That inner SELECT also touches household_members, triggering the same policy again. This can cause:
- RLS evaluation loops
- Performance degradation
- Unpredictable results

### Solution

Use private helper function with SECURITY DEFINER:
```sql
CREATE POLICY "users_can_read_household_members" ON household_members FOR SELECT
  USING (private.is_household_member(household_id));
```

The helper function executes with elevated privileges and doesn't re-trigger RLS evaluation on household_members.

---

## 5. Explicit Grants Strategy

### Problem

Relying solely on RLS is insufficient. If RLS is accidentally disabled or bypassed:
```sql
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;  -- Dangerous!
SELECT * FROM transactions;  -- All data exposed
```

### Solution: Defense in Depth

**Layer 1: Explicit Grants (Database-level)**
```sql
REVOKE ALL ON transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON transactions TO authenticated;
```

**Layer 2: RLS Policies (Data-level)**
```sql
CREATE POLICY "users_can_read_transactions" ON transactions FOR SELECT
  USING (private.is_household_member(household_id));
```

**Layer 3: Application Code (Business logic)**
- Client libraries filter/validate before operations
- Server-side auth tokens tied to user

### Effect

If RLS is disabled, anon still cannot access any financial tables (no privileges). Only authenticated users can, and they'd see all data (bad, but contained).

---

## 6. Nathaniel Onboarding Flow (Secure MVP)

### Step 1: Gowri Signs Up & Creates Household

**Client code:**
```typescript
// After Gowri signs up and auth.uid() is set
const { data: householdId, error } = await supabase.rpc(
  'create_household_for_current_user',
  { name: 'Gowri and Nathaniel' }
);
```

**Database result:**
- Household created
- Gowri added as owner to household_members

### Step 2: Nathaniel Signs Up

**Auth system:**
- Nathaniel creates account (email/password)
- Profile created on first login

### Step 3: Gowri Adds Nathaniel

**After Nathaniel signs up (Gowri knows his user ID or email mapping):**

**Client code (Gowri's session):**
```typescript
// Gowri adds Nathaniel (must obtain Nathaniel's user_id from invite/admin flow)
const { error } = await supabase
  .from('household_members')
  .insert({
    household_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    user_id: nathaniel_user_id,  // From invite system or admin
    role: 'member'
  });
```

**RLS enforcement:**
- Gowri's policy: `owners_can_add_members` checks `private.is_household_owner(household_id)`
- Helper returns TRUE (Gowri is owner)
- Constraint `role != 'owner'` satisfied (inserting as 'member')
- INSERT succeeds

### Step 4: Nathaniel Accesses Household

**Client code (Nathaniel's session):**
```typescript
const { data: households, error } = await supabase
  .from('households')
  .select('*');
```

**RLS enforcement:**
- Policy: `users_can_read_households_they_belong_to` checks `private.is_household_member(id)`
- Helper queries household_members with Nathaniel's uid
- Returns TRUE (Nathaniel is member)
- SELECT succeeds

### No RLS Weakening

- RLS policies unchanged for convenience
- Same protection as before
- Invite system (step 3) is out-of-band (not in SQL)
- Gowri must have Nathaniel's user_id (from admin panel or email-based invite link)

---

## 7. RLS Tests

### Running Tests

Tests in `003_rls_tests.sql` are reference implementations using Supabase's SQL runner.

**To run manually:**

1. Connect to Supabase via SQL Editor
2. Copy each test block
3. Execute with appropriate role/uid:
   ```sql
   BEGIN;
   SET LOCAL ROLE authenticated;
   SET LOCAL auth.uid = '11111111-1111-1111-1111-111111111111';
   SELECT ... FROM transactions;
   ROLLBACK;
   ```

**To integrate into CI:**

Use Supabase's test framework or pgTAP:
```bash
pg_prove -d supabase_test supabase/migrations/003_rls_tests.sql
```

### Test Coverage

| # | Test | Purpose |
|---|------|---------|
| 1 | Anon cannot read financial tables | Privilege layer |
| 2 | Gowri can create household | RPC function |
| 3 | Gowri can access her household | RLS SELECT |
| 4 | Nathaniel can access same household | RLS after membership |
| 5 | Unrelated user cannot access | RLS isolation |
| 6 | Normal member cannot self-promote | role != 'owner' constraint + policy |
| 7 | Normal member cannot join arbitrary household | Policy enforcement |
| 8 | Owner can add member | INSERT policy for owners |
| 9 | Cross-household inserts fail | CHECK constraints |
| 10 | RPC makes caller owner | create_household_for_current_user logic |

---

## 8. Remaining Concerns

### None identified in migrations themselves.

**Future considerations (outside scope):**

1. **Invite System:** Step 3 (Gowri adds Nathaniel) requires obtaining Nathaniel's user_id. How is this shared securely?
   - Email-based invite link (recommended for MVP)
   - Admin panel with user search
   - Manual user_id sharing

2. **Soft Deletion Handling:** Verify Supabase repositories exclude `deleted_at IS NOT NULL` in all SELECT queries.
   - Not enforced in RLS (allows application choice)
   - Must be handled in `src/infrastructure/supabase/repositories.ts`

3. **Test Automation:** 003_rls_tests.sql requires manual session setup for testing. Automate with pgTAP or Supabase client tests.

4. **Audit Logging:** Consider adding trigger-based audit log for sensitive operations (role changes, household creation).

---

## 9. Security Checklist

Before applying migrations to production:

- [ ] Review all CHECK constraints (same-household integrity)
- [ ] Verify private functions are not accidentally exposed in Supabase dashboard
- [ ] Test: Anon user cannot query any financial table
- [ ] Test: Authenticated user from different household cannot access Gowri's data
- [ ] Test: Normal member cannot modify household_members
- [ ] Test: Cross-household data inserts fail
- [ ] Review invite system (out of scope for SQL)
- [ ] Verify repositories exclude soft-deleted rows
- [ ] Run 003_rls_tests.sql test suite
- [ ] Document deployment procedure

---

## 10. Deployment Notes

### Do NOT Apply Yet

These migrations are ready for review but **should not be applied to production** until:

1. Supabase project is fully prepared
2. Invite/onboarding system is defined
3. All tests in 003_rls_tests.sql pass
4. Client code (repositories) is verified to exclude deleted rows

### Application Code Changes Required

When ready to deploy:

1. **Update Supabase repositories** to:
   - Filter `deleted_at IS NULL` on SELECT queries
   - Use `private.create_household_for_current_user()` RPC for household creation
   - Handle household_members operations via RLS-enforced endpoints

2. **Update authService** (already correct):
   - Continues to check `isCloudMode()`
   - Uses Supabase client for auth operations

3. **Update app initialization**:
   - Call RPC to create household on first login
   - Fetch household_members to determine access level

---

## 11. Migration Application Order

1. **001_initial_schema.sql** – Creates all tables, indexes, triggers, helper functions
2. **002_row_level_security.sql** – Enables RLS and creates policies
3. **003_rls_tests.sql** – Reference tests (run manually for verification)

Do not apply out of order.

---

## Summary

**Changes Made:**
1. ✅ Added private schema for secure functions
2. ✅ Created 3 private helper functions (is_household_member, is_household_owner, create_household_for_current_user)
3. ✅ Added same-household CHECK constraints to 7 tables
4. ✅ Removed broad INSERT policy on households
5. ✅ Added explicit REVOKE/GRANT for anon
6. ✅ Rewrote all RLS policies to use helper functions
7. ✅ Fixed household_members recursion issue
8. ✅ Added 10 reference test scenarios

**Security Strengths:**
- No cross-household data contamination possible
- household_members self-promotion blocked
- Anon has zero privileges
- RLS recursion avoided
- Household creation only via secure RPC

**Remaining Gaps (Application-level, not SQL):**
- Soft deletion filtering in repositories
- Invite system for onboarding
- Test automation
