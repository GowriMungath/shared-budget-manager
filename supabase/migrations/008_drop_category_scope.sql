-- Migration 008: Drop scope column from categories
-- Purpose: Remove obsolete category.scope after successful code deployment
-- IMPORTANT: Only run AFTER code has been deployed and verified to use transaction.scope
-- Timeline: This is a POST-DEPLOY migration, executed after all services are running new code

-- Drop scope from categories
ALTER TABLE public.categories
DROP COLUMN scope CASCADE;

-- Notes:
-- - CASCADE will drop any constraints/indexes that depend on scope
-- - Review RLS policies for any category.scope references before executing
-- - No policy changes should be needed if RLS only filters by household_id
-- - If RLS policies reference category.scope, they must be updated before this migration

-- Timestamp: Generated for Cycle 2 implementation
-- Status: Ready for execution on production AFTER code deployment and verification
-- Prerequisite: Migration 004, 005, 006, 007 must be successfully executed first
-- Timeline: Execute this migration 24-48 hours after production code deployment
