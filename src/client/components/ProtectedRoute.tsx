import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { LoginPage } from '../pages/LoginPage';
import { ShieldCheck, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 text-stone-800 p-6">
        <div className="flex items-center gap-3 bg-white border border-stone-200 shadow-sm rounded-xl px-6 py-4">
          <Loader2 className="w-5 h-5 animate-spin text-stone-600" />
          <span className="text-sm font-medium text-stone-700">
            Verifying cryptographic identity...
          </span>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginPage />;
  }

  return <>{children}</>;
};
