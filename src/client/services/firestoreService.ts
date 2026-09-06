import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { firestore, auth } from '../lib/firebaseClient';
import type {
  JournalEntry,
  UserMemory,
  UserProfile,
  Conversation,
  ConversationMessage,
} from '../../shared/types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentAuthUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuthUser?.uid || null,
      email: currentAuthUser?.email || null,
      emailVerified: currentAuthUser?.emailVerified || null,
      isAnonymous: currentAuthUser?.isAnonymous || null,
      tenantId: currentAuthUser?.tenantId || null,
      providerInfo:
        currentAuthUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Deeply strips all undefined properties from an object or array.
 * Firestore setDoc/updateDoc throws an "Unsupported field value: undefined" error if any property is undefined.
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as unknown as T;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanForFirestore(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      result[key] = cleanForFirestore(value);
    }
  }
  return result as T;
}

/**
 * ClientFirestoreService
 * Direct, authenticated Firestore operations conforming to the Eight Pillars
 * and security rules in firestore.rules.
 *
 * All paths reside strictly under /users/{uid}/...
 */
export class ClientFirestoreService {
  /**
   * Syncs user profile in Firestore
   */
  static async syncUserProfile(user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  }): Promise<void> {
    if (!firestore) return;
    const path = `users/${user.uid}`;
    try {
      const userRef = doc(firestore, 'users', user.uid);
      const existing = await getDoc(userRef);

      const now = new Date().toISOString();
      if (!existing.exists()) {
        await setDoc(userRef, cleanForFirestore({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          preferences: {
            theme: 'system',
            memoryEnabled: true,
            reflectionFrequency: 'weekly',
          },
          createdAt: now,
          updatedAt: now,
        }));
      } else {
        await setDoc(
          userRef,
          cleanForFirestore({
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            updatedAt: now,
          }),
          { merge: true }
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  /**
   * Fetches user profile
   */
  static async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!firestore) return null;
    const path = `users/${uid}`;
    try {
      const userRef = doc(firestore, 'users', uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) return null;
      return snap.data() as UserProfile;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  /**
   * List journals for the authenticated user
   * Robust against missing or legacy timestamps; ensures existing records are never omitted.
   */
  static async listJournals(uid: string): Promise<JournalEntry[]> {
    if (!firestore) return [];
    const path = `users/${uid}/journals`;
    try {
      const journalsRef = collection(firestore, 'users', uid, 'journals');
      let snap;
      try {
        const q = query(journalsRef, orderBy('createdAt', 'desc'), limit(100));
        snap = await getDocs(q);
      } catch (orderErr) {
        console.warn('orderBy createdAt failed for journals, reading without order:', orderErr);
        snap = await getDocs(query(journalsRef, limit(100)));
      }

      // If snap is empty, verify if documents exist that lacked the ordered field
      if (snap.empty) {
        const unorderedSnap = await getDocs(query(journalsRef, limit(100)));
        if (!unorderedSnap.empty) {
          snap = unorderedSnap;
        }
      }

      const results = snap.docs.map((d) => {
        const data = d.data();
        const createdAt = data.createdAt || data.date || data.updatedAt || new Date().toISOString();
        const updatedAt = data.updatedAt || createdAt;
        const summary = data.summary || data.content || '';
        return {
          id: d.id,
          sourceConversationId: data.sourceConversationId || '',
          title: data.title || 'Untitled Entry',
          summary,
          content: data.content || summary,
          keyThoughts: Array.isArray(data.keyThoughts) ? data.keyThoughts : [],
          mood: data.mood || 'reflective',
          emotions: Array.isArray(data.emotions) ? data.emotions : [],
          insights: Array.isArray(data.insights) ? data.insights : [],
          actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
          goals: Array.isArray(data.goals) ? data.goals : [],
          tags: Array.isArray(data.tags) ? data.tags : [],
          createdAt,
          updatedAt,
          aiGenerated: data.aiGenerated ?? true,
          generationVersion: data.generationVersion || '1.0.0',
          updatedBy: data.updatedBy || 'ai',
          ...data,
        } as JournalEntry;
      });

      return results.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  /**
   * Create a new journal entry
   */
  static async createJournal(
    uid: string,
    entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    if (!firestore) throw new Error('Firestore not initialized');
    const journalsRef = collection(firestore, 'users', uid, 'journals');
    const newDocRef = doc(journalsRef);
    const path = `users/${uid}/journals/${newDocRef.id}`;
    const now = new Date().toISOString();

    const data: JournalEntry = {
      ...entry,
      id: newDocRef.id,
      createdAt: now,
      updatedAt: now,
      summary: entry.summary || (entry as any).content || '',
      keyThoughts: Array.isArray(entry.keyThoughts) ? entry.keyThoughts : [],
      mood: entry.mood || 'reflective',
      emotions: Array.isArray(entry.emotions) ? entry.emotions : [],
      insights: Array.isArray(entry.insights) ? entry.insights : [],
      actionItems: Array.isArray(entry.actionItems) ? entry.actionItems : [],
      goals: Array.isArray(entry.goals) ? entry.goals : [],
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      aiGenerated: entry.aiGenerated ?? false,
      generationVersion: entry.generationVersion || '1.0.0',
      updatedBy: entry.updatedBy || 'user',
    };

    try {
      await setDoc(newDocRef, cleanForFirestore(data));
      return newDocRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  /**
   * Save or upsert a full journal entry (e.g. from AI generation)
   */
  static async saveJournal(uid: string, entry: JournalEntry): Promise<void> {
    if (!firestore) throw new Error('Firestore not initialized');
    const path = `users/${uid}/journals/${entry.id}`;
    const now = new Date().toISOString();
    const cleanEntry: JournalEntry = {
      ...entry,
      createdAt: entry.createdAt || now,
      updatedAt: now,
      summary: entry.summary || (entry as any).content || '',
      sourceConversationId: entry.sourceConversationId || '',
      mood: entry.mood || 'reflective',
      keyThoughts: Array.isArray(entry.keyThoughts) ? entry.keyThoughts : [],
      emotions: Array.isArray(entry.emotions) ? entry.emotions : [],
      insights: Array.isArray(entry.insights) ? entry.insights : [],
      actionItems: Array.isArray(entry.actionItems) ? entry.actionItems : [],
      goals: Array.isArray(entry.goals) ? entry.goals : [],
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      aiGenerated: entry.aiGenerated ?? true,
      generationVersion: entry.generationVersion || '1.0.0',
      updatedBy: entry.updatedBy || 'ai',
    };
    try {
      const journalRef = doc(firestore, 'users', uid, 'journals', entry.id);
      await setDoc(journalRef, cleanForFirestore(cleanEntry), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  /**
   * Update an existing journal entry
   */
  static async updateJournal(
    uid: string,
    journalId: string,
    updates: Partial<JournalEntry>
  ): Promise<void> {
    if (!firestore) return;
    const path = `users/${uid}/journals/${journalId}`;
    try {
      const journalRef = doc(firestore, 'users', uid, 'journals', journalId);
      await setDoc(
        journalRef,
        cleanForFirestore({
          ...updates,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  /**
   * Delete single journal entry
   */
  static async deleteJournal(uid: string, journalId: string): Promise<void> {
    if (!firestore) throw new Error('Firestore not initialized');
    const path = `users/${uid}/journals/${journalId}`;
    try {
      const journalRef = doc(firestore, 'users', uid, 'journals', journalId);
      await deleteDoc(journalRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  /**
   * List conversations for the authenticated user
   * Robust against missing timestamps; ensures existing records are never omitted.
   */
  static async listConversations(uid: string): Promise<Conversation[]> {
    if (!firestore) return [];
    const path = `users/${uid}/conversations`;
    try {
      const convsRef = collection(firestore, 'users', uid, 'conversations');
      let snap;
      try {
        const q = query(convsRef, orderBy('updatedAt', 'desc'), limit(100));
        snap = await getDocs(q);
      } catch (orderErr) {
        console.warn('orderBy updatedAt failed for conversations, reading without order:', orderErr);
        snap = await getDocs(query(convsRef, limit(100)));
      }

      if (snap.empty) {
        const unorderedSnap = await getDocs(query(convsRef, limit(100)));
        if (!unorderedSnap.empty) {
          snap = unorderedSnap;
        }
      }

      const results = snap.docs.map((d) => {
        const data = d.data();
        const createdAt = data.createdAt || data.date || new Date().toISOString();
        const updatedAt = data.updatedAt || data.lastMessageAt || createdAt;
        return {
          id: d.id,
          title: data.title || 'Untitled Reflection',
          createdAt,
          updatedAt,
          lastMessageAt: data.lastMessageAt || null,
          messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
          archived: !!data.archived,
          ...data,
        } as Conversation;
      });

      return results.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  /**
   * Save or upsert conversation metadata
   */
  static async saveConversation(uid: string, conversation: Conversation): Promise<void> {
    if (!firestore) throw new Error('Firestore not initialized');
    const path = `users/${uid}/conversations/${conversation.id}`;
    const now = new Date().toISOString();
    const cleanConv: Conversation = {
      ...conversation,
      createdAt: conversation.createdAt || now,
      updatedAt: now,
      messageCount: typeof conversation.messageCount === 'number' ? conversation.messageCount : 0,
      archived: !!conversation.archived,
    };
    try {
      const convRef = doc(firestore, 'users', uid, 'conversations', conversation.id);
      await setDoc(convRef, cleanForFirestore(cleanConv), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  /**
   * Update existing conversation metadata
   */
  static async updateConversation(
    uid: string,
    conversationId: string,
    updates: Partial<Conversation>
  ): Promise<void> {
    if (!firestore) return;
    const path = `users/${uid}/conversations/${conversationId}`;
    try {
      const convRef = doc(firestore, 'users', uid, 'conversations', conversationId);
      await setDoc(
        convRef,
        cleanForFirestore({
          ...updates,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  /**
   * Delete conversation and reference
   */
  static async deleteConversation(uid: string, conversationId: string): Promise<void> {
    if (!firestore) return;
    const path = `users/${uid}/conversations/${conversationId}`;
    try {
      const convRef = doc(firestore, 'users', uid, 'conversations', conversationId);
      await deleteDoc(convRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  /**
   * List messages for a conversation
   * Robust against missing timestamps.
   */
  static async listMessages(uid: string, conversationId: string): Promise<ConversationMessage[]> {
    if (!firestore) return [];
    const path = `users/${uid}/conversations/${conversationId}/messages`;
    try {
      const msgsRef = collection(firestore, 'users', uid, 'conversations', conversationId, 'messages');
      let snap;
      try {
        const q = query(msgsRef, orderBy('createdAt', 'asc'), limit(200));
        snap = await getDocs(q);
      } catch (orderErr) {
        console.warn('orderBy createdAt failed for messages, reading without order:', orderErr);
        snap = await getDocs(query(msgsRef, limit(200)));
      }

      if (snap.empty) {
        const unorderedSnap = await getDocs(query(msgsRef, limit(200)));
        if (!unorderedSnap.empty) {
          snap = unorderedSnap;
        }
      }

      const results = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          role: data.role === 'model' ? 'model' : 'user',
          content: data.content || '',
          createdAt: data.createdAt || new Date().toISOString(),
          ...data,
        } as ConversationMessage;
      });

      return results.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  /**
   * Save a single chat message to Firestore
   */
  static async saveMessage(
    uid: string,
    conversationId: string,
    message: ConversationMessage
  ): Promise<void> {
    if (!firestore) return;
    const path = `users/${uid}/conversations/${conversationId}/messages/${message.id}`;
    const now = new Date().toISOString();
    const cleanMsg: ConversationMessage = {
      ...message,
      createdAt: message.createdAt || now,
    };
    try {
      const msgRef = doc(
        firestore,
        'users',
        uid,
        'conversations',
        conversationId,
        'messages',
        message.id
      );
      await setDoc(msgRef, cleanForFirestore(cleanMsg));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  /**
   * List memories for the authenticated user
   * Robust against missing timestamps.
   */
  static async listMemories(uid: string): Promise<UserMemory[]> {
    if (!firestore) return [];
    const path = `users/${uid}/memories`;
    try {
      const memoriesRef = collection(firestore, 'users', uid, 'memories');
      let snap;
      try {
        const q = query(memoriesRef, orderBy('createdAt', 'desc'), limit(100));
        snap = await getDocs(q);
      } catch (orderErr) {
        console.warn('orderBy createdAt failed for memories, reading without order:', orderErr);
        snap = await getDocs(query(memoriesRef, limit(100)));
      }

      if (snap.empty) {
        const unorderedSnap = await getDocs(query(memoriesRef, limit(100)));
        if (!unorderedSnap.empty) {
          snap = unorderedSnap;
        }
      }

      const results = snap.docs.map((d) => {
        const data = d.data();
        const createdAt = data.createdAt || data.updatedAt || new Date().toISOString();
        const updatedAt = data.updatedAt || createdAt;
        return {
          id: d.id,
          uid,
          content: data.content || '',
          category: data.category || 'context',
          status: data.status || 'active',
          userApproved: data.userApproved ?? true,
          provenance: data.provenance || 'user',
          createdAt,
          updatedAt,
          ...data,
        } as UserMemory;
      });

      return results.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  /**
   * Save or upsert a memory item
   */
  static async saveMemory(uid: string, memory: UserMemory): Promise<void> {
    if (!firestore) return;
    const path = `users/${uid}/memories/${memory.id}`;
    const now = new Date().toISOString();
    const cleanMem: UserMemory = {
      ...memory,
      createdAt: memory.createdAt || now,
      updatedAt: now,
    };
    try {
      const memRef = doc(firestore, 'users', uid, 'memories', memory.id);
      await setDoc(memRef, cleanForFirestore(cleanMem), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  /**
   * Delete single memory
   */
  static async deleteMemory(uid: string, memoryId: string): Promise<void> {
    if (!firestore) throw new Error('Firestore not initialized');
    const path = `users/${uid}/memories/${memoryId}`;
    try {
      const memRef = doc(firestore, 'users', uid, 'memories', memoryId);
      await deleteDoc(memRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}
