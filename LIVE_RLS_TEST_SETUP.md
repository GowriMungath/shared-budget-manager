# Live RLS Integration Test Setup

## Status

✅ **READY TO EXECUTE** - TypeScript harness complete and compiled with no errors.

## Files Created/Modified

- **supabase/tests/live_rls_test.ts** - Executable TypeScript harness (825 lines)
- **package.json** - Added `test:rls:live` script and `tsx` dependency
- **tsconfig.json** - Added `supabase/tests` to include paths for ESLint/TypeScript
- **.env.rls.local** - Template for test credentials (git-ignored)

## Environment Setup

Before running the test harness, create `.env.rls.local` in the workspace root with:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

RLS_GOWRI_EMAIL=gowri@example.com
RLS_GOWRI_PASSWORD=<secure_password>

RLS_NATHANIEL_EMAIL=nathaniel@example.com
RLS_NATHANIEL_PASSWORD=<secure_password>

RLS_OUTSIDER_EMAIL=outsider@example.com
RLS_OUTSIDER_PASSWORD=<secure_password>
```

**CRITICAL**: 
- `.env.rls.local` is already git-ignored (covered by `.env.*` and `*.local` patterns)
- Never print passwords, JWTs, or session tokens
- Credentials are loaded via `process.env` only
- Only the browser-safe publishable key is used

## Test Cases Implemented

The harness runs **8 security tests** against the live Supabase project:

1. **Anon cannot read financial tables** - Verify unauthenticated access is blocked
2. **Gowri creates household via RPC** - Verify SECURITY DEFINER function works, creates owner
3. **Outsider denied before membership** - Verify household isolation before onboarding
4. **Nathaniel denied before membership** - Verify no cross-user leakage
5. **Gowri adds Nathaniel as member** - Verify owner can add members with role='member' constraint
6. **Nathaniel can access after membership** - Verify RLS correctly updates on membership
7. **Outsider still denied after membership** - Verify household isolation is maintained
8. **Cross-household integrity constraints** - Verify composite FK prevents mixing IDs across households

## Assertions

Each test includes:
- **SELECT denial**: Zero rows returned OR explicit RLS error
- **INSERT denial**: FK constraint error OR RLS permission error
- **Non-fatal cleanup**: Records prefixed `RLS_TEST_` are deleted, auth accounts remain

## Running the Tests

```bash
# Compile and verify types
npm run typecheck

# Lint for code style
npm run lint

# Run live RLS tests (contacts real Supabase)
npm run test:rls:live
```

## Test Data Cleanup

The harness automatically cleans up:
- ✅ All households, participants, categories, transactions, etc. prefixed with `RLS_TEST_`
- ✅ Household memberships created during tests
- ❌ **Does NOT delete** Auth user accounts (Gowri, Nathaniel, Outsider remain for manual cleanup)

## Dependencies Added

- **tsx@^4.7.0** - TypeScript executor for Node.js (minimal, no build step needed)

## TypeScript Compliance

- ✅ No TypeScript errors or warnings
- ✅ All `any` casts are documented with justification:
  - Supabase RPC calls (untyped in Database interface)
  - Auth user data (type not preserved through SDK)
  - Supabase query builder results (array element types not preserved)
- ✅ Linting passes (ESLint configured for React/TypeScript)
- ✅ `supabase/tests/` included in tsconfig for IDE and tooling support

## Import Paths

```typescript
// Correct path from supabase/tests/live_rls_test.ts
import type { Database } from "../../src/infrastructure/supabase/types";
```

## What NOT to Do

- ❌ Do NOT run `npm run test:rls:live` until `.env.rls.local` is properly configured
- ❌ Do NOT commit `.env.rls.local` to Git (it is ignored)
- ❌ Do NOT use service_role keys (only browser-safe publishable key)
- ❌ Do NOT include `test:rls:live` in `npm test` or `npm run test:e2e` (separate command)
- ❌ Do NOT modify database migrations or apply new SQL
