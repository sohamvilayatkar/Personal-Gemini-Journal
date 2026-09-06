import React, { useState } from 'react';
import type { JournalEntry, UpdateJournalRequest } from '../../shared/types';
import { useAuth } from '../hooks/useAuth';
import { JournalClientService } from '../services/journalClientService';
import { ClientFirestoreService } from '../services/firestoreService';
import {
  X,
  Sparkles,
  User,
  Calendar,
  Save,
  Trash2,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Plus,
  Minus,
  Tag as TagIcon,
  Lightbulb,
  CheckSquare,
  Target,
  Heart,
  Edit3,
} from 'lucide-react';

interface JournalDetailViewProps {
  journal: JournalEntry;
  onClose: () => void;
  onUpdated: (updated: JournalEntry) => void;
  onDeleted: (journalId: string) => void;
  onJumpToConversation?: (conversationId: string) => void;
}

export const JournalDetailView: React.FC<JournalDetailViewProps> = ({
  journal,
  onClose,
  onUpdated,
  onDeleted,
  onJumpToConversation,
}) => {
  const { user, getIdToken } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state for editing
  const [title, setTitle] = useState(journal.title);
  const [summary, setSummary] = useState(journal.summary);
  const [mood, setMood] = useState(journal.mood);
  const [keyThoughts, setKeyThoughts] = useState<string[]>(journal.keyThoughts || []);
  const [emotions, setEmotions] = useState<string[]>(journal.emotions || []);
  const [insights, setInsights] = useState<string[]>(journal.insights || []);
  const [actionItems, setActionItems] = useState<string[]>(journal.actionItems || []);
  const [goals, setGoals] = useState<string[]>(journal.goals || []);
  const [tags, setTags] = useState<string[]>(journal.tags || []);

  // Helpers to add/remove items in array fields
  const handleAddItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    items: string[],
    defaultValue = ''
  ) => {
    if (items.length >= 8) return;
    setter([...items, defaultValue]);
  };

  const handleUpdateItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    items: string[],
    index: number,
    value: string
  ) => {
    const updated = [...items];
    updated[index] = value;
    setter(updated);
  };

  const handleRemoveItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    items: string[],
    index: number
  ) => {
    setter(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const token = await getIdToken();
      const payload: UpdateJournalRequest = {
        title: title.trim(),
        summary: summary.trim(),
        mood: mood.trim(),
        keyThoughts: keyThoughts.map((t) => t.trim()).filter(Boolean),
        emotions: emotions.map((e) => e.trim()).filter(Boolean),
        insights: insights.map((i) => i.trim()).filter(Boolean),
        actionItems: actionItems.map((a) => a.trim()).filter(Boolean),
        goals: goals.map((g) => g.trim()).filter(Boolean),
        tags: tags.map((t) => t.trim()).filter(Boolean),
      };

      const updated = await JournalClientService.updateJournal(token || undefined, journal.id, payload);
      // Directly persist updates to Firestore
      try {
        await ClientFirestoreService.updateJournal(user.uid, journal.id, payload);
      } catch (fsErr) {
        console.warn('Could not mirror update to Firestore:', fsErr);
      }
      onUpdated(updated);
      setIsEditing(false);
      setSuccessMessage('Changes saved with user provenance.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!user || !journal.sourceConversationId) return;
    if (!window.confirm('Regenerate this journal entry from the original conversation? This will update the summary with a new version number.')) {
      return;
    }

    setIsRegenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const token = await getIdToken();
      const res = await JournalClientService.generateJournal(
        token || undefined,
        journal.sourceConversationId,
        true
      );
      try {
        await ClientFirestoreService.saveJournal(user.uid, res.journal);
      } catch (fsErr) {
        console.warn('Could not mirror regenerated journal to Firestore:', fsErr);
      }
      onUpdated(res.journal);
      setTitle(res.journal.title);
      setSummary(res.journal.summary);
      setMood(res.journal.mood);
      setKeyThoughts(res.journal.keyThoughts || []);
      setEmotions(res.journal.emotions || []);
      setInsights(res.journal.insights || []);
      setActionItems(res.journal.actionItems || []);
      setGoals(res.journal.goals || []);
      setTags(res.journal.tags || []);
      setSuccessMessage(`Journal entry regenerated to ${res.journal.generationVersion}.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to regenerate journal entry.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to delete this journal entry? This cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const token = await getIdToken();
      try {
        await ClientFirestoreService.deleteJournal(user.uid, journal.id);
      } catch (fsErr) {
        console.warn('Could not delete directly from Firestore:', fsErr);
      }
      await JournalClientService.deleteJournal(token || undefined, journal.id);
      onDeleted(journal.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete journal entry.');
      setIsDeleting(false);
    }
  };

  const formattedCreated = new Date(journal.createdAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });

  return (
    <div
      id={`journal-detail-modal-${journal.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200/80 flex items-center justify-between gap-3 bg-stone-50/70">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {journal.updatedBy === 'user' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200">
                <User className="w-3 h-3" />
                User Edited
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono bg-purple-50 text-purple-700 border border-purple-200">
                <Sparkles className="w-3 h-3" />
                AI Generated
              </span>
            )}
            <span className="text-xs text-stone-400 font-mono">
              v{journal.generationVersion}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                id="edit-journal-button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg cursor-pointer transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  // Reset form to current journal state
                  setTitle(journal.title);
                  setSummary(journal.summary);
                  setMood(journal.mood);
                  setKeyThoughts(journal.keyThoughts || []);
                  setEmotions(journal.emotions || []);
                  setInsights(journal.insights || []);
                  setActionItems(journal.actionItems || []);
                  setGoals(journal.goals || []);
                  setTags(journal.tags || []);
                }}
                className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-800 bg-white border border-stone-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {errorMessage && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Title Area */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">
              Title
            </label>
            {isEditing ? (
              <input
                type="text"
                id="edit-journal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                className="w-full px-3 py-2 text-base font-semibold text-stone-900 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-stone-400"
              />
            ) : (
              <h2 className="text-xl font-bold text-stone-900 leading-snug">
                {journal.title}
              </h2>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-stone-400">
              <span className="flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5" />
                {formattedCreated}
              </span>
              {journal.sourceConversationId && onJumpToConversation && (
                <button
                  type="button"
                  onClick={() => onJumpToConversation(journal.sourceConversationId)}
                  className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-900 font-medium hover:underline cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  View Original Reflection
                </button>
              )}
            </div>
          </div>

          {/* Mood & Emotions */}
          <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-amber-600" />
                  Predominant Mood
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                    maxLength={50}
                    className="w-full px-2.5 py-1 text-xs border border-stone-300 rounded-md bg-white"
                  />
                ) : (
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-200">
                    {journal.mood}
                  </span>
                )}
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
                  Felt Emotions
                </span>
                {isEditing ? (
                  <div className="space-y-1.5">
                    {emotions.map((emotion, idx) => (
                      <div key={`edit-emotion-${idx}`} className="flex items-center gap-1">
                        <input
                          type="text"
                          value={emotion}
                          onChange={(e) => handleUpdateItem(setEmotions, emotions, idx, e.target.value)}
                          maxLength={50}
                          className="flex-1 px-2 py-0.5 text-xs border border-stone-300 rounded-md bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(setEmotions, emotions, idx)}
                          className="p-1 text-stone-400 hover:text-red-600"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {emotions.length < 8 && (
                      <button
                        type="button"
                        onClick={() => handleAddItem(setEmotions, emotions, 'new emotion')}
                        className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900"
                      >
                        <Plus className="w-3 h-3" /> Add emotion
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {journal.emotions && journal.emotions.length > 0 ? (
                      journal.emotions.map((em, idx) => (
                        <span
                          key={`em-${idx}`}
                          className="px-2 py-0.5 rounded text-xs bg-white text-stone-700 border border-stone-200"
                        >
                          {em}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-stone-400">None noted</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
              Reflective Summary
            </label>
            {isEditing ? (
              <textarea
                id="edit-journal-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={5}
                maxLength={2000}
                className="w-full px-3 py-2 text-xs text-stone-800 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-stone-400 leading-relaxed"
              />
            ) : (
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50/50 p-3.5 rounded-xl border border-stone-100">
                {journal.summary}
              </p>
            )}
          </div>

          {/* Key Thoughts */}
          <div>
            <span className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              Key Thoughts & Realizations
            </span>
            {isEditing ? (
              <div className="space-y-1.5">
                {keyThoughts.map((thought, idx) => (
                  <div key={`thought-${idx}`} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={thought}
                      onChange={(e) => handleUpdateItem(setKeyThoughts, keyThoughts, idx, e.target.value)}
                      maxLength={200}
                      className="flex-1 px-2.5 py-1 text-xs border border-stone-300 rounded-md bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(setKeyThoughts, keyThoughts, idx)}
                      className="p-1 text-stone-400 hover:text-red-600"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {keyThoughts.length < 8 && (
                  <button
                    type="button"
                    onClick={() => handleAddItem(setKeyThoughts, keyThoughts, '')}
                    className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900 mt-1"
                  >
                    <Plus className="w-3 h-3" /> Add key thought
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {journal.keyThoughts && journal.keyThoughts.length > 0 ? (
                  journal.keyThoughts.map((thought, idx) => (
                    <li key={`thought-view-${idx}`} className="text-xs text-stone-700 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-400 mt-1.5 shrink-0" />
                      <span>{thought}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-stone-400">None captured</li>
                )}
              </ul>
            )}
          </div>

          {/* Insights */}
          <div>
            <span className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              Personal Insights
            </span>
            {isEditing ? (
              <div className="space-y-1.5">
                {insights.map((insight, idx) => (
                  <div key={`insight-${idx}`} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={insight}
                      onChange={(e) => handleUpdateItem(setInsights, insights, idx, e.target.value)}
                      maxLength={200}
                      className="flex-1 px-2.5 py-1 text-xs border border-stone-300 rounded-md bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(setInsights, insights, idx)}
                      className="p-1 text-stone-400 hover:text-red-600"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {insights.length < 8 && (
                  <button
                    type="button"
                    onClick={() => handleAddItem(setInsights, insights, '')}
                    className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900 mt-1"
                  >
                    <Plus className="w-3 h-3" /> Add insight
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {journal.insights && journal.insights.length > 0 ? (
                  journal.insights.map((insight, idx) => (
                    <li key={`insight-view-${idx}`} className="text-xs text-stone-700 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                      <span>{insight}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-stone-400">None captured</li>
                )}
              </ul>
            )}
          </div>

          {/* Action Items & Goals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                Action Items
              </span>
              {isEditing ? (
                <div className="space-y-1.5">
                  {actionItems.map((item, idx) => (
                    <div key={`action-${idx}`} className="flex items-center gap-1">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => handleUpdateItem(setActionItems, actionItems, idx, e.target.value)}
                        maxLength={200}
                        className="flex-1 px-2.5 py-1 text-xs border border-stone-300 rounded-md bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(setActionItems, actionItems, idx)}
                        className="p-1 text-stone-400 hover:text-red-600"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {actionItems.length < 8 && (
                    <button
                      type="button"
                      onClick={() => handleAddItem(setActionItems, actionItems, '')}
                      className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900"
                    >
                      <Plus className="w-3 h-3" /> Add item
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-1">
                  {journal.actionItems && journal.actionItems.length > 0 ? (
                    journal.actionItems.map((item, idx) => (
                      <li key={`action-item-${idx}`} className="text-xs text-stone-700 flex items-start gap-1.5">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span>{item}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-stone-400">None noted</li>
                  )}
                </ul>
              )}
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-blue-600" />
                Aspirational Goals
              </span>
              {isEditing ? (
                <div className="space-y-1.5">
                  {goals.map((goal, idx) => (
                    <div key={`goal-${idx}`} className="flex items-center gap-1">
                      <input
                        type="text"
                        value={goal}
                        onChange={(e) => handleUpdateItem(setGoals, goals, idx, e.target.value)}
                        maxLength={200}
                        className="flex-1 px-2.5 py-1 text-xs border border-stone-300 rounded-md bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(setGoals, goals, idx)}
                        className="p-1 text-stone-400 hover:text-red-600"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {goals.length < 8 && (
                    <button
                      type="button"
                      onClick={() => handleAddItem(setGoals, goals, '')}
                      className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900"
                    >
                      <Plus className="w-3 h-3" /> Add goal
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-1">
                  {journal.goals && journal.goals.length > 0 ? (
                    journal.goals.map((goal, idx) => (
                      <li key={`goal-view-${idx}`} className="text-xs text-stone-700 flex items-start gap-1.5">
                        <span className="text-blue-500 font-bold">•</span>
                        <span>{goal}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-stone-400">None noted</li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Tags */}
          <div>
            <span className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <TagIcon className="w-3.5 h-3.5 text-stone-400" />
              Tags
            </span>
            {isEditing ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag, idx) => (
                    <div key={`tag-edit-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-stone-100 rounded-md">
                      <input
                        type="text"
                        value={tag}
                        onChange={(e) => handleUpdateItem(setTags, tags, idx, e.target.value)}
                        maxLength={30}
                        className="w-20 bg-transparent border-none focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(setTags, tags, idx)}
                        className="text-stone-400 hover:text-red-600"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {tags.length < 10 && (
                  <button
                    type="button"
                    onClick={() => handleAddItem(setTags, tags, 'tag')}
                    className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900"
                  >
                    <Plus className="w-3 h-3" /> Add tag
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {journal.tags && journal.tags.length > 0 ? (
                  journal.tags.map((tag, idx) => (
                    <span
                      key={`tag-${idx}`}
                      className="px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-600 rounded-md border border-stone-200"
                    >
                      #{tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-stone-400">No tags</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-stone-200 bg-stone-50/70 flex items-center justify-between gap-3">
          <button
            type="button"
            id="delete-journal-button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 hover:text-red-800 hover:bg-red-50 border border-red-200 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
          </button>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                type="button"
                id="regenerate-journal-button"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span>{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
              </button>
            )}

            {isEditing && (
              <button
                type="button"
                id="save-journal-edits-button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg cursor-pointer transition-colors disabled:opacity-50 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
