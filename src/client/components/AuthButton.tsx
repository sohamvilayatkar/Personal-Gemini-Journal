import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LogIn, LogOut, Loader2, User } from 'lucide-react';

export const AuthButton: React.FC = () => {
  const { user, status, signInWithGoogle, signOut } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSignIn = async () => {
    setIsProcessing(true);
    try {
      await signInWithGoogle();
    } catch {
      // Error is set in AuthContext and rendered in banners
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOut = async () => {
    setIsProcessing(true);
    try {
      await signOut();
    } finally {
      setIsProcessing(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-stone-500 bg-stone-100 rounded-lg border border-stone-200">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Authenticating...</span>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-stone-700 bg-stone-100/80 px-3 py-1.5 rounded-lg border border-stone-200">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="w-5 h-5 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <User className="w-4 h-4 text-stone-500" />
          )}
          <span className="max-w-[140px] truncate">{user.displayName || user.email}</span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isProcessing}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-300 rounded-lg px-3 py-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <LogOut className="w-3.5 h-3.5" />
          )}
          <span>Sign Out</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={isProcessing}
      className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 border border-stone-900 rounded-lg px-4 py-2 transition-all shadow-xs hover:shadow-sm cursor-pointer disabled:opacity-50"
    >
      {isProcessing ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <LogIn className="w-3.5 h-3.5" />
      )}
      <span>Sign In with Google</span>
    </button>
  );
};
