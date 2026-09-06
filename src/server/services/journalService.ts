/**
 * Server-Side Journal Service
 *
 * Enforces:
 * 1. Strict per-user isolation: all records stored exclusively under users/{userId}/journals/{journalId}
 * 2. Immutable ownership: userId is never accepted from client input, only derived from verified token
 * 3. Provenance tracking: distinguishes between AI-generated ('ai') and user-edited ('user') state
 * 4. Zero exposure of personal journal content to system logs
 */

import { getAdminFirestore } from './firebaseAdmin';
import {
  firestoreFallbackStore,
  isFirestorePermissionDenied,
  FirestorePermissionDeniedError,
} from './firestoreFallbackStore';
import type { JournalEntry, UpdateJournalRequest } from '../../shared/types';
import {
  journalDocumentSchema,
  updateJournalRequestSchema,
  type GeminiJournalStructuredOutput,
} from '../../shared/schemas/journalSchema';

export class JournalService {
  /**
   * Checks if a journal entry has already been generated for a specific conversation.
   * Prevents accidental duplicate generations.
   */
  static async findJournalByConversationId(
    userId: string,
    conversationId: string,
    customDb?: any
  ): Promise<JournalEntry | null> {
    if (!userId || !conversationId) {
      throw new Error('userId and conversationId are required');
    }

    try {
      const db = customDb || getAdminFirestore();
      const journalsCol = db.collection('users').doc(userId).collection('journals');

      const querySnap = await journalsCol
        .where('sourceConversationId', '==', conversationId)
        .limit(1)
        .get();

      if (querySnap.empty || querySnap.docs.length === 0) {
        return null;
      }

      return querySnap.docs[0].data() as JournalEntry;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        throw new FirestorePermissionDeniedError(err);
      }
      throw err;
    }
  }

  /**
   * Persists a newly synthesized AI journal document under users/{userId}/journals/{journalId}.
   * Stamps server-controlled timestamps, provenance metadata, and versioning.
   */
  static async createJournal(
    userId: string,
    params: {
      sourceConversationId: string;
      data: GeminiJournalStructuredOutput;
      generationVersion?: string;
    },
    customDb?: any
  ): Promise<JournalEntry> {
    if (!userId || !params.sourceConversationId) {
      throw new Error('userId and sourceConversationId are required');
    }

    try {
      const db = customDb || getAdminFirestore();
      const journalId = `journal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();

      const journalDocData = {
        id: journalId,
        sourceConversationId: params.sourceConversationId,
        title: params.data.title,
        summary: params.data.summary,
        keyThoughts: params.data.keyThoughts || [],
        mood: params.data.mood || 'reflective',
        emotions: params.data.emotions || [],
        insights: params.data.insights || [],
        actionItems: params.data.actionItems || [],
        goals: params.data.goals || [],
        tags: params.data.tags || [],
        createdAt: now,
        updatedAt: now,
        aiGenerated: true as const,
        generationVersion: params.generationVersion || '1.0.0',
        updatedBy: 'ai' as const,
      };

      // Strict schema validation before persistence
      const validatedDoc = journalDocumentSchema.parse(journalDocData);

      const docRef = db.collection('users').doc(userId).collection('journals').doc(journalId);
      await docRef.set(validatedDoc);

      return validatedDoc as JournalEntry;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        throw new FirestorePermissionDeniedError(err);
      }
      throw err;
    }
  }

  /**
   * Replaces or updates an existing journal when regenerated.
   */
  static async updateWithRegeneration(
    userId: string,
    existingJournalId: string,
    params: {
      sourceConversationId: string;
      data: GeminiJournalStructuredOutput;
      previousVersion: string;
    },
    customDb?: any
  ): Promise<JournalEntry> {
    try {
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('journals').doc(existingJournalId);
      const snap = await docRef.get();

      if (!snap.exists) {
        throw new Error('JOURNAL_NOT_FOUND');
      }

      const prevData = snap.data();
      const now = new Date().toISOString();

      // Increment major version (e.g. 1.0.0 -> 2.0.0)
      const prevMajor = parseInt(params.previousVersion.split('.')[0], 10) || 1;
      const newVersion = `${prevMajor + 1}.0.0`;

      const updatedDocData = {
        id: existingJournalId,
        sourceConversationId: prevData?.sourceConversationId || params.sourceConversationId,
        title: params.data.title,
        summary: params.data.summary,
        keyThoughts: params.data.keyThoughts || [],
        mood: params.data.mood || 'reflective',
        emotions: params.data.emotions || [],
        insights: params.data.insights || [],
        actionItems: params.data.actionItems || [],
        goals: params.data.goals || [],
        tags: params.data.tags || [],
        createdAt: prevData?.createdAt || now,
        updatedAt: now,
        aiGenerated: true as const,
        generationVersion: newVersion,
        updatedBy: 'ai' as const,
      };

      const validatedDoc = journalDocumentSchema.parse(updatedDocData);
      await docRef.set(validatedDoc);

      return validatedDoc as JournalEntry;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        throw new FirestorePermissionDeniedError(err);
      }
      throw err;
    }
  }

  /**
   * User editability: updates allowable fields with provenance 'user'.
   */
  static async updateJournal(
    userId: string,
    journalId: string,
    updateData: UpdateJournalRequest,
    customDb?: any
  ): Promise<JournalEntry | null> {
    if (!userId || !journalId) {
      throw new Error('userId and journalId are required');
    }

    try {
      const validatedUpdates = updateJournalRequestSchema.parse(updateData);
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('journals').doc(journalId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return null;
      }

      const existing = snap.data() as JournalEntry;
      const now = new Date().toISOString();

      const mergedData: JournalEntry = {
        ...existing,
        ...(validatedUpdates.title !== undefined && { title: validatedUpdates.title }),
        ...(validatedUpdates.summary !== undefined && { summary: validatedUpdates.summary }),
        ...(validatedUpdates.keyThoughts !== undefined && { keyThoughts: validatedUpdates.keyThoughts }),
        ...(validatedUpdates.mood !== undefined && { mood: validatedUpdates.mood }),
        ...(validatedUpdates.emotions !== undefined && { emotions: validatedUpdates.emotions }),
        ...(validatedUpdates.insights !== undefined && { insights: validatedUpdates.insights }),
        ...(validatedUpdates.actionItems !== undefined && { actionItems: validatedUpdates.actionItems }),
        ...(validatedUpdates.goals !== undefined && { goals: validatedUpdates.goals }),
        ...(validatedUpdates.tags !== undefined && { tags: validatedUpdates.tags }),
        updatedAt: now,
        updatedBy: 'user',
      };

      await docRef.set(mergedData);
      return mergedData;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        throw new FirestorePermissionDeniedError(err);
      }
      throw err;
    }
  }

  /**
   * Retrieves a single journal entry scoped strictly to userId.
   */
  static async getJournal(
    userId: string,
    journalId: string,
    customDb?: any
  ): Promise<JournalEntry | null> {
    if (!userId || !journalId) {
      throw new Error('userId and journalId are required');
    }

    try {
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('journals').doc(journalId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return null;
      }

      return snap.data() as JournalEntry;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        throw new FirestorePermissionDeniedError(err);
      }
      throw err;
    }
  }

  /**
   * Lists all journal entries owned by the user, ordered by creation date descending.
   */
  static async listJournals(userId: string, customDb?: any): Promise<JournalEntry[]> {
    if (!userId) {
      throw new Error('userId is required');
    }

    try {
      const db = customDb || getAdminFirestore();
      const journalsCol = db.collection('users').doc(userId).collection('journals');

      const snap = await journalsCol.get();
      const entries: JournalEntry[] = [];

      for (const doc of snap.docs) {
        entries.push(doc.data() as JournalEntry);
      }

      // Sort descending by createdAt
      entries.sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      return entries;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        throw new FirestorePermissionDeniedError(err);
      }
      throw err;
    }
  }

  /**
   * Deletes a journal entry owned by the user.
   */
  static async deleteJournal(
    userId: string,
    journalId: string,
    customDb?: any
  ): Promise<boolean> {
    if (!userId || !journalId) {
      throw new Error('userId and journalId are required');
    }

    try {
      const db = customDb || getAdminFirestore();
      const docRef = db.collection('users').doc(userId).collection('journals').doc(journalId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return false;
      }

      await docRef.delete();
      return true;
    } catch (err: any) {
      if (!customDb && isFirestorePermissionDenied(err)) {
        throw new FirestorePermissionDeniedError(err);
      }
      throw err;
    }
  }
}
