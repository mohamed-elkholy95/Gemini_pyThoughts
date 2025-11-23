import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { authApi, type User } from '../api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshSession = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    const { data, error } = await authApi.getSession();

    if (error || !data?.user) {
      setState({ user: null, isLoading: false, isAuthenticated: false });
    } else {
      setState({ user: data.user, isLoading: false, isAuthenticated: true });
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await authApi.signIn(email, password);

    if (error || !data?.user) {
      return { success: false, error: error || 'Sign in failed' };
    }

    setState({ user: data.user, isLoading: false, isAuthenticated: true });
    return { success: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await authApi.signUp(email, password, name);

    if (error || !data?.user) {
      return { success: false, error: error || 'Sign up failed' };
    }

    setState({ user: data.user, isLoading: false, isAuthenticated: true });
    return { success: true };
  }, []);

  const signOut = useCallback(async () => {
    await authApi.signOut();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
