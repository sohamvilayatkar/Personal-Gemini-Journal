import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { InsightClientService } from '../services/insightClientService';
import type { UserInsight, WeeklyReflection, InsightType, InsightStatus } from '../../shared/types';
import {
  Sparkles,
  Calendar,
  Compass,
  AlertCircle,
  Loader2,
  Trash2,
  CheckCircle2,
  EyeOff,
  Eye,
  TrendingUp,
  RefreshCw,
  Lightbulb,
  ShieldCheck,
  Target,
  ArrowRight,
  BookOpen,
} from 'lucide-react';

const INSIGHT_TYPE_LABELS: Record<InsightType, { label: string; bg: string; text: string }> = {
  recurring_theme: { label: 'Recurring Theme', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  goal_progress: { label: 'Goal Progress', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  recurring_goal: { label: 'Recurring Goal', bg: 'bg-blue-50', text: 'text-blue-700' },
  open_loop: { label: 'Open Loop', bg: 'bg-amber-50', text: 'text-amber-700' },
  behavioral_pattern: { label: 'Behavioral Pattern', bg: 'bg-purple-50', text: 'text-purple-700' },
  positive_progress: { label: 'Positive Progress', bg: 'bg-teal-50', text: 'text-teal-700' },
  topic_shift: { label: 'Topic Shift', bg: 'bg-rose-50', text: 'text-rose-700' },
  reflection_pattern: { label: 'Reflection Pattern', bg: 'bg-sky-50', text: 'text-sky-700' },
};

export const InsightView: React.FC = () => {
  const { user, getIdToken } = useAuth();
  const [subTab, setSubTab] = useState<'insights' | 'weekly'>('insights');

  // Insights State
  const [insights, setInsights] = useState<UserInsight[]>([]);
  const [statusFilter, setStatusFilter] = useState<InsightStatus>('active');
  const [typeFilter, setTypeFilter] = useState<InsightType | 'all'>('all');
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Weekly Reflection State
  const [reflections, setReflections] = useState<WeeklyReflection[]>([]);
  const [selectedReflection, setSelectedReflection] = useState<WeeklyReflection | null>(null);
  const [loadingReflections, setLoadingReflections] = useState(false);
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);
  const [weeklyScope, setWeeklyScope] = useState<'current' | 'previous'>('current');

  const [notification, setNotification] = useState<{ message: string; isError: boolean } | null>(null);

  const showNotification = (message: string, isError = false) => {
    setNotification({ message, isError });
    setTimeout(() => setNotification(null), 5000);
  };

  // Load Insights
  const loadInsights = async () => {
    if (!user) return;
    setLoadingInsights(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const list = await InsightClientService.listInsights(token, {
        status: statusFilter,
        type: typeFilter === 'all' ? undefined : typeFilter,
      });
      setInsights(list);
    } catch (err: any) {
      showNotification(err.message || 'Failed to load insights', true);
    } finally {
      setLoadingInsights(false);
    }
  };

  // Load Weekly Reflections
  const loadReflections = async () => {
    if (!user) return;
    setLoadingReflections(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const list = await InsightClientService.listWeeklyReflections(token);
      setReflections(list);
      if (list.length > 0 && !selectedReflection) {
        setSelectedReflection(list[0]);
      }
    } catch (err: any) {
      showNotification(err.message || 'Failed to load weekly reflections', true);
    } finally {
      setLoadingReflections(false);
    }
  };

  useEffect(() => {
    if (subTab === 'insights') {
      loadInsights();
    } else {
      loadReflections();
    }
  }, [user, subTab, statusFilter, typeFilter]);

  // Generate Insights
  const handleGenerateInsights = async () => {
    if (!user || isGeneratingInsights) return;
    setIsGeneratingInsights(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const generated = await InsightClientService.generateInsights(token);
      if (generated.length === 0) {
        showNotification('Gemini found no new recurring patterns across your recent journals.', false);
      } else {
        showNotification(`Discovered ${generated.length} fresh personal insights.`, false);
        loadInsights();
      }
    } catch (err: any) {
      if (err.status === 429) {
        showNotification('Insight generation rate limit reached (3 requests/minute). Please wait.', true);
      } else {
        showNotification(err.message || 'Could not generate insights', true);
      }
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // Toggle Insight Status
  const handleToggleStatus = async (insight: UserInsight) => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const newStatus: InsightStatus = insight.status === 'active' ? 'dismissed' : 'active';
      await InsightClientService.updateInsightStatus(token, insight.id, newStatus);
      showNotification(
        newStatus === 'dismissed' ? 'Insight dismissed.' : 'Insight restored to active.',
        false
      );
      loadInsights();
    } catch (err: any) {
      showNotification(err.message || 'Failed to update insight status', true);
    }
  };

  // Delete Insight
  const handleDeleteInsight = async (insightId: string) => {
    try {
      const token = await getIdToken();
      if (!token) return;
      await InsightClientService.deleteInsight(token, insightId);
      showNotification('Insight deleted.', false);
      setInsights((prev) => prev.filter((i) => i.id !== insightId));
    } catch (err: any) {
      showNotification(err.message || 'Failed to delete insight', true);
    }
  };

  // Generate Weekly Reflection
  const handleGenerateWeekly = async (regenerate = false) => {
    if (!user || isGeneratingWeekly) return;
    setIsGeneratingWeekly(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const reflection = await InsightClientService.generateWeeklyReflection(token, {
        scope: weeklyScope,
        regenerate,
      });
      setSelectedReflection(reflection);
      showNotification('Weekly reflection generated successfully.', false);
      loadReflections();
    } catch (err: any) {
      if (err.status === 429) {
        showNotification('Weekly reflection rate limit reached (2 requests/10 minutes).', true);
      } else {
        showNotification(err.message || 'Could not generate weekly reflection', true);
      }
    } finally {
      setIsGeneratingWeekly(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-stone-50">
      {/* Top Sub-Navigation Bar */}
      <div className="border-b border-stone-200 bg-white px-4 py-2.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setSubTab('insights')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                subTab === 'insights'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              <span>Personal Insights</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('weekly')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                subTab === 'weekly'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>Weekly AI Reflections</span>
            </button>
          </div>
        </div>

        {/* Action Button */}
        {subTab === 'insights' ? (
          <button
            type="button"
            onClick={handleGenerateInsights}
            disabled={isGeneratingInsights}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 hover:bg-stone-800 disabled:opacity-50 text-xs font-medium rounded-lg cursor-pointer transition-colors shadow-2xs"
          >
            {isGeneratingInsights ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>Synthesize Insights</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={weeklyScope}
              onChange={(e) => setWeeklyScope(e.target.value as any)}
              className="text-xs bg-stone-50 border border-stone-200 rounded-md px-2 py-1 text-stone-700"
            >
              <option value="current">Current Week</option>
              <option value="previous">Previous Week</option>
            </select>
            <button
              type="button"
              onClick={() => handleGenerateWeekly(false)}
              disabled={isGeneratingWeekly}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 hover:bg-stone-800 disabled:opacity-50 text-xs font-medium rounded-lg cursor-pointer transition-colors shadow-2xs"
            >
              {isGeneratingWeekly ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
              ) : (
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span>Synthesize Week</span>
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`px-4 py-2 text-xs flex items-center gap-2 ${
            notification.isError
              ? 'bg-rose-50 text-rose-700 border-b border-rose-200'
              : 'bg-emerald-50 text-emerald-700 border-b border-emerald-200'
          }`}
        >
          {notification.isError ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl w-full mx-auto">
        {subTab === 'insights' ? (
          <div>
            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    statusFilter === 'active'
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('dismissed')}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    statusFilter === 'dismissed'
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  Dismissed
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <span>Category:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                  className="bg-white border border-stone-200 rounded-md px-2 py-1 text-xs text-stone-700"
                >
                  <option value="all">All Categories</option>
                  <option value="recurring_theme">Recurring Theme</option>
                  <option value="goal_progress">Goal Progress</option>
                  <option value="recurring_goal">Recurring Goal</option>
                  <option value="open_loop">Open Loop</option>
                  <option value="behavioral_pattern">Behavioral Pattern</option>
                  <option value="positive_progress">Positive Progress</option>
                  <option value="topic_shift">Topic Shift</option>
                  <option value="reflection_pattern">Reflection Pattern</option>
                </select>
              </div>
            </div>

            {/* Insights List */}
            {loadingInsights ? (
              <div className="flex flex-col items-center justify-center py-20 text-stone-400">
                <Loader2 className="w-6 h-6 animate-spin mb-2 text-stone-500" />
                <p className="text-xs">Analyzing reflections & insights...</p>
              </div>
            ) : insights.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center max-w-md mx-auto my-12">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-3">
                  <Lightbulb className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-stone-800 mb-1">
                  {statusFilter === 'active' ? 'No Active Insights Yet' : 'No Dismissed Insights'}
                </h3>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  As you journal and converse with Gemini, click &quot;Synthesize Insights&quot; to discover cross-cutting themes, emotional trends, and behavioral patterns.
                </p>
                {statusFilter === 'active' && (
                  <button
                    type="button"
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingInsights}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 text-xs font-medium rounded-lg hover:bg-stone-800 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Run First Synthesis</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((insight) => {
                  const badge = INSIGHT_TYPE_LABELS[insight.type] || {
                    label: insight.type,
                    bg: 'bg-stone-100',
                    text: 'text-stone-700',
                  };

                  return (
                    <div
                      key={insight.id}
                      className="bg-white border border-stone-200/80 rounded-xl p-4 shadow-2xs flex flex-col justify-between hover:border-stone-300 transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-mono text-stone-400">
                            {Math.round(insight.confidence * 100)}% match
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-stone-800 mb-1.5">
                          {insight.title}
                        </h4>
                        <p className="text-xs text-stone-600 leading-relaxed mb-3">
                          {insight.description}
                        </p>

                        {/* Evidence Quotes */}
                        {insight.evidence && insight.evidence.length > 0 && (
                          <div className="bg-stone-50 border border-stone-100 rounded-lg p-2.5 mb-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 block mb-1">
                              Evidence in Journals
                            </span>
                            <ul className="space-y-1">
                              {insight.evidence.map((quote, idx) => (
                                <li
                                  key={idx}
                                  className="text-[11px] text-stone-600 italic leading-snug flex items-start gap-1.5"
                                >
                                  <span className="text-stone-300 select-none">•</span>
                                  <span>&quot;{quote}&quot;</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Related Goal */}
                        {insight.relatedGoal && (
                          <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50/70 px-2 py-1 rounded mb-3">
                            <Target className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-medium text-[11px]">
                              Goal: {insight.relatedGoal}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between pt-3 border-t border-stone-100 mt-2 text-xs">
                        <div className="flex items-center gap-1 text-[11px] text-stone-400">
                          <BookOpen className="w-3 h-3" />
                          <span>
                            {insight.sourceJournalIds.length} source journal
                            {insight.sourceJournalIds.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(insight)}
                            className="p-1 text-stone-400 hover:text-stone-700 rounded hover:bg-stone-100 cursor-pointer"
                            title={insight.status === 'active' ? 'Dismiss insight' : 'Restore insight'}
                          >
                            {insight.status === 'active' ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInsight(insight.id)}
                            className="p-1 text-stone-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                            title="Delete insight permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Weekly Reflection Sub-View */
          <div>
            {loadingReflections ? (
              <div className="flex flex-col items-center justify-center py-20 text-stone-400">
                <Loader2 className="w-6 h-6 animate-spin mb-2 text-stone-500" />
                <p className="text-xs">Loading reflections...</p>
              </div>
            ) : !selectedReflection ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center max-w-md mx-auto my-12">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-3">
                  <Compass className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-stone-800 mb-1">
                  No Weekly Reflection Synthesized
                </h3>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Synthesize a weekly reflection to review recurring themes, celebrate wins, and gain clarity on lingering open loops from your week.
                </p>
                <button
                  type="button"
                  onClick={() => handleGenerateWeekly(false)}
                  disabled={isGeneratingWeekly}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 text-xs font-medium rounded-lg hover:bg-stone-800 transition-colors"
                >
                  <Compass className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Synthesize Current Week</span>
                </button>
              </div>
            ) : (
              <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs overflow-hidden">
                {/* Header Banner */}
                <div className="border-b border-stone-200 bg-stone-50/70 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-mono font-medium text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded">
                        {new Date(selectedReflection.periodStart).toLocaleDateString()} —{' '}
                        {new Date(selectedReflection.periodEnd).toLocaleDateString()}
                      </span>
                      {selectedReflection.insufficientData && (
                        <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          Partial Data
                        </span>
                      )}
                    </div>
                    <h2 className="text-base sm:text-lg font-semibold text-stone-900">
                      {selectedReflection.headline}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleGenerateWeekly(true)}
                      disabled={isGeneratingWeekly}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-stone-600 bg-white border border-stone-200 rounded-md hover:bg-stone-50 cursor-pointer"
                      title="Regenerate this reflection"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isGeneratingWeekly ? 'animate-spin' : ''}`}
                      />
                      <span>Regenerate</span>
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-4 sm:p-6 space-y-6">
                  {/* Key Insight Callout */}
                  <div className="bg-indigo-50/60 border-l-4 border-indigo-500 p-4 rounded-r-lg">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 block mb-1">
                      Key Overarching Insight
                    </span>
                    <p className="text-sm font-medium text-indigo-950 leading-relaxed">
                      {selectedReflection.keyInsight}
                    </p>
                  </div>

                  {/* Grid of Sections */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* What Stood Out */}
                    <div className="bg-stone-50/70 border border-stone-200/60 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>What Stood Out</span>
                      </h4>
                      <ul className="space-y-1.5">
                        {selectedReflection.whatStoodOut.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-stone-700 flex items-start gap-2 leading-relaxed"
                          >
                            <span className="text-stone-400 select-none">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Progress & Wins */}
                    <div className="bg-stone-50/70 border border-stone-200/60 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Progress & Wins</span>
                      </h4>
                      <ul className="space-y-1.5">
                        {selectedReflection.progress.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-stone-700 flex items-start gap-2 leading-relaxed"
                          >
                            <span className="text-emerald-500 select-none">✓</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Recurring Themes */}
                    <div className="bg-stone-50/70 border border-stone-200/60 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                        <span>Recurring Themes</span>
                      </h4>
                      <ul className="space-y-1.5">
                        {selectedReflection.recurringThemes.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-stone-700 flex items-start gap-2 leading-relaxed"
                          >
                            <span className="text-stone-400 select-none">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Open Loops */}
                    <div className="bg-stone-50/70 border border-stone-200/60 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        <span>Open Loops & Lingering Threads</span>
                      </h4>
                      <ul className="space-y-1.5">
                        {selectedReflection.openLoops.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-stone-700 flex items-start gap-2 leading-relaxed"
                          >
                            <span className="text-rose-400 select-none">○</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Carry Forward Section */}
                  {selectedReflection.carryForward &&
                    selectedReflection.carryForward.length > 0 && (
                      <div className="bg-stone-50/80 border border-stone-200 rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Carry Forward into Next Week</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedReflection.carryForward.map((item, idx) => (
                            <div
                              key={idx}
                              className="bg-white border border-stone-200/70 p-2.5 rounded-md text-xs text-stone-700 leading-snug"
                            >
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
