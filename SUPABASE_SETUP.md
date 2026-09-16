# Supabase Cloud Infrastructure Setup

This document describes the cloud infrastructure foundation for Shared Budget Manager. This phase establishes authentication, household membership, and database schema without implementing cross-device synchronization.

## Overview

The cloud layer adds:
- User authentication (email/password)
- Household ownership and membership model
- PostgreSQL backend with Row Level Security (RLS)
- Cloud repository implementations
- Secure access control via RLS policies

**Current Limitations:**
- Cross-device/IndexedDB ↔ Supabase synchronization is NOT implemented yet
- This is foundation-only for the next sync phase
- Local IndexedDB mode continues to work (unchanged)

## Prerequisites

1. A Supabase project
2. Node.js 18+ and npm/yarn
3. `.env.local` file with Supabase credentials

## Environment Variables

Create a `.env.local` file in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get these values from your Supabase project:
1. Go to **Settings → API**
2. Copy **Project URL** (VITE_SUPABASE_URL)
3. Copy **Publishable Anon Key** (VITE_SUPABASE_PUBLISHABLE_KEY)

**Security Note:** Never commit `.env.local` or `.env.production.local`. The `.env.example` file shows the required keys. The publishable key is browser-safe but database access is still controlled by RLS policies.

## Database Migration

### 1. Create Tables and Schema

Run the migration files in order:

```sql
-- supabase/migrations/001_initial_schema.sql
-- Creates all tables, indexes, and triggers for updated_at management
```

In Supabase:
1. Go to **SQL Editor**
2. Create a new query
3. Copy contents of `supabase/migrations/001_initial_schema.sql`
4. Run the query

**Tables Created:**
- `profiles` - Minimal user profile
- `households` - Household records
- `household_members` - User-household junction table
- `participants` - Household members and external participants
- `categories`, `budget_periods`, `budget_limits` - Budget management
- `transactions`, `allocations` - Expense tracking
- `settlements` - Balance payments
- `payment_methods`, `goals`, `obligations` - Additional financial data

All financial amounts use `BIGINT` (integer cents) for accuracy.
All tables include `created_at`, `updated_at`, and tombstone support via `deleted_at`.

### 2. Enable Row Level Security (RLS)

Run the second migration:

```sql
-- supabase/migrations/002_row_level_security.sql
-- Enables RLS and creates security policies
```

In Supabase SQL Editor:
1. Create a new query
2. Copy contents of `supabase/migrations/002_row_level_security.sql`
3. Run the query

**RLS Policies Implemented:**
- Users can only read/write households they are members of
- Each household has isolated financial data
- Only household owners can manage members
- All data access is scoped to `household_id`

## Authentication

### Sign Up / Sign In

Use the authentication UI in the app:

1. Navigate to `/login`
2. Enter email and password
3. Click "Sign In" or "Sign Up"

The auth system uses Supabase's built-in email/password authentication.

**Note:** Supabase may require email confirmation. Check your email for confirmation links.

### Session Management

- Sessions are managed automatically by `AuthContext`
- User info is available via the `useAuth()` hook
- Sign out via the logout button in the header

## Household Model

### Creating a Household

When a user signs up, they do NOT automatically get a household. To create one:

1. User signs up/signs in
2. First login shows a "create household" prompt (TODO: implement this UI)
3. Creator becomes `owner` role
4. Can then invite other users

**For MVP Development:**

To manually add a user to a household (requires direct database access):

```sql
-- After both users are authenticated, run this in Supabase SQL Editor:
INSERT INTO household_members (household_id, user_id, role)
VALUES ('[HOUSEHOLD_ID]', '[USER_ID]', 'member');
```

### Adding Members to a Household

Only household owners can add members:

```typescript
const { error } = await householdService.addMemberToHousehold(
  householdId,
  newUserId,
  currentUserId // Must be owner
);
```

## Row Level Security (RLS)

All tables have RLS enabled. Access is controlled by:

```sql
-- Example RLS policy
CREATE POLICY "users_can_read_transactions" ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = transactions.household_id
        AND hm.user_id = auth.uid()
    )
  );
```

**Key Points:**
- Users outside a household cannot access its data
- Application-level filtering is NOT the primary security mechanism
- Database enforces access at the row level

## Development Workflow

### Local Development (IndexedDB)

The app has two modes:

**CLOUD MODE** (Supabase configured):
- Requires both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`
- Uses real Supabase authentication
- Protected routes require login

**LOCAL MODE** (Supabase not configured):
- If either env var is missing, the app uses mock authentication
- Useful for development and E2E testing without a live Supabase project
- Full financial features work with local IndexedDB storage
- No real authentication required

### Testing Household Membership

Test scenario: Gowri & Nathaniel in same household

1. **User 1 (Gowri):**
   - Sign up/in
   - Create household "Gowri & Nathaniel"
   - Becomes owner

2. **User 2 (Nathaniel):**
   - Sign up/in on separate browser/device
   - Cannot see Gowri's household yet

3. **Add Nathaniel:**
   - In Supabase SQL Editor, add Nathaniel to the household
   - Nathaniel signs in again
   - Now sees the same household

4. **Verify Isolation:**
   - Create transaction in household as Gowri
   - Sign in as Nathaniel
   - Transaction is visible (same household)
   - Create new household as Nathaniel
   - Gowri cannot see Nathaniel's new household

## Cloud Repositories

Cloud-backed repository implementations are available:

```typescript
import { createSupabaseRepositories } from "src/infrastructure/supabase/repositories.ts";

const repos = createSupabaseRepositories(householdId);
await repos.transactions.listAll();
```

**Note:** These are foundation implementations. Sync logic will be added in the next phase.

## Current Limitations

❌ **NOT IMPLEMENTED:**
- Cross-device synchronization
- Real-time subscriptions
- Conflict resolution
- Automatic local ↔ cloud sync
- Offline-first with background sync
- Data migration from IndexedDB to cloud

✅ **IMPLEMENTED:**
- User authentication
- Household membership
- Database schema
- RLS policies
- Cloud repository interfaces
- Basic CRUD operations

## Next Steps (Sync Phase)

1. **Sync Engine:** Implement IndexedDB ↔ Supabase synchronization
2. **Conflict Resolution:** Handle concurrent edits
3. **Real-time Updates:** Subscribe to household data changes
4. **Offline Support:** Queue writes while offline
5. **Migration:** Move existing local data to cloud

## Testing Security

### Verify RLS Works

1. Create user A and user B
2. User A creates a household and transaction
3. User B tries to query user A's household in SQL Editor:

```sql
-- This should fail for user B (RLS blocks it)
SELECT * FROM transactions WHERE household_id = '[USER_A_HOUSEHOLD]';
```

4. User B can only see their own household data

### Verify No Cross-Household Access

1. Create two separate households
2. Attempt to move a transaction from one to another
3. RLS should prevent it

## Support

For issues:
- Check Supabase project logs: **Logs → Edge Functions**
- Verify RLS policies are enabled: **Database → Policies**
- Check migration files were run: **SQL Editor → Explore**
- Confirm environment variables are set: `echo $VITE_SUPABASE_URL`

## Files Reference

| File | Purpose |
|------|---------|
| `src/infrastructure/supabase/client.ts` | Supabase client initialization |
| `src/infrastructure/supabase/types.ts` | Database type definitions |
| `src/application/auth/authService.ts` | Auth operations (sign in/up/out) |
| `src/application/auth/householdService.ts` | Household management |
| `src/infrastructure/supabase/mappers.ts` | Domain ↔ database row conversion |
| `src/infrastructure/supabase/repositories.ts` | Cloud repository implementations |
| `src/ui/auth/AuthContext.tsx` | React auth state management |
| `supabase/migrations/*.sql` | Database schema and policies |
