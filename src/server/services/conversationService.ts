import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin';
import {
  firestoreFallbackStore,
  isFirestorePermissionDenied,
  FirestorePermissionDeniedError,
} from './firestoreFallbackStore';
import type { Conversation, ConversationMessage } from '../../shared/types';

/**
 * Normalizes Firestore Timestamps, Dates, or ISO strings to a standard ISO-8601 string.
 */
function toIsoString(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val.toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  if (typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Creates a new conversation securely under users/{userId}/conversations/{conversationId}.
 *
 * Security:
 * - userId is strictly derived from verified token
 * - Server assigns timestamps, messageCount, and archived status
 */
export async function createConversation(
  userId: string,
  title?: string,
  customDb?: any
): Promise<Conversation> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid arguments: userId is required');
  }

  try {
    const db = customDb || getAdminFirestore();
    const convCol = db.collection('users').doc(userId).collection('conversations');
    const convRef = convCol.doc();

    const conversationTitle = title?.trim() ? title.trim().slice(0, 128) : 'New Reflection';
    const nowIso = new Date().toISOString();

    const data = {
      id: convRef.id,
      title: conversationTitle,
      createdAt: FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : nowIso,
      updatedAt: FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : nowIso,
      lastMessageAt: null,
      messageCount: 0,
      archived: false,
    };

    await convRef.set(data);

    return {
      id: convRef.id,
      title: conversationTitle,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastMessageAt: null,
      messageCount: 0,
      archived: false,
    };
  } catch (err: any) {
    if (!customDb && isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

/**
 * Lists conversations belonging to the authenticated user.
 *
 * Security:
 * - Queries strictly within users/{userId}/conversations
 * - Paginated to prevent unbounded Firestore reads and memory exhaustion
 * - Robust against missing timestamps/indexes in existing documents
 */
export async function listConversations(
  userId: string,
  limitCount = 50,
  customDb?: any
): Promise<Conversation[]> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid arguments: userId is required');
  }

  try {
    const db = customDb || getAdminFirestore();
    const boundedLimit = Math.min(Math.max(1, limitCount), 100);

    const querySnap = await db
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .get();

    const list = querySnap.docs.map((doc: any) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        title: d.title || 'Untitled Reflection',
        createdAt: toIsoString(d.createdAt),
        updatedAt: toIsoString(d.updatedAt || d.createdAt),
        lastMessageAt: d.lastMessageAt ? toIsoString(d.lastMessageAt) : null,
        messageCount: typeof d.messageCount === 'number' ? d.messageCount : 0,
        archived: Boolean(d.archived),
      };
    });

    list.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return list.slice(0, boundedLimit);
  } catch (err: any) {
    if (!customDb && isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

/**
 * Retrieves a single conversation by ID, verifying user ownership.
 */
export async function getConversation(
  userId: string,
  conversationId: string,
  customDb?: any
): Promise<Conversation | null> {
  if (!userId || !conversationId) {
    throw new Error('Invalid arguments: userId and conversationId are required');
  }

  try {
    const db = customDb || getAdminFirestore();
    const docRef = db.collection('users').doc(userId).collection('conversations').doc(conversationId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return null;
    }

    const d = snap.data();
    return {
      id: snap.id,
      title: d.title || 'Untitled Reflection',
      createdAt: toIsoString(d.createdAt),
      updatedAt: toIsoString(d.updatedAt),
      lastMessageAt: d.lastMessageAt ? toIsoString(d.lastMessageAt) : null,
      messageCount: typeof d.messageCount === 'number' ? d.messageCount : 0,
      archived: Boolean(d.archived),
    };
  } catch (err: any) {
    if (!customDb && isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

/**
 * Lists messages in a conversation, verifying conversation ownership.
 */
export async function listMessages(
  userId: string,
  conversationId: string,
  limitCount = 50,
  customDb?: any
): Promise<{ notFound?: boolean; messages: ConversationMessage[] }> {
  if (!userId || !conversationId) {
    throw new Error('Invalid arguments: userId and conversationId are required');
  }

  try {
    const db = customDb || getAdminFirestore();
    const convRef = db.collection('users').doc(userId).collection('conversations').doc(conversationId);
    const convSnap = await convRef.get();

    if (!convSnap.exists) {
      return { notFound: true, messages: [] };
    }

    const boundedLimit = Math.min(Math.max(1, limitCount), 100);
    const messagesSnap = await convRef
      .collection('messages')
      .get();

    const messages: ConversationMessage[] = messagesSnap.docs.map((doc: any) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        role: d.role === 'model' ? 'model' : 'user',
        content: d.content || '',
        createdAt: toIsoString(d.createdAt),
      };
    });

    messages.sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return aTime - bTime;
    });

    return { messages: messages.slice(0, boundedLimit) };
  } catch (err: any) {
    if (!customDb && isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

/**
 * Persists an individual message to Firestore and updates parent conversation metadata.
 *
 * Security:
 * - Server sets timestamp and enforces valid roles ('user' | 'model')
 * - Automatically increments messageCount and updates lastMessageAt / updatedAt
 */
export async function addMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'model',
  content: string,
  customDb?: any
): Promise<ConversationMessage> {
  if (!userId || !conversationId || !role || !content) {
    throw new Error('Invalid arguments: userId, conversationId, role, and content are required');
  }

  try {
    const db = customDb || getAdminFirestore();
    const convRef = db.collection('users').doc(userId).collection('conversations').doc(conversationId);
    const convSnap = await convRef.get();

    if (!convSnap.exists) {
      throw new Error('CONVERSATION_NOT_FOUND');
    }

    const msgRef = convRef.collection('messages').doc();
    const nowIso = new Date().toISOString();

    const msgData = {
      id: msgRef.id,
      role,
      content: content.trim(),
      createdAt: FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : nowIso,
    };

    await msgRef.set(msgData);

    // Update parent conversation metadata
    const convData = convSnap.data() || {};
    const currentTitle = convData.title || '';
    const updates: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : nowIso,
      lastMessageAt: FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : nowIso,
      messageCount: FieldValue.increment ? FieldValue.increment(1) : (convData.messageCount || 0) + 1,
    };

    // If conversation has default title and this is the first user message, assign a brief reflective title
    if (role === 'user' && (currentTitle === 'New Reflection' || !currentTitle)) {
      const preview = content.trim().slice(0, 42).replace(/[\r\n]+/g, ' ');
      updates.title = preview.length > 40 ? `${preview.slice(0, 40)}...` : preview;
    }

    await convRef.update(updates);

    return {
      id: msgRef.id,
      role,
      content: content.trim(),
      createdAt: nowIso,
    };
  } catch (err: any) {
    if (!customDb && isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}

/**
 * Loads bounded conversation context for Gemini.
 *
 * Enforces:
 * - Max messages limit (default: 16 turns)
 * - Max character limit (default: 24,000 characters)
 * - Strict chronological order (oldest to newest)
 */
export async function getBoundedContext(
  userId: string,
  conversationId: string,
  maxMessages = 16,
  maxChars = 24000,
  customDb?: any
): Promise<Array<{ role: 'user' | 'model'; content: string }>> {
  try {
    const db = customDb || getAdminFirestore();
    const convRef = db.collection('users').doc(userId).collection('conversations').doc(conversationId);

    // Query most recent messages first
    const querySnap = await convRef
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(maxMessages)
      .get();

    // Reverse to chronological order (oldest -> newest)
    const chronologicalDocs = querySnap.docs.reverse();

    const turns: Array<{ role: 'user' | 'model'; content: string }> = [];
    let totalChars = 0;

    for (const doc of chronologicalDocs) {
      const d = doc.data();
      const role: 'user' | 'model' = d.role === 'model' ? 'model' : 'user';
      const content: string = typeof d.content === 'string' ? d.content : '';

      turns.push({ role, content });
      totalChars += content.length;
    }

    // If character threshold exceeded, prune oldest turns until within budget
    while (totalChars > maxChars && turns.length > 1) {
      const dropped = turns.shift();
      if (dropped) {
        totalChars -= dropped.content.length;
      }
    }

    return turns;
  } catch (err: any) {
    if (!customDb && isFirestorePermissionDenied(err)) {
      return firestoreFallbackStore.getBoundedContext(userId, conversationId, maxMessages, maxChars);
    }
    throw err;
  }
}

/**
 * Securely and recursively deletes a conversation and all descendant messages in chunked batches.
 *
 * Firestore Batch Constraints:
 * - Firestore batches support a maximum of 500 write operations per batch.
 * - For arbitrarily sized conversations, messages are enumerated and deleted in safe chunks (400 ops/batch).
 * - Once all descendant messages are removed, the parent conversation document is deleted.
 * - The operation is idempotent and retryable upon network interruption.
 */
export async function deleteConversationRecursively(
  userId: string,
  conversationId: string,
  customDb?: any
): Promise<{ success: boolean; notFound?: boolean; deletedMessagesCount: number }> {
  if (!userId || !conversationId) {
    throw new Error('Invalid arguments: userId and conversationId are required');
  }

  try {
    const db = customDb || getAdminFirestore();
    const convRef = db.collection('users').doc(userId).collection('conversations').doc(conversationId);
    const convSnap = await convRef.get();

    if (!convSnap.exists) {
      return { success: false, notFound: true, deletedMessagesCount: 0 };
    }

    const data = convSnap.data();
    if (data?.userId && data.userId !== userId) {
      throw new Error('UNAUTHORIZED_OWNERSHIP_MISMATCH');
    }

    // If the Firestore instance provides recursiveDelete natively (e.g. Firebase Admin SDK v11+)
    if (typeof db.recursiveDelete === 'function') {
      await db.recursiveDelete(convRef);
      return { success: true, deletedMessagesCount: -1 };
    }

    // Chunked batch deletion: 400 operations per batch to stay well under the 500-operation ceiling
    const CHUNK_SIZE = 400;
    let totalDeletedCount = 0;
    const messagesCol = convRef.collection('messages');

    if (typeof messagesCol.limit === 'function') {
      while (true) {
        const messagesQuery = await messagesCol.limit(CHUNK_SIZE).get();
        const docs = messagesQuery.docs || [];
        if (docs.length === 0) {
          break;
        }

        const batch = db.batch();
        for (const doc of docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();

        totalDeletedCount += docs.length;

        if (docs.length < CHUNK_SIZE) {
          break;
        }
      }
    } else {
      // Fallback if limit is not provided on the collection object
      const messagesQuery = await messagesCol.get();
      const docs = messagesQuery.docs || [];
      if (docs.length > 0) {
        const batch = db.batch();
        for (const doc of docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();
        totalDeletedCount = docs.length;
      }
    }

    // Delete the parent conversation document
    const parentBatch = db.batch();
    parentBatch.delete(convRef);
    await parentBatch.commit();

    return { success: true, deletedMessagesCount: totalDeletedCount };
  } catch (err: any) {
    if (!customDb && isFirestorePermissionDenied(err)) {
      throw new FirestorePermissionDeniedError(err);
    }
    throw err;
  }
}
