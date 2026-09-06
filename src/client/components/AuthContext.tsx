import React, { createContext, useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import type { AuthContextValue, AuthStatus } from '../types/auth';
import type { UserProfile } from '../../shared/types';
import { AuthService } from '../services/authService';
import { ClientFirestoreService } from '../services/firestoreService';
import { isFirebaseConfigured } from '../lib/firebaseClient';

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = AuthService.onAuthStateChange(async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setStatus('authenticated');
        try {
          await ClientFirestoreService.syncUserProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          });
          const p = await ClientFirestoreService.getUserProfile(firebaseUser.uid);
          setProfile(p);
        } catch (err: any) {
          // If firestore is unavailable (e.g. preview mode), create a local profile fallback
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            photoURL: firebaseUser.photoURL || undefined,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          });
        }
      } else {
        setStatus('unauthenticated');
        setProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const getIdToken = useCallback(
    async (forceRefresh = false): Promise<string | null> => {
      return AuthService.getIdToken(user, forceRefresh);
    },
    [user]
  );

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await AuthService.signInWithGoogle();
    } catch (err: any) {
      const msg = err?.message || 'Failed to sign in with Google';
      setError(msg);
      throw err;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, pass: string) => {
    setError(null);
    try {
      await AuthService.signInWithEmail(email, pass);
    } catch (err: any) {
      const msg = err?.message || 'Failed to sign in';
      setError(msg);
      throw err;
    }
  }, []);

  const registerWithEmail = useCallback(
    async (email: string, pass: string, displayName: string) => {
      setError(null);
      try {
        await AuthService.registerWithEmail(email, pass, displayName);
      } catch (err: any) {
        const msg = err?.message || 'Failed to register';
        setError(msg);
        throw err;
      }
    },
    []
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    setError(null);
    try {
      await AuthService.sendPasswordReset(email);
    } catch (err: any) {
      const msg = err?.message || 'Failed to send password reset email';
      setError(msg);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await AuthService.signOut();
    } catch (err: any) {
      const msg = err?.message || 'Failed to sign out';
      setError(msg);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value: AuthContextValue = {
    user,
    profile,
    status,
    getIdToken,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    sendPasswordReset,
    signOut,
    error,
    clearError,
    isConfigured: isFirebaseConfigured,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
