import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { MemoryClientService } from '../services/memoryClientService';
import { ClientFirestoreService } from '../services/firestoreService';
import type { UserMemory, MemoryCategory, MemoryStatus } from '../../shared/types';
import { memoryCategories } from '../../shared/schemas/memorySchema';
import {
  Brain,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Check,
  X,
  Power,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Tag,
  Sparkles,
  Info,
} from 'lucide-react';

export const MemoryManager: React.FC = () => {
  const { user, getIdToken } = useAuth();
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Add memory modal/form state
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('context');
  const [savingNew, setSavingNew] = useState(false);

  // Edit memory state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>('context');
  const [savingEdit, setSavingEdit] = useState(false);

  // Action loading state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchMemories = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Primary: load directly from Cloud Firestore (Single Source of Truth)
      const directList = await ClientFirestoreService.listMemories(user.uid);
      setMemories(directList || []);
    } catch (fsErr: any) {
      console.warn('Could not read memories directly from Firestore, checking backend fallback:', fsErr);
      try {
        const token = await getIdToken();
        const list = await MemoryClientService.listMemories(token || undefined);
        if (list && list.length > 0) {
          setMemories(list);
        } else {
          setError(fsErr?.message || 'Failed to load memories from Firestore.');
        }
      } catch (err: any) {
        setError(fsErr?.message || err?.message || 'Failed to load memories.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, [user]);

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newContent.trim()) {
      setError('Memory content cannot be empty.');
      return;
    }

    setSavingNew(true);
    setError(null);
    try {
      const token = await getIdToken();
      const created = await MemoryClientService.createMemory(token || undefined, {
        content: newContent.trim(),
        category: newCategory,
        provenance: 'user',
      });
      if (user?.uid && created) {
        ClientFirestoreService.saveMemory(user.uid, created).catch(console.error);
      }
      setMemories((prev) => [created, ...prev]);
      setIsAdding(false);
      setNewContent('');
      setNewCategory('context');
    } catch (err: any) {
      setError(err.message || 'Failed to create memory.');
    } finally {
      setSavingNew(false);
    }
  };

  const handleStartEdit = (memory: UserMemory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditCategory(memory.category);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (memoryId: string) => {
    if (!user) return;
    if (!editContent.trim()) {
      setError('Memory content cannot be empty.');
      return;
    }

    setSavingEdit(true);
    setError(null);
    try {
      const token = await getIdToken();
      const updated = await MemoryClientService.updateMemory(token || undefined, memoryId, {
        content: editContent.trim(),
        category: editCategory,
      });
      setMemories((prev) => prev.map((m) => (m.id === memoryId ? updated : m)));
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update memory.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (memory: UserMemory) => {
    if (!user) return;
    setActionLoadingId(memory.id);
    setError(null);
    try {
      const token = await getIdToken();
      let updated: UserMemory;
      if (memory.status === 'active') {
        updated = await MemoryClientService.disableMemory(token || undefined, memory.id);
      } else {
        updated = await MemoryClientService.enableMemory(token || undefined, memory.id);
      }
      setMemories((prev) => prev.map((m) => (m.id === memory.id ? updated : m)));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle memory status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (memoryId: string) => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to permanently delete this memory? This cannot be undone.')) {
      return;
    }

    setActionLoadingId(memoryId);
    setError(null);
    try {
      const token = await getIdToken();
      if (user?.uid) {
        ClientFirestoreService.deleteMemory(user.uid, memoryId).catch(console.error);
      }
      await MemoryClientService.deleteMemory(token || undefined, memoryId);
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete memory.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered memories
  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      if (selectedCategory !== 'all' && m.category !== selectedCategory) {
        return false;
      }
      if (selectedStatus !== 'all' && m.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return m.content.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [memories, selectedCategory, selectedStatus, searchQuery]);

  const activeCount = memories.filter((m) => m.status === 'active').length;

  const getCategoryBadgeClass = (cat: MemoryCategory) => {
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">AI Memory Bank</h1>
          </div>
          <p className="text-sm text-stone-600 mt-1 max-w-xl">
            Review and govern the persistent knowledge Gemini uses to personalize reflective conversations.
            Only memories you explicitly approve or create are ever retained.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Memory</span>
        </button>
      </div>

      {/* Security Principles Banner */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-stone-600">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-stone-800">Privacy & Architectural Guarantees: </span>
            Memories are stored in your private Firestore collection, bounded to 20 active items per chat context, and strictly stripped of credentials. Gemini cannot write to this database directly.
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 font-medium">
          <span className="text-stone-700">
            Total: <strong className="text-stone-900 font-bold">{memories.length}</strong>
          </span>
          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Active in Context: <strong className="font-bold">{activeCount}</strong>
          </span>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add Memory Modal/Inline Panel */}
      {isAdding && (
        <form
          onSubmit={handleCreateNew}
          className="bg-white border-2 border-purple-200 rounded-2xl p-5 shadow-md space-y-4 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-600" />
              <span>Add Custom Memory</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-stone-400 hover:text-stone-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1">
              <label className="text-xs font-medium text-stone-700">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                className="w-full text-xs rounded-lg border border-stone-300 p-2 bg-white text-stone-800 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
              >
                {memoryCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <div className="flex justify-between">
                <label className="text-xs font-medium text-stone-700">Content</label>
                <span className="text-[11px] text-stone-400">{newContent.length}/500 chars</span>
              </div>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g., Prefers functional programming patterns; working on a portfolio project..."
                className="w-full text-xs rounded-lg border border-stone-300 p-2.5 text-stone-800 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-800 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingNew || !newContent.trim()}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {savingNew ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Save Memory</span>
            </button>
          </div>
        </form>
      )}

      {/* Controls Bar: Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs rounded-lg border border-stone-200 py-1.5 px-2.5 bg-stone-50 text-stone-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
          >
            <option value="all">All Categories</option>
            {memoryCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs rounded-lg border border-stone-200 py-1.5 px-2.5 bg-stone-50 text-stone-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="disabled">Disabled Only</option>
          </select>
        </div>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="py-16 text-center text-stone-500 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600" />
          <p className="text-xs">Loading memory bank...</p>
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl py-16 text-center space-y-3 shadow-2xs">
          <Brain className="w-10 h-10 text-stone-300 mx-auto" />
          <h3 className="text-sm font-semibold text-stone-800">No memories found</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            {memories.length === 0
              ? 'Your memory bank is currently empty. Use the chat reflection flow to generate candidate suggestions or click "Add Memory" above.'
              : 'No memories match your current search or category filters.'}
          </p>
          {memories.length === 0 && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create your first memory</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((memory) => {
            const isEditing = editingId === memory.id;
            const isActionLoading = actionLoadingId === memory.id;
            const isActive = memory.status === 'active';

            return (
              <div
                key={memory.id}
                className={`border rounded-xl p-4 bg-white transition-all flex flex-col justify-between ${
                  isActive
                    ? 'border-stone-200 shadow-2xs hover:border-stone-300'
                    : 'border-stone-200/60 bg-stone-50/50 opacity-70'
                }`}
              >
                {isEditing ? (
                  /* Edit Mode */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                        className="text-xs rounded-md border border-stone-300 px-2 py-1 bg-white text-stone-800 cursor-pointer"
                      >
                        {memoryCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] text-stone-400">{editContent.length}/500 chars</span>
                    </div>

                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      maxLength={500}
                      rows={3}
                      className="w-full text-xs rounded-lg border border-stone-300 p-2 text-stone-800 focus:ring-1 focus:ring-purple-500"
                    />

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-2.5 py-1 text-xs text-stone-600 hover:text-stone-800 cursor-pointer font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={() => handleSaveEdit(memory.id)}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs cursor-pointer font-medium flex items-center gap-1"
                      >
                        {savingEdit ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getCategoryBadgeClass(
                            memory.category
                          )}`}
                        >
                          {memory.category}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-stone-100 text-stone-500 border border-stone-200'
                            }`}
                          >
                            {isActive ? 'Active in Context' : 'Disabled'}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs font-medium text-stone-800 leading-relaxed">
                        {memory.content}
                      </p>
                    </div>

                    {/* Metadata & Actions */}
                    <div className="pt-3 border-t border-stone-100 mt-2 flex items-center justify-between text-[11px] text-stone-400">
                      <div className="flex flex-col">
                        <span className="capitalize">
                          {memory.provenance === 'ai_suggested' ? 'AI Suggested (Approved)' : 'User Authored'}
                        </span>
                        <span>{new Date(memory.createdAt).toLocaleDateString()}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Toggle Active/Disabled */}
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleToggleStatus(memory)}
                          title={isActive ? 'Disable memory' : 'Enable memory'}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            isActive
                              ? 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                              : 'text-stone-400 hover:bg-stone-100 border-stone-200'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(memory)}
                          title="Edit memory"
                          className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleDelete(memory.id)}
                          title="Delete memory permanently"
                          className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
