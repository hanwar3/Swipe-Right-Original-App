import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import backend from '~backend/client';
import type { User } from '~backend/auth/register';
import {
  clearSessionToken,
  getSessionToken,
  onSessionEnded,
  setSessionToken,
} from '../lib/session';
import { deleteAccount as deleteAccountCall, logoutEverywhere as logoutEverywhereCall } from '../lib/engine';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => void;
  /** Signs this account out on every device, this one included. */
  logoutEverywhere: () => Promise<void>;
  /** Deletes the account and everything stored for it. */
  deleteAccount: (password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function messageOf(error: unknown, fallback: string): string {
  const m = (error as { message?: unknown })?.message;
  return typeof m === 'string' && m ? m : fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Signing out, or switching accounts, must never leave the last person's
  // cards and offers in the query cache.
  const signOutLocally = useCallback(() => {
    clearSessionToken();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    backend.auth
      .verifyToken({ token })
      .then((res) => {
        // Sliding session: the backend hands back a fresh token once a day.
        if (res.token) setSessionToken(res.token);
        setUser(res.user);
      })
      .catch(() => signOutLocally())
      .finally(() => setIsLoading(false));
  }, [signOutLocally]);

  // Any request answered 401 (revoked or expired) signs the UI out.
  useEffect(() => onSessionEnded(() => {
    setUser(null);
    queryClient.clear();
  }), [queryClient]);

  const login = async (email: string, password: string) => {
    try {
      const response = await backend.auth.login({ email, password });
      queryClient.clear();
      setSessionToken(response.token);
      setUser(response.user);
    } catch (error) {
      throw new Error(messageOf(error, 'Sign in failed'));
    }
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    try {
      const response = await backend.auth.register({ email, password, firstName, lastName });
      queryClient.clear();
      setSessionToken(response.token);
      setUser(response.user);
    } catch (error) {
      throw new Error(messageOf(error, 'Could not create the account'));
    }
  };

  const logout = () => signOutLocally();

  const logoutEverywhere = async () => {
    try {
      await logoutEverywhereCall();
    } finally {
      signOutLocally();
    }
  };

  const deleteAccount = async (password: string) => {
    try {
      await deleteAccountCall(password);
    } catch (error) {
      throw new Error(messageOf(error, 'Could not delete the account'));
    }
    signOutLocally();
  };

  const forgotPassword = async (email: string) => {
    try {
      await backend.auth.forgotPassword({ email });
    } catch (error) {
      throw new Error(messageOf(error, 'Failed to send reset email'));
    }
  };

  const resetPassword = async (token: string, newPassword: string) => {
    try {
      await backend.auth.resetPassword({ token, newPassword });
    } catch (error) {
      throw new Error(messageOf(error, 'Failed to reset password'));
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    register,
    logout,
    logoutEverywhere,
    deleteAccount,
    forgotPassword,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
