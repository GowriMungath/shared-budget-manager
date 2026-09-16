/**
 * Application Configuration
 * 
 * VITE_APP_MODE controls whether the app runs in LOCAL or CLOUD mode.
 * 
 * LOCAL MODE:
 * - Uses mock authentication with IndexedDB persistence
 * - Useful for development and E2E testing without a live Supabase backend
 * - Financial logic works identically to CLOUD MODE
 * - No Supabase credentials required
 * - Set: VITE_APP_MODE=local
 * 
 * CLOUD MODE:
 * - Requires real Supabase project with configured auth
 * - Both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be present
 * - Throws error if either credential is missing (prevents accidental local fallback)
 * - Set: VITE_APP_MODE=cloud
 * 
 * Note: VITE_APP_MODE is REQUIRED and must be explicitly set.
 * Do not infer mode from whether env vars happen to exist.
 */

export type AppMode = "local" | "cloud";

export function getAppMode(): AppMode {
  const mode = import.meta.env.VITE_APP_MODE as string | undefined;
  
  if (mode !== "local" && mode !== "cloud") {
    throw new Error(
      "VITE_APP_MODE must be set to either 'local' or 'cloud'. " +
      `Got: ${mode || "(not set)"}`
    );
  }
  
  return mode;
}

export function isLocalMode(): boolean {
  return getAppMode() === "local";
}

export function isCloudMode(): boolean {
  return getAppMode() === "cloud";
}

export function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  if (isCloudMode()) {
    if (!url || !key) {
      throw new Error(
        "CLOUD MODE requires both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. " +
        `Missing: ${!url ? "VITE_SUPABASE_URL" : ""} ${!key ? "VITE_SUPABASE_PUBLISHABLE_KEY" : ""}`.trim()
      );
    }
  }
  
  return {
    url: url || "",
    key: key || "",
  };
}

/**
 * Deprecated: Use isLocalMode() or isCloudMode() instead.
 * This function is kept for backward compatibility but should not be used.
 */
export function isSupabaseConfigured(): boolean {
  return isCloudMode();
}
