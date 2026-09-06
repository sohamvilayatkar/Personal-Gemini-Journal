import React, { useState } from 'react';
import type { MemoryCandidate, MemoryCategory } from '../../shared/types';
import { memoryCategories } from '../../shared/schemas/memorySchema';
import {
  Sparkles,
  Check,
  Edit2,
  X,
  ShieldCheck,
  Loader2,
  Brain,
  AlertCircle,
} from 'lucide-react';

interface MemoryCandidateModalProps {
  candidates: MemoryCandidate[];
  conversationId: string;
  onClose: () => void;
  onSave: (candidate: {
    content: string;
    category: MemoryCategory;
    sourceConversationId: string;
    confidence: number;
  }) => Promise<void>;
}

export const MemoryCandidateModal: React.FC<MemoryCandidateModalProps> = ({
  candidates: initialCandidates,
  conversationId,
  onClose,
  onSave,
}) => {
  const [candidates, setCandidates] = useState<MemoryCandidate[]>(initialCandidates);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>('context');
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startEditing = (idx: number) => {
    setEditingIndex(idx);
    setEditContent(candidates[idx].content);
    setEditCategory(candidates[idx].category);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditContent('');
  };

  const handleSave = async (idx: number) => {
    const candidate = candidates[idx];
    const finalContent = editingIndex === idx ? editContent.trim() : candidate.content;
    const finalCategory = editingIndex === idx ? editCategory : candidate.category;

    if (!finalContent) {
      setErrorMessage('Memory content cannot be empty.');
      return;
    }

    setSavingIndex(idx);
    setErrorMessage(null);

    try {
      await onSave({
        content: finalContent,
        category: finalCategory,
        sourceConversationId: conversationId,
        confidence: candidate.confidence,
      });

      setSavedCount((prev) => prev + 1);
      // Remove from list once saved
      setCandidates((prev) => prev.filter((_, i) => i !== idx));
      setEditingIndex(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save memory.');
    } finally {
      setSavingIndex(null);
    }
  };

  const handleReject = (idx: number) => {
    if (editingIndex === idx) {
      setEditingIndex(null);
    }
    setCandidates((prev) => prev.filter((_, i) => i !== idx));
  };

  const getCategoryColor = (cat: MemoryCategory) => {
    switch (cat) {
      case 'goal':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'preference':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'project':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'learning':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'habit':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'principle':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'context':
      default:
        return 'bg-stone-100 text-stone-700 border-stone-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200/80 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-900">Suggested Memories</h3>
              <p className="text-xs text-stone-500">
                Gemini identified potential long-term context. You decide what is stored.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-200/50 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security & Consent Notice */}
        <div className="px-6 py-2.5 bg-amber-50/70 border-b border-amber-200/60 flex items-center gap-2 text-xs text-amber-800">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>User-Consent Guarantee:</strong> Gemini cannot save memories directly. Only items you explicitly approve below are persisted to your isolated account.
          </span>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Candidate List Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {candidates.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-stone-800">All suggestions reviewed!</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                {savedCount > 0
                  ? `You have saved ${savedCount} approved memor${savedCount === 1 ? 'y' : 'ies'} into your personal memory bank.`
                  : 'No remaining candidate memories from this session.'}
              </p>
            </div>
          ) : (
            candidates.map((candidate, idx) => {
              const isEditing = editingIndex === idx;
              const isSaving = savingIndex === idx;

              return (
                <div
                  key={idx}
                  className="border border-stone-200 rounded-xl p-4 bg-white hover:border-stone-300 transition-all shadow-xs"
                >
                  {isEditing ? (
                    /* Inline Editing Mode */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-stone-600">Category:</label>
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                          className="text-xs rounded-md border border-stone-300 px-2 py-1 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                        >
                          {memoryCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        maxLength={500}
                        rows={3}
                        className="w-full text-xs text-stone-800 border border-stone-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        placeholder="Memory content..."
                      />
                      <div className="flex items-center justify-between text-xs text-stone-400">
                        <span>{editContent.length}/500 chars</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="px-2.5 py-1 text-stone-600 hover:text-stone-900 cursor-pointer font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSave(idx)}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md cursor-pointer font-medium flex items-center gap-1"
                          >
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Standard Candidate Card */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${getCategoryColor(
                            candidate.category
                          )}`}
                        >
                          {candidate.category}
                        </span>
                        <span className="text-[11px] text-stone-400 font-mono">
                          {Math.round(candidate.confidence * 100)}% confidence
                        </span>
                      </div>

                      <blockquote className="text-sm font-medium text-stone-800 border-l-2 border-purple-300 pl-3 py-0.5 italic">
                        "{candidate.content}"
                      </blockquote>

                      <div className="text-xs text-stone-500 bg-stone-50 rounded-lg p-2.5 border border-stone-200/60">
                        <strong className="text-stone-700 font-semibold">Why this was suggested: </strong>
                        {candidate.reason}
                      </div>

                      <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
                        <button
                          type="button"
                          onClick={() => handleReject(idx)}
                          className="px-3 py-1.5 rounded-lg text-xs text-stone-600 hover:text-stone-800 hover:bg-stone-100 font-medium transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => startEditing(idx)}
                          className="px-3 py-1.5 rounded-lg text-xs text-stone-700 hover:text-stone-900 hover:bg-stone-100 font-medium transition-colors cursor-pointer flex items-center gap-1 border border-stone-200"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSave(idx)}
                          className="px-3.5 py-1.5 rounded-lg text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                        >
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-stone-200/80 bg-stone-50/70 flex items-center justify-between">
          <span className="text-xs text-stone-500">
            {candidates.length > 0
              ? `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} remaining`
              : 'All candidates reviewed'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
