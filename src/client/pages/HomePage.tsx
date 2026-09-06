import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AuthButton } from '../components/AuthButton';
import { SecurityBanner } from '../components/SecurityBanner';
import { ClientFirestoreService } from '../services/firestoreService';
import type { JournalEntry } from '../../shared/types';
import {
  ShieldCheck,
  Plus,
  Trash2,
  Server,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Sparkles,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { user, profile, getIdToken } = useAuth();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loadingJournals, setLoadingJournals] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiHealthStatus, setApiHealthStatus] = useState<string | null>(null);
  const [testedAuthApi, setTestedAuthApi] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch journals using client Firestore SDK
  const loadJournals = async () => {
    if (!user) return;
    setLoadingJournals(true);
    setErrorMsg(null);
    try {
      const items = await ClientFirestoreService.listJournals(user.uid);
      setJournals(items);
    } catch (err: any) {
      console.error('Failed to load journals:', err);
      setErrorMsg(err?.message || 'Could not load journals from Firestore');
    } finally {
      setLoadingJournals(false);
    }
  };

  useEffect(() => {
    loadJournals();
  }, [user]);

  // Test public backend health endpoint
  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setApiHealthStatus(`Server OK (v${data.version || '1.0'})`);
    } catch {
      setApiHealthStatus('Backend unreachable or starting...');
    }
  };

  // Test authenticated backend endpoint
  const testAuthenticatedEndpoint = async () => {
    if (!user) return;
    try {
      const token = await getIdToken();
      if (!token) {
        setTestedAuthApi('Error: No active token');
        return;
      }

      const res = await fetch('/api/auth/verify', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setTestedAuthApi(`Verified by Firebase Admin SDK! Auth UID: ${data.uid}`);
      } else {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setTestedAuthApi(`Rejected: ${err.error || res.statusText}`);
      }
    } catch (err: any) {
      setTestedAuthApi(`Network error: ${err.message}`);
    }
  };

  const handleCreateJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim() || !newContent.trim()) return;

    setIsSubmitting(true);
    try {
      await ClientFirestoreService.createJournal(user.uid, {
        sourceConversationId: 'diagnostic-test',
        title: newTitle.trim(),
        summary: newContent.trim(),
        keyThoughts: ['initial reflection'],
        mood: 'reflective',
        emotions: ['calm'],
        insights: ['foundation test'],
        actionItems: [],
        goals: [],
        tags: ['foundation-test'],
        aiGenerated: false,
        generationVersion: '1.0.0',
        updatedBy: 'user',
      });
      setNewTitle('');
      setNewContent('');
      await loadJournals();
    } catch (err: any) {
      setErrorMsg(`Firestore Write Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteJournal = async (id: string) => {
    if (!user) return;
    try {
      await ClientFirestoreService.deleteJournal(user.uid, id);
      setJournals((prev) => prev.filter((j) => j.id !== id));
    } catch (err: any) {
      setErrorMsg(`Firestore Delete Error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col justify-between">
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur-xs sticky top-0 z-10 px-6 py-3.5 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              J
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-stone-900">Personal Gemini Journal</h1>
              <p className="text-[11px] text-stone-500 font-mono">Phase 1 Security Foundation</p>
            </div>
          </div>
          <AuthButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 flex-1 w-full space-y-6">
        <SecurityBanner />

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold text-red-900">Operation Error</p>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Security & Cryptographic Identity Badge */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="text-sm font-semibold text-stone-900">Verified Cryptographic Identity</h2>
                <p className="text-xs text-stone-500">Firebase Authentication Session</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-stone-100 border border-stone-200 text-stone-700">
                UID: {user?.uid}
              </span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-700 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-stone-500" />
                  Direct Firestore Path
                </span>
                <span className="text-[10px] text-emerald-700 font-mono bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  Rules Guarded
                </span>
              </div>
              <p className="font-mono text-[11px] text-stone-600 truncate">
                /users/{user?.uid}/journals
              </p>
              <p className="text-[11px] text-stone-500">
                Direct client CRUD permitted exclusively when <code className="font-mono text-stone-700">request.auth.uid == uid</code>.
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-700 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-stone-500" />
                  Express Security Proxy
                </span>
                <span className="text-[10px] text-emerald-700 font-mono bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  JWT Verified
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={checkHealth}
                  className="px-2 py-1 text-[11px] font-medium bg-white hover:bg-stone-50 border border-stone-200 rounded cursor-pointer transition-colors"
                >
                  Ping /api/health
                </button>
                <button
                  type="button"
                  onClick={testAuthenticatedEndpoint}
                  className="px-2 py-1 text-[11px] font-medium bg-stone-900 hover:bg-stone-800 text-white rounded cursor-pointer transition-colors"
                >
                  Verify JWT on Backend
                </button>
              </div>
              {(apiHealthStatus || testedAuthApi) && (
                <div className="text-[11px] font-mono text-stone-600 bg-white p-1.5 rounded border border-stone-200 space-y-0.5">
                  {apiHealthStatus && <p>Health: {apiHealthStatus}</p>}
                  {testedAuthApi && <p>Auth: {testedAuthApi}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Foundation Data Flow Validation (Direct Firestore Test) */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* New Entry Form */}
          <div className="md:col-span-1 bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Write Test Entry
            </h3>
            <form onSubmit={handleCreateJournal} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-stone-600 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Morning reflection"
                  required
                  className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 bg-stone-50/50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-stone-600 mb-1">
                  Content
                </label>
                <textarea
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Testing user-isolated Firestore writes..."
                  required
                  className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 bg-stone-50/50 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg py-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Save to Firestore</span>
              </button>
            </form>
          </div>

          {/* User Isolated Entries List */}
          <div className="md:col-span-2 bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
                User Isolated Journals ({journals.length})
              </h3>
              <button
                type="button"
                onClick={loadJournals}
                disabled={loadingJournals}
                className="text-[11px] font-medium text-stone-600 hover:text-stone-900 cursor-pointer"
              >
                {loadingJournals ? 'Refreshing...' : 'Refresh List'}
              </button>
            </div>

            {loadingJournals ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-stone-500">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                <span>Reading from /users/{user?.uid}/journals...</span>
              </div>
            ) : journals.length === 0 ? (
              <div className="py-12 text-center text-xs text-stone-500 space-y-1">
                <p className="font-medium text-stone-700">No journals stored yet</p>
                <p>Create a test entry on the left to verify Firestore client writes.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                {journals.map((j) => (
                  <div
                    key={j.id}
                    className="p-4 rounded-xl border border-stone-200 bg-stone-50/40 hover:bg-stone-50 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-stone-900">{j.title}</h4>
                        <span className="text-[10px] text-stone-500 font-mono">
                          {new Date(j.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteJournal(j.id)}
                        title="Delete journal entry"
                        className="p-1 text-stone-400 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">
                      {j.summary}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white px-6 py-4 text-center text-xs text-stone-500">
        Personal Gemini Journal • Phase 1 Project Foundation
      </footer>
    </div>
  );
};
