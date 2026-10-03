-- Migration 010: Add participant archival support
-- Purpose: Enable soft-delete for external participants while preserving historical references
-- Rationale: External people can be archived (hidden from new transaction/settlement creation)
--           but historical transactions and settlements must continue displaying their names
-- Safety: Soft-delete only - existing data preserved, queries must filter by archived_at IS NULL

-- Step 1: Add archived_at column as NULLABLE (existing participants are active)
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Step 2: Add index for efficient filtering (list active participants only)
CREATE INDEX IF NOT EXISTS idx_participants_household_archived
ON public.participants(household_id, archived_at);

-- Step 3: Add index for timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_participants_archived_at
ON public.participants(archived_at);

-- Status: Idempotent - safe for retry
-- Application must filter: archived_at IS NULL for active participants
-- Archived participants remain in database for historical rendering
