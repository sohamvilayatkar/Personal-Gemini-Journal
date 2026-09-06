/**
 * Personal Insight Engine & Weekly Reflection Service
 *
 * Runs exclusively on the trusted backend.
 * Enforces strict per-user data isolation under users/{uid}/insights and users/{uid}/weeklyReflections.
 *
 * Key Constraints:
 * 1. Bounded Datasets: Maximum 20 journals, 20 memories, 10 insights analyzed per call.
 * 2. Grounded Reference Validation: Filters out any model-hallucinated source IDs.
 * 3. Idempotency & Deduplication: Prevents duplicate insights and deterministic weekly reflections.
 * 4. Zero Gemini DB Access: Server fetches records, sends to Gemini, validates output, and persists.
 * 5. Zero Sensitive Data Logging.
 */

import crypto from 'crypto';
import { getAdminFirestore } from './firebaseAdmin';
import { firestoreFallbackStore, isFirestorePermissionDenied } from './firestoreFallbackStore';
import { GeminiService } from './geminiService';
import { getActiveApprovedMemoriesForContext } from './memoryService';
import { JournalService } from './journalService';
import type {
  UserInsight,
  InsightStatus,
  InsightType,
  WeeklyReflection,
  JournalEntry,
} from '../../shared/types';
import {
  userInsightSchema,
  weeklyReflectionSchema,
} from '../../shared/schemas/insightSchema';

/**
 * Calculates start and end of week (Monday 00:00:00 to Sunday 23:59:59 UTC).
 */
export function getWeekRange(date = new Date(), scope: 'current' | 'previous' = 'current'): {
  periodStart: string;
  periodEnd: string;
  reflectionId: string;
} {
  const target = new Date(date.getTime());
  if (scope === 'previous') {
    target.setUTCDate(target.getUTCDate() - 7);
  }

  // Day of week (0 is Sunday, 1 is Monday, ..., 6 is Saturday)
  const day = target.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(target.getTime());
  monday.setUTCDate(target.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday.getTime());
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  // Calculate ISO week number
  const jan4 = new Date(Date.UTC(monday.getUTCFullYear(), 0, 4));
  const weekNum = Math.ceil(
    ((monday.getTime() - jan4.getTime()) / 86400000 + jan4.getUTCDay() + 1) / 7
  );

  const year = monday.getUTCFullYear();
  const weekStr = weekNum < 10 ? `0${weekNum}` : `${weekNum}`;
  const reflectionId = `weekly-${year}-w${weekStr}`;

  return {
    periodStart: monday.toISOString(),
    periodEnd: sunday.toISOString(),
    reflectionId,
  };
}

export class InsightService {
  /**
   * Fetches recent user-owned journals bounded by maximum limit.
   */
  static async getRecentJournals(
    userId: string,
    limit = 20,
    customDb?: any
  ): Promise<JournalEntry[]> {
    try {
      const db = customDb || getAdminFirestore();
      const colRef = db.collection('users').doc(userId).collection('journals');
      const snap = await colRef.get();

      const journals: JournalEntry[] = [];
      for (const doc of snap.docs) {
        journals.push(doc.data() as JournalEntry);
      }

      // Sort descending by createdAt
      journals.sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      return journals.slice(0, limit);
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        const fallbackJournals = firestoreFallbackStore.listJournals(userId);
        return fallbackJournals.slice(0, limit);
      }
      throw err;
    }
  }

  /**
   * Lists existing insights owned by the user.
   */
  static async listInsights(
    userId: string,
    filters?: { status?: InsightStatus; type?: InsightType },
    customDb?: any
  ): Promise<UserInsight[]> {
    try {
      const db = customDb || getAdminFirestore();
      const colRef = db.collection('users').doc(userId).collection('insights');
      const snap = await colRef.get();

      let insights: UserInsight[] = [];
      for (const doc of snap.docs) {
        insights.push(doc.data() as UserInsight);
      }

      if (filters?.status) {
        insights = insights.filter((i) => i.status === filters.status);
      }
      if (filters?.type) {
        insights = insights.filter((i) => i.type === filters.type);
      }

      // Sort descending by createdAt
      insights.sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      return insights;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        return firestoreFallbackStore.listInsights(userId, filters);
      }
      throw err;
    }
  }

  /**
   * Generates new insights from user's journals and approved memories.
   * Enforces bounded queries, source reference verification, deduplication, and persistence.
   */
  static async generateInsights(
    userId: string,
    _options: { scope?: 'recent' | 'weekly' } = {},
    customDb?: any
  ): Promise<UserInsight[]> {
    // 1. Fetch bounded records: max 20 journals, max 20 memories, max 10 active insights
    const [journals, memories, existingInsights] = await Promise.all([
      this.getRecentJournals(userId, 20, customDb),
      getActiveApprovedMemoriesForContext(userId, 20, 4000),
      this.listInsights(userId, { status: 'active' }, customDb),
    ]);

    if (journals.length === 0) {
      return [];
    }

    // 2. Call Gemini Service with bounded data
    const boundedExistingInsights = existingInsights.slice(0, 10);
    const output = await GeminiService.generateInsights({
      journals,
      memories,
      existingInsights: boundedExistingInsights,
    });

    if (!output.insights || output.insights.length === 0) {
      return [];
    }

    // Map of valid journal IDs to resolve source references
    const validJournalMap = new Map<string, JournalEntry>();
    for (const j of journals) {
      validJournalMap.set(j.id, j);
    }

    const now = new Date().toISOString();
    const persistedInsights: UserInsight[] = [];

    // Set of existing titles to prevent direct duplicates
    const existingTitles = new Set(
      existingInsights.map((i) => i.title.toLowerCase().trim())
    );

    for (const item of output.insights) {
      const normalizedTitle = item.title.toLowerCase().trim();
      if (existingTitles.has(normalizedTitle)) {
        continue;
      }

      // 3. Grounded source reference validation: filter out any hallucinated IDs
      const rawSourceIds = Array.isArray(item.sourceJournalIds) ? item.sourceJournalIds : [];
      const validSourceJournalIds = rawSourceIds.filter((id) => validJournalMap.has(id));

      // Derive distinct source conversation IDs
      const sourceConvIdsSet = new Set<string>();
      for (const jId of validSourceJournalIds) {
        const j = validJournalMap.get(jId);
        if (j?.sourceConversationId) {
          sourceConvIdsSet.add(j.sourceConversationId);
        }
      }

      const insightId = crypto.randomUUID();
      const newInsight: UserInsight = {
        id: insightId,
        type: item.type,
        title: item.title,
        description: item.description,
        evidence: item.evidence,
        relatedGoal: item.relatedGoal ?? null,
        sourceJournalIds: validSourceJournalIds,
        sourceConversationIds: Array.from(sourceConvIdsSet),
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
        generationVersion: '1.0.0',
        status: 'active',
        confidence: item.confidence,
      };

      // Validate through Zod before persistence
      const validated = userInsightSchema.parse(newInsight);

      try {
        const db = customDb || getAdminFirestore();
        const colRef = db.collection('users').doc(userId).collection('insights');
        await colRef.doc(insightId).set(validated);
      } catch (err: any) {
        if (!customDb && isFirestorePermissionDenied(err)) {
          firestoreFallbackStore.saveInsight(userId, validated);
        } else {
          throw err;
        }
      }

      persistedInsights.push(validated);
      existingTitles.add(normalizedTitle);
    }

    return persistedInsights;
  }

  /**
   * Retrieves a single insight scoped strictly to the authenticated user.
   */
  static async getInsight(
    userId: string,
    insightId: string,
    customDb?: any
  ): Promise<UserInsight | null> {
    try {
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('insights').doc(insightId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return null;
      }

      return snap.data() as UserInsight;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        return firestoreFallbackStore.getInsight(userId, insightId);
      }
      throw err;
    }
  }

  /**
   * Updates an insight's status ('active' | 'dismissed').
   */
  static async updateInsightStatus(
    userId: string,
    insightId: string,
    status: InsightStatus,
    customDb?: any
  ): Promise<UserInsight | null> {
    try {
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('insights').doc(insightId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return null;
      }

      const existing = snap.data() as UserInsight;
      const now = new Date().toISOString();
      const updated: UserInsight = {
        ...existing,
        status,
        updatedAt: now,
      };

      await docRef.set(updated);
      return updated;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        return firestoreFallbackStore.updateInsightStatus(userId, insightId, status);
      }
      throw err;
    }
  }

  /**
   * Deletes an insight owned by the user.
   */
  static async deleteInsight(
    userId: string,
    insightId: string,
    customDb?: any
  ): Promise<boolean> {
    try {
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('insights').doc(insightId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return false;
      }

      await docRef.delete();
      return true;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        return firestoreFallbackStore.deleteInsight(userId, insightId);
      }
      throw err;
    }
  }

  // ==================== WEEKLY REFLECTIONS ====================

  /**
   * Lists weekly reflections for the authenticated user.
   */
  static async listWeeklyReflections(
    userId: string,
    customDb?: any
  ): Promise<WeeklyReflection[]> {
    try {
      const db = customDb || getAdminFirestore();
      const colRef = db.collection('users').doc(userId).collection('weeklyReflections');
      const snap = await colRef.get();

      const reflections: WeeklyReflection[] = [];
      for (const doc of snap.docs) {
        reflections.push(doc.data() as WeeklyReflection);
      }

      reflections.sort((a, b) => {
        const aTime = new Date(a.periodStart || 0).getTime();
        const bTime = new Date(b.periodStart || 0).getTime();
        return bTime - aTime;
      });

      return reflections;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        return firestoreFallbackStore.listWeeklyReflections(userId);
      }
      throw err;
    }
  }

  /**
   * Generates or retrieves a weekly reflection for the given period.
   * Enforces idempotency via deterministic weekly reflection IDs unless regenerate is explicitly true.
   */
  static async generateWeeklyReflection(
    userId: string,
    options: { scope?: 'current' | 'previous'; regenerate?: boolean } = {},
    customDb?: any
  ): Promise<WeeklyReflection> {
    const { periodStart, periodEnd, reflectionId } = getWeekRange(new Date(), options.scope || 'current');

    // Idempotency: Return existing reflection unless regeneration was explicitly requested
    if (!options.regenerate) {
      try {
        const db = customDb || getAdminFirestore();
        const docRef = db.collection('users').doc(userId).collection('weeklyReflections').doc(reflectionId);
        const existingSnap = await docRef.get();
        if (existingSnap.exists) {
          return existingSnap.data() as WeeklyReflection;
        }
      } catch (err: any) {
        if (!customDb && isFirestorePermissionDenied(err)) {
          const fallbackExisting = firestoreFallbackStore.getWeeklyReflection(userId, reflectionId);
          if (fallbackExisting) {
            return fallbackExisting;
          }
        } else {
          throw err;
        }
      }
    }

    // Fetch bounded journals and memories
    const [allRecentJournals, memories, previousReflections] = await Promise.all([
      this.getRecentJournals(userId, 20, customDb),
      getActiveApprovedMemoriesForContext(userId, 20, 4000),
      this.listWeeklyReflections(userId, customDb),
    ]);

    // Filter journals to those within the period (or recent entries if within the week)
    const periodStartMs = new Date(periodStart).getTime();
    const periodEndMs = new Date(periodEnd).getTime();

    let journalsInPeriod = allRecentJournals.filter((j) => {
      const jTime = new Date(j.createdAt || 0).getTime();
      return jTime >= periodStartMs && jTime <= periodEndMs;
    });

    // If no journals in exact range, use recent journals as a fallback if scope is current
    if (journalsInPeriod.length < 2 && options.scope !== 'previous' && allRecentJournals.length >= 2) {
      journalsInPeriod = allRecentJournals.slice(0, 7);
    }

    const previousReflection = previousReflections.find((r) => r.id !== reflectionId) || null;

    const output = await GeminiService.generateWeeklyReflection({
      journals: journalsInPeriod,
      memories,
      previousReflection,
    });

    const now = new Date().toISOString();
    const reflection: WeeklyReflection = {
      id: reflectionId,
      periodStart,
      periodEnd,
      headline: output.headline,
      whatStoodOut: output.whatStoodOut || [],
      progress: output.progress || [],
      recurringThemes: output.recurringThemes || [],
      openLoops: output.openLoops || [],
      keyInsight: output.keyInsight,
      carryForward: output.carryForward || [],
      generatedAt: now,
      generationVersion: '1.0.0',
      ...(output.insufficientData ? { insufficientData: true } : {}),
    };

    const validated = weeklyReflectionSchema.parse(reflection);

    // Persist unless insufficient data
    if (!output.insufficientData) {
      try {
        const db = customDb || getAdminFirestore();
        const docRef = db.collection('users').doc(userId).collection('weeklyReflections').doc(reflectionId);
        await docRef.set(validated);
      } catch (err: any) {
        if (!customDb && isFirestorePermissionDenied(err)) {
          firestoreFallbackStore.saveWeeklyReflection(userId, validated);
        } else {
          throw err;
        }
      }
    }

    return validated;
  }

  /**
   * Retrieves a specific weekly reflection.
   */
  static async getWeeklyReflection(
    userId: string,
    reflectionId: string,
    customDb?: any
  ): Promise<WeeklyReflection | null> {
    try {
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('weeklyReflections').doc(reflectionId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return null;
      }

      return snap.data() as WeeklyReflection;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        return firestoreFallbackStore.getWeeklyReflection(userId, reflectionId);
      }
      throw err;
    }
  }

  /**
   * Deletes a weekly reflection.
   */
  static async deleteWeeklyReflection(
    userId: string,
    reflectionId: string,
    customDb?: any
  ): Promise<boolean> {
    try {
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('weeklyReflections').doc(reflectionId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return false;
      }

      await docRef.delete();
      return true;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        return firestoreFallbackStore.deleteWeeklyReflection(userId, reflectionId);
      }
      throw err;
    }
  }
}
