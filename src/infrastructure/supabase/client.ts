import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types.ts";
import { isCloudMode, getSupabaseConfig } from "../config.ts";

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null;

if (isCloudMode()) {
  const config = getSupabaseConfig();
  supabaseClient = createClient<Database>(config.url, config.key);
} else {
  // LOCAL MODE: Create a dummy client for local development/testing
  // The client will be created but all auth/data operations will be handled locally
  // This allows the application to work offline with IndexedDB
  const dummyUrl = "http://localhost:54321";
  const dummyKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MjAwMDAwMDAsImV4cCI6MTk5OTk5OTk5OX0.MOCK_LOCAL_KEY";
  supabaseClient = createClient<Database>(dummyUrl, dummyKey);
}

export const supabase = supabaseClient;
