import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../../infrastructure/supabase/client.ts";
import { isCloudMode } from "../../infrastructure/config.ts";
import { LocalAuthService } from "./localAuthService.ts";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

/**
 * Unified auth service that uses either Supabase (cloud) or local mock (local mode)
 */
export class AuthService {
  private localAuth = new LocalAuthService();

  async signUp(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
    if (!isCloudMode()) {
      return this.localAuth.signUp(email, password);
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  }

  async signIn(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
    if (!isCloudMode()) {
      return this.localAuth.signIn(email, password);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  }

  async signOut(): Promise<{ error: string | null }> {
    if (!isCloudMode()) {
      return this.localAuth.signOut();
    }

    const { error } = await supabase.auth.signOut();
    return { error: error ? error.message : null };
  }

  async getCurrentSession(): Promise<{ session: Session | null; error: string | null }> {
    if (!isCloudMode()) {
      const { session } = this.localAuth.getCurrentSession();
      return { session, error: null };
    }

    const { data, error } = await supabase.auth.getSession();
    return { session: data.session, error: error ? error.message : null };
  }

  onAuthStateChange(callback: (user: User | null, session: Session | null) => void) {
    if (!isCloudMode()) {
      return this.localAuth.onAuthStateChange(callback);
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user ?? null, session ?? null);
    });

    return data.subscription;
  }
}

export const authService = new AuthService();
