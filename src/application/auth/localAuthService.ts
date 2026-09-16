/**
 * Mock authentication service for LOCAL MODE
 * 
 * When Supabase is not configured, this provides mock sessions
 * to allow local development and E2E testing with IndexedDB persistence.
 * 
 * Financial logic is identical to cloud mode - only auth differs.
 */

import type { Session, User } from "@supabase/supabase-js";

const LOCAL_AUTH_KEY = "local_auth_session";
const DEFAULT_LOCAL_EMAIL = "user@localhost";

function getMockUser(email: string): User {
  return {
    id: "local-user-" + btoa(email).substring(0, 16),
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    phone: undefined,
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "local" },
    user_metadata: { local_mode: true },
    identities: [],
    is_anonymous: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function getMockSession(email: string): Session {
  const user = getMockUser(email);
  return {
    provider_token: "local-token",
    provider_refresh_token: null,
    access_token: "local-access-token",
    refresh_token: "local-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
}

export class LocalAuthService {
  private listeners: Array<(user: User | null, session: Session | null) => void> = [];

  /**
   * Retrieve any stored local session
   */
  getCurrentSession(): { session: Session | null; user: User | null } {
    try {
      const stored = localStorage.getItem(LOCAL_AUTH_KEY);
      if (stored) {
        const { email } = JSON.parse(stored);
        return {
          user: getMockUser(email),
          session: getMockSession(email),
        };
      }
    } catch {
      // Fall through to default
    }

    // Return default local session
    return {
      user: getMockUser(DEFAULT_LOCAL_EMAIL),
      session: getMockSession(DEFAULT_LOCAL_EMAIL),
    };
  }

  /**
   * Sign in with email/password in local mode
   * Stores the session locally and notifies listeners
   */
  async signIn(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
    // In local mode, accept any non-empty credentials
    if (!email || !password) {
      return { user: null, error: "Email and password required" };
    }

    const user = getMockUser(email);
    const session = getMockSession(email);

    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify({ email }));
    this.notifyListeners(user, session);

    return { user, error: null };
  }

  /**
   * Sign up with email/password in local mode
   */
  async signUp(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
    return this.signIn(email, password);
  }

  /**
   * Sign out: clear local session
   */
  async signOut(): Promise<{ error: string | null }> {
    localStorage.removeItem(LOCAL_AUTH_KEY);
    this.notifyListeners(null, null);
    return { error: null };
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (user: User | null, session: Session | null) => void) {
    this.listeners.push(callback);
    return {
      unsubscribe: () => {
        this.listeners = this.listeners.filter((l) => l !== callback);
      },
    };
  }

  private notifyListeners(user: User | null, session: Session | null) {
    for (const listener of this.listeners) {
      listener(user, session);
    }
  }
}
