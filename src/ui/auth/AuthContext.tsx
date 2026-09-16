import React, { createContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { authService } from "../../application/auth/authService.ts";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check current session on mount
    authService.getCurrentSession().then(({ session: currentSession, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError);
      } else {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const subscription = authService.onAuthStateChange((currentUser, currentSession) => {
      setUser(currentUser);
      setSession(currentSession);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    setError(null);
    const result = await authService.signIn(email, password);
    if (result.error) {
      setError(result.error);
    }
    return { error: result.error };
  };

  const handleSignUp = async (email: string, password: string) => {
    setError(null);
    const result = await authService.signUp(email, password);
    if (result.error) {
      setError(result.error);
    }
    return { error: result.error };
  };

  const handleSignOut = async () => {
    setError(null);
    const result = await authService.signOut();
    if (result.error) {
      setError(result.error);
    }
    return { error: result.error };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        error,
        signIn: handleSignIn,
        signUp: handleSignUp,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
