-- Migration 012: Add reviewed_at field to transactions for month-end reconciliation
-- Purpose: Add lightweight persistent reviewed state to transactions for manual reconciliation
-- Scope: Adds optional reviewed_at timestamp to all transactions
-- Safety: Non-breaking change - no existing data affected, field is nullable

-- Add reviewed_at column to transactions table
-- reviewed_at IS NULL = not reviewed (default for all existing transactions)
-- reviewed_at IS NOT NULL = reviewed (timestamp when marked as reviewed)
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL;

-- Create index for efficient filtering by review status
-- Useful for querying "unreviewed transactions" at month-end
CREATE INDEX IF NOT EXISTS idx_transactions_reviewed_at ON public.transactions (reviewed_at);

-- Notes:
-- - This field is metadata only and does NOT participate in financial calculations
-- - Existing transactions will naturally be unreviewed (reviewed_at = NULL)
-- - No backfill required - NULL represents "not reviewed"
-- - Reviewed status must be preserved during transaction edits (not auto-cleared)
-- - Soft-deleted transactions (deleted_at IS NOT NULL) remain queryable for reconciliation
-- - RLS policies remain unchanged - reviewed_at is not a security boundary
-- - This column supports future audit/reconciliation information by storing timestamp
