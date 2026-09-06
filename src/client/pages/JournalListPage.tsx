import React, { useState, useEffect, useMemo } from 'react';
import type { JournalEntry } from '../../shared/types';
import { useAuth } from '../hooks/useAuth';
import { JournalClientService } from '../services/journalClientService';
import { ClientFirestoreService } from '../services/firestoreService';
import { JournalCard } from '../components/JournalCard';
import { JournalDetailView } from '../components/JournalDetailView';
import {
  BookOpen,
  Search,
  Sparkles,
  RefreshCw,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';

interface JournalListPageProps {
  onNavigateToChat: (conversationId?: string) => void;
}

export const JournalListPage: React.FC<JournalListPageProps> = ({ onNavigateToChat }) => {
  const { user, getIdToken } = useAuth();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMood, setSelectedMood] = useState<string>('all');
  const [activeJournal, setActiveJournal] = useState<JournalEntry | null>(null);

  const fetchJournals = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Primary: load directly from Cloud Firestore (Single Source of Truth)
      const directList = await ClientFirestoreService.listJournals(user.uid);
      setJournals(directList || []);
    } catch (fsErr: any) {
      console.warn('Could not read journals directly from Firestore, checking backend fallback:', fsErr);
      try {
        const token = await getIdToken();
        const list = await JournalClientService.listJournals(token || undefined);
        if (list && list.length > 0) {
          setJournals(list);
        } else {
          setError(fsErr?.message || 'Failed to retrieve journal entries from Firestore.');
        }
      } catch (err: any) {
        setError(fsErr?.message || err?.message || 'Failed to retrieve journal entries.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJournals();
  }, [user]);

  // Extract distinct moods for filtering
  const distinctMoods = useMemo(() => {
    const moods = new Set<string>();
    for (const j of journals) {
      if (j.mood) moods.add(j.mood.toLowerCase());
    }
    return Array.from(moods);
  }, [journals]);

  // Filtered list
  const filteredJournals = useMemo(() => {
    return journals.filter((j) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        j.title.toLowerCase().includes(q) ||
        j.summary.toLowerCase().includes(q) ||
        j.tags?.some((t) => t.toLowerCase().includes(q));

      const matchesMood =
        selectedMood === 'all' ||
        (j.mood && j.mood.toLowerCase() === selectedMood.toLowerCase());

      return matchesSearch && matchesMood;
    });
  }, [journals, searchQuery, selectedMood]);

  const handleUpdatedJournal = (updated: JournalEntry) => {
    setJournals((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    setActiveJournal(updated);
  };

  const handleDeletedJournal = (deletedId: string) => {
    setJournals((prev) => prev.filter((j) => j.id !== deletedId));
    setActiveJournal(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-stone-50 overflow-y-auto">
      {/* Top Header */}
      <div className="px-6 py-4 bg-white border-b border-stone-200/90 flex items-center justify-between gap-4 sticky top-0 z-10">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-stone-700" />
            Personal Journal Entries
          </h1>
          <p className="text-xs text-stone-500 hidden sm:block">
            Synthesized reflections and AI memory distilled securely from your conversations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchJournals}
            title="Refresh entries"
            disabled={loading}
            className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg border border-stone-200 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => onNavigateToChat()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg cursor-pointer transition-colors shadow-2xs"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>New Reflection</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6 py-3 bg-stone-100/60 border-b border-stone-200/60 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by title, keywords, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-stone-400 placeholder:text-stone-400"
          />
        </div>

        {distinctMoods.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 sm:pb-0">
            <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider shrink-0 mr-1">
              Mood:
            </span>
            <button
              type="button"
              onClick={() => setSelectedMood('all')}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                selectedMood === 'all'
                  ? 'bg-stone-800 text-white'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              All
            </button>
            {distinctMoods.map((mood) => (
              <button
                key={mood}
                type="button"
                onClick={() => setSelectedMood(mood)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer shrink-0 capitalize ${
                  selectedMood === mood
                    ? 'bg-stone-800 text-white'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {mood}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-xs text-stone-400">
            <Sparkles className="w-6 h-6 animate-spin text-stone-400" />
            <span>Retrieving your encrypted personal journal entries...</span>
          </div>
        ) : filteredJournals.length === 0 ? (
          <div className="py-20 max-w-md mx-auto text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-400 mb-3 border border-stone-200">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-stone-900 mb-1">
              {searchQuery || selectedMood !== 'all'
                ? 'No matching journal entries'
                : 'No journal entries yet'}
            </h3>
            <p className="text-xs text-stone-500 mb-4 max-w-xs">
              {searchQuery || selectedMood !== 'all'
                ? 'Try clearing your search query or mood filter to see other entries.'
                : 'Complete a chat reflection with Gemini, then click "Generate Journal" to distill it into a personal entry.'}
            </p>
            <button
              type="button"
              onClick={() => onNavigateToChat()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-stone-900 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer shadow-2xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Start a reflection chat</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredJournals.map((journal) => (
              <JournalCard
                key={journal.id}
                journal={journal}
                onSelect={(selected) => setActiveJournal(selected)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {activeJournal && (
        <JournalDetailView
          journal={activeJournal}
          onClose={() => setActiveJournal(null)}
          onUpdated={handleUpdatedJournal}
          onDeleted={handleDeletedJournal}
          onJumpToConversation={(convId) => {
            setActiveJournal(null);
            onNavigateToChat(convId);
          }}
        />
      )}
    </div>
  );
};
