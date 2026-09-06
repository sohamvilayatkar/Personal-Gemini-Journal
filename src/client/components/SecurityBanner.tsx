import React from 'react';
import { isFirebaseConfigured } from '../lib/firebaseClient';
import { ShieldAlert, ShieldCheck, KeyRound, Lock } from 'lucide-react';

export const SecurityBanner: React.FC = () => {
  if (!isFirebaseConfigured) {
    return (
      <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 mb-6 shadow-2xs text-amber-900">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-amber-950">
              Firebase Client Configuration Notice
            </p>
            <p className="text-amber-800 leading-relaxed">
              Firebase client environment variables (<code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_FIREBASE_*</code>) are not yet populated. 
              These are <strong>public client identifiers</strong> (safe in frontend bundles). Privileged credentials remain strictly locked on the server backend.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 mb-6 flex items-center justify-between text-xs text-stone-600">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          <strong>Security Boundary Active:</strong> All Gemini calls proxied via server. Direct Firestore access gated by <code className="font-mono bg-stone-100 px-1 py-0.5 rounded text-stone-700">request.auth.uid == uid</code>.
        </span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-stone-500 font-mono">
        <Lock className="w-3 h-3 text-stone-400" />
        <span>Least Privilege</span>
      </div>
    </div>
  );
};
