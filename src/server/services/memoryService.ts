import { getAdminFirestore } from './firebaseAdmin';
import {
  firestoreFallbackStore,
  isFirestorePermissionDenied,
  FirestorePermissionDeniedError,
} from './firestoreFallbackStore';
import type {
  UserMemory,
  MemoryCategory,
  MemoryStatus,
  MemoryProvenance,
} from '../../shared/types';

/**
 * Firestore Service for User Memories
 *
 * Implements strict UID isolation under users/{uid}/memories/{memoryId}.
 * Enforces server-controlled timestamps, approval status, and provenance.
 */

export async function createMemory(
  uid: string,
  params: {
    content: string;
    category: MemoryCategory;
    sourceConversationId?: string | null;
    confidence?: number | null;
    provenance?: MemoryProvenance;
  }
): Promise<UserMemory> {
  try {
    const db = getAdminFirestore();
    const id = `memory_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const memory: UserMemory = {
      id,
      uid,
      content: params.content,
      category: params.category,
      sourceConversationId: params.sourceConversationId || null,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      userApproved: true, // Only approved memories are persisted through this service
      provenance: params.provenance || 'user',
      confidence: params.confidence ?? null,
      updatedBy: 'user',
    };

    await db.collection(`users/${uid}/memories`).doc(id).set(memory);
    return memory;
  } catch (err: any) {
    if (isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

export async function listMemories(uid: string): Promise<UserMemory[]> {
  try {
    const db = getAdminFirestore();
    const snapshot = await db.collection(`users/${uid}/memories`).get();

    const memories: UserMemory[] = [];
    snapshot.docs.forEach((doc: any) => {
      memories.push(doc.data() as UserMemory);
    });

    // Sort descending by createdAt
    return memories.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  } catch (err: any) {
    if (isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

export async function getMemory(uid: string, memoryId: string): Promise<UserMemory | null> {
  try {
    const db = getAdminFirestore();
    const doc = await db.collection(`users/${uid}/memories`).doc(memoryId).get();
    if (!doc.exists && !doc.data?.()) {
      return null;
    }
    const data = doc.data();
    if (!data) return null;
    return data as UserMemory;
  } catch (err: any) {
    if (isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

export async function updateMemory(
  uid: string,
  memoryId: string,
  updates: {
    content?: string;
    category?: MemoryCategory;
    status?: MemoryStatus;
  }
): Promise<UserMemory | null> {
  try {
    const db = getAdminFirestore();
    const docRef = db.collection(`users/${uid}/memories`).doc(memoryId);
    const doc = await docRef.get();

    if (!doc.exists && !doc.data?.()) {
      return null;
    }

    const existing = doc.data() as UserMemory;
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: UserMemory = {
      ...existing,
      ...(updates.content !== undefined ? { content: updates.content } : {}),
      ...(updates.category !== undefined ? { category: updates.category } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      updatedAt: now,
      updatedBy: 'user',
    };

    await docRef.set(updated);
    return updated;
  } catch (err: any) {
    if (isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

export async function deleteMemory(uid: string, memoryId: string): Promise<boolean> {
  try {
    const db = getAdminFirestore();
    const docRef = db.collection(`users/${uid}/memories`).doc(memoryId);
    const doc = await docRef.get();

    if (!doc.exists && !doc.data?.()) {
      return false;
    }

    await docRef.delete();
    return true;
  } catch (err: any) {
    if (isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

export async function setMemoryStatus(
  uid: string,
  memoryId: string,
  status: MemoryStatus
): Promise<UserMemory | null> {
  return updateMemory(uid, memoryId, { status });
}

/**
 * Retrieves active, approved memories bounded by maximum count and character budget.
 * Selected memories are ordered deterministically by updatedAt descending.
 */
export async function getActiveApprovedMemoriesForContext(
  uid: string,
  maxMemories = 20,
  maxChars = 6000
): Promise<UserMemory[]> {
  let allMemories: UserMemory[] = [];
  try {
    allMemories = await listMemories(uid);
  } catch (err: any) {
    if (isFirestorePermissionDenied(err)) {
      return [];
    }
    throw err;
  }

  // Filter: ONLY userApproved === true AND status === 'active'
  const activeApproved = allMemories.filter(
    (m) => m.userApproved === true && m.status === 'active'
  );

  // Sort deterministically by updatedAt descending
  activeApproved.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));

  const selected: UserMemory[] = [];
  let totalChars = 0;

  for (const memory of activeApproved) {
    if (selected.length >= maxMemories) {
      break;
    }
    const memChars = memory.content.length + (memory.category?.length || 0);
    if (totalChars + memChars > maxChars) {
      break;
    }
    selected.push(memory);
    totalChars += memChars;
  }

  return selected;
}
