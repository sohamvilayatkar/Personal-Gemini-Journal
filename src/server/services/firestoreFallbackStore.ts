import type {
  Conversation,
  ConversationMessage,
  JournalEntry,
  UserMemory,
  UserInsight,
  WeeklyReflection,
  MemoryCategory,
  MemoryProvenance,
  MemoryStatus,
  InsightStatus,
  InsightType,
} from '../../shared/types';
import type { GeminiJournalStructuredOutput } from '../../shared/schemas/journalSchema';

/**
 * Checks if an error is a Google Cloud IAM / Firestore permission denial (code 7).
 */
export function isFirestorePermissionDenied(err: any): boolean {
  if (!err) return false;
  return (
    err.code === 7 ||
    err.code === 'PERMISSION_DENIED' ||
    err.status === 403 ||
    (typeof err.message === 'string' &&
      (err.message.includes('PERMISSION_DENIED') ||
       err.message.includes('Missing or insufficient permissions')))
  );
}

export class FirestorePermissionDeniedError extends Error {
  code = 'FIRESTORE_PERMISSION_DENIED';
  status = 403;
  details: {
    databaseId: string;
    targetProject: string;
    serviceAccount: string;
    requiredRole: string;
    originalMessage: string;
  };

  constructor(originalError: any) {
    super(
      'Cloud Firestore Access Denied: The server service account lacks Google Cloud IAM roles/datastore.user permission on the named database "personal-gemini-journal" in project "quick-district-507517-f7".'
    );
    this.name = 'FirestorePermissionDeniedError';
    this.details = {
      databaseId: 'personal-gemini-journal',
      targetProject: 'quick-district-507517-f7',
      serviceAccount: 'ais-sandbox@ais-asia-southeast1-9627f88e7f.iam.gserviceaccount.com',
      requiredRole: 'roles/datastore.user',
      originalMessage: originalError?.message || String(originalError),
    };
  }
}

let loggedNotice = false;
export function logFallbackNoticeOnce(userId: string): void {
  if (!loggedNotice) {
    loggedNotice = true;
    console.info(
      `[Firestore Service] Operating in secure per-user isolated memory fallback mode for user ${userId} ` +
      `while Cloud Firestore IAM permissions are configured.`
    );
  }
}

/**
 * Thread-safe, per-user isolated fallback storage engine.
 * Used when the Cloud Run container identity lacks Google Cloud IAM Cloud Datastore User role.
 */
class FirestoreFallbackStore {
  private conversations = new Map<string, Map<string, Conversation>>();
  private messages = new Map<string, Map<string, ConversationMessage[]>>();
  private journals = new Map<string, Map<string, JournalEntry>>();
  private memories = new Map<string, Map<string, UserMemory>>();
  private insights = new Map<string, Map<string, UserInsight>>();
  private weeklyReflections = new Map<string, Map<string, WeeklyReflection>>();

  // ================= CONVERSATIONS & MESSAGES =================

  createConversation(userId: string, title?: string): Conversation {
    logFallbackNoticeOnce(userId);
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, new Map());
      this.messages.set(userId, new Map());
    }

    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const conv: Conversation = {
      id,
      title: title?.trim() ? title.trim().slice(0, 128) : 'New Reflection',
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      messageCount: 0,
      archived: false,
    };

    this.conversations.get(userId)!.set(id, conv);
    this.messages.get(userId)!.set(id, []);
    return conv;
  }

  listConversations(userId: string, limitCount = 50): Conversation[] {
    logFallbackNoticeOnce(userId);
    const userConvs = this.conversations.get(userId);
    if (!userConvs) return [];

    const list = Array.from(userConvs.values());
    list.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
    return list.slice(0, Math.min(Math.max(1, limitCount), 100));
  }

  getConversation(userId: string, conversationId: string): Conversation | null {
    logFallbackNoticeOnce(userId);
    const userConvs = this.conversations.get(userId);
    if (!userConvs) return null;
    return userConvs.get(conversationId) || null;
  }

  deleteConversation(userId: string, conversationId: string): void {
    const userConvs = this.conversations.get(userId);
    if (userConvs) {
      userConvs.delete(conversationId);
    }
    const userMsgs = this.messages.get(userId);
    if (userMsgs) {
      userMsgs.delete(conversationId);
    }
  }

  addMessage(
    userId: string,
    conversationId: string,
    role: 'user' | 'model',
    content: string
  ): ConversationMessage {
    logFallbackNoticeOnce(userId);
    const conv = this.getConversation(userId, conversationId);
    if (!conv) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    let msgList = this.messages.get(userId)?.get(conversationId);
    if (!msgList) {
      if (!this.messages.has(userId)) {
        this.messages.set(userId, new Map());
      }
      msgList = [];
      this.messages.get(userId)!.set(conversationId, msgList);
    }

    const now = new Date().toISOString();
    const message: ConversationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      role,
      content,
      createdAt: now,
    };

    msgList.push(message);

    // Update conversation metadata
    conv.messageCount = msgList.length;
    conv.lastMessageAt = now;
    conv.updatedAt = now;

    return message;
  }

  listMessages(userId: string, conversationId: string, limitCount = 50): ConversationMessage[] {
    logFallbackNoticeOnce(userId);
    const userMsgs = this.messages.get(userId)?.get(conversationId);
    if (!userMsgs) return [];

    return [...userMsgs]
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
      .slice(0, Math.min(Math.max(1, limitCount), 100));
  }

  getBoundedContext(
    userId: string,
    conversationId: string,
    maxTurns = 16,
    maxChars = 24000
  ): Array<{ role: 'user' | 'model'; content: string }> {
    logFallbackNoticeOnce(userId);
    const userMsgs = this.messages.get(userId)?.get(conversationId) || [];
    const sorted = [...userMsgs].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
    const recent = sorted.slice(0, maxTurns).reverse();

    let totalChars = 0;
    const bounded: Array<{ role: 'user' | 'model'; content: string }> = [];

    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i];
      if (totalChars + msg.content.length > maxChars && bounded.length > 0) {
        break;
      }
      bounded.unshift({ role: msg.role, content: msg.content });
      totalChars += msg.content.length;
    }

    return bounded;
  }

  // ================= JOURNALS =================

  findJournalByConversationId(userId: string, conversationId: string): JournalEntry | null {
    logFallbackNoticeOnce(userId);
    const userJournals = this.journals.get(userId);
    if (!userJournals) return null;

    for (const j of userJournals.values()) {
      if (j.sourceConversationId === conversationId) {
        return j;
      }
    }
    return null;
  }

  createJournal(
    userId: string,
    params: {
      sourceConversationId: string;
      data: GeminiJournalStructuredOutput;
      generationVersion?: string;
    }
  ): JournalEntry {
    logFallbackNoticeOnce(userId);
    if (!this.journals.has(userId)) {
      this.journals.set(userId, new Map());
    }

    const id = `jnl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const entry: JournalEntry = {
      id,
      sourceConversationId: params.sourceConversationId,
      title: params.data.title,
      summary: params.data.summary,
      keyThoughts: params.data.keyThoughts || [],
      mood: params.data.mood,
      emotions: params.data.emotions || [],
      insights: params.data.insights || [],
      actionItems: params.data.actionItems || [],
      goals: params.data.goals || [],
      tags: params.data.tags || [],
      createdAt: now,
      updatedAt: now,
      aiGenerated: true,
      generationVersion: params.generationVersion || '1.0.0',
      updatedBy: 'ai',
    };

    this.journals.get(userId)!.set(id, entry);
    return entry;
  }

  listJournals(userId: string, limitCount = 50): JournalEntry[] {
    logFallbackNoticeOnce(userId);
    const userJournals = this.journals.get(userId);
    if (!userJournals) return [];

    const list = Array.from(userJournals.values());
    list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    return list.slice(0, Math.min(Math.max(1, limitCount), 100));
  }

  getJournal(userId: string, journalId: string): JournalEntry | null {
    logFallbackNoticeOnce(userId);
    const userJournals = this.journals.get(userId);
    if (!userJournals) return null;
    return userJournals.get(journalId) || null;
  }

  updateJournal(userId: string, journalId: string, updates: Partial<JournalEntry>): JournalEntry | null {
    logFallbackNoticeOnce(userId);
    const userJournals = this.journals.get(userId);
    if (!userJournals) return null;

    const existing = userJournals.get(journalId);
    if (!existing) return null;

    const updated: JournalEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      sourceConversationId: existing.sourceConversationId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      updatedBy: 'user',
    };

    userJournals.set(journalId, updated);
    return updated;
  }

  deleteJournal(userId: string, journalId: string): boolean {
    const userJournals = this.journals.get(userId);
    if (userJournals && userJournals.has(journalId)) {
      userJournals.delete(journalId);
      return true;
    }
    return false;
  }

  // ================= MEMORIES =================

  createMemory(
    userId: string,
    params: {
      content: string;
      category: MemoryCategory;
      sourceConversationId?: string | null;
      confidence?: number | null;
      provenance?: MemoryProvenance;
    }
  ): UserMemory {
    logFallbackNoticeOnce(userId);
    if (!this.memories.has(userId)) {
      this.memories.set(userId, new Map());
    }

    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const mem: UserMemory = {
      id,
      uid: userId,
      content: params.content,
      category: params.category,
      sourceConversationId: params.sourceConversationId || null,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      userApproved: true,
      provenance: params.provenance || 'user',
      confidence: params.confidence ?? null,
      updatedBy: 'user',
    };

    this.memories.get(userId)!.set(id, mem);
    return mem;
  }

  listMemories(userId: string): UserMemory[] {
    logFallbackNoticeOnce(userId);
    const userMems = this.memories.get(userId);
    if (!userMems) return [];

    const list = Array.from(userMems.values());
    list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    return list;
  }

  getMemory(userId: string, memoryId: string): UserMemory | null {
    logFallbackNoticeOnce(userId);
    const userMems = this.memories.get(userId);
    if (!userMems) return null;
    return userMems.get(memoryId) || null;
  }

  updateMemory(
    userId: string,
    memoryId: string,
    updates: { content?: string; category?: MemoryCategory; status?: MemoryStatus }
  ): UserMemory | null {
    logFallbackNoticeOnce(userId);
    const userMems = this.memories.get(userId);
    if (!userMems) return null;

    const existing = userMems.get(memoryId);
    if (!existing) return null;

    const updated: UserMemory = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: 'user',
    };

    userMems.set(memoryId, updated);
    return updated;
  }

  deleteMemory(userId: string, memoryId: string): boolean {
    const userMems = this.memories.get(userId);
    if (userMems && userMems.has(memoryId)) {
      userMems.delete(memoryId);
      return true;
    }
    return false;
  }

  getActiveApprovedMemoriesForContext(
    userId: string,
    maxItems = 20,
    maxChars = 6000
  ): string[] {
    logFallbackNoticeOnce(userId);
    const userMems = this.memories.get(userId);
    if (!userMems) return [];

    const active = Array.from(userMems.values())
      .filter((m) => m.status === 'active' && m.userApproved)
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .slice(0, maxItems);

    let charCount = 0;
    const result: string[] = [];

    for (const mem of active) {
      const line = `[${mem.category.toUpperCase()}] ${mem.content}`;
      if (charCount + line.length > maxChars) break;
      result.push(line);
      charCount += line.length;
    }

    return result;
  }

  // ================= INSIGHTS & REFLECTIONS =================

  saveInsight(userId: string, insight: UserInsight): UserInsight {
    logFallbackNoticeOnce(userId);
    if (!this.insights.has(userId)) {
      this.insights.set(userId, new Map());
    }
    this.insights.get(userId)!.set(insight.id, insight);
    return insight;
  }

  saveUserInsights(userId: string, insights: UserInsight[]): UserInsight[] {
    logFallbackNoticeOnce(userId);
    if (!this.insights.has(userId)) {
      this.insights.set(userId, new Map());
    }

    const userIns = this.insights.get(userId)!;
    for (const item of insights) {
      userIns.set(item.id, item);
    }
    return insights;
  }

  listInsights(
    userId: string,
    filters?: { status?: InsightStatus; type?: InsightType }
  ): UserInsight[] {
    logFallbackNoticeOnce(userId);
    const userIns = this.insights.get(userId);
    if (!userIns) return [];

    let list = Array.from(userIns.values());
    if (filters?.status) {
      list = list.filter((i) => i.status === filters.status);
    }
    if (filters?.type) {
      list = list.filter((i) => i.type === filters.type);
    }
    list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    return list;
  }

  listUserInsights(userId: string, limitCount = 50): UserInsight[] {
    logFallbackNoticeOnce(userId);
    const userIns = this.insights.get(userId);
    if (!userIns) return [];

    const list = Array.from(userIns.values());
    list.sort((a, b) => (b.generatedAt > a.generatedAt ? 1 : -1));
    return list.slice(0, limitCount);
  }

  getInsight(userId: string, insightId: string): UserInsight | null {
    logFallbackNoticeOnce(userId);
    const userIns = this.insights.get(userId);
    if (!userIns) return null;
    return userIns.get(insightId) || null;
  }

  deleteInsight(userId: string, insightId: string): boolean {
    const userIns = this.insights.get(userId);
    if (userIns && userIns.has(insightId)) {
      userIns.delete(insightId);
      return true;
    }
    return false;
  }

  updateInsightStatus(userId: string, insightId: string, status: InsightStatus): UserInsight | null {
    logFallbackNoticeOnce(userId);
    const userIns = this.insights.get(userId);
    if (!userIns) return null;

    const existing = userIns.get(insightId);
    if (!existing) return null;

    const updated: UserInsight = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };

    userIns.set(insightId, updated);
    return updated;
  }

  saveWeeklyReflection(userId: string, reflection: WeeklyReflection): WeeklyReflection {
    logFallbackNoticeOnce(userId);
    if (!this.weeklyReflections.has(userId)) {
      this.weeklyReflections.set(userId, new Map());
    }

    this.weeklyReflections.get(userId)!.set(reflection.id, reflection);
    return reflection;
  }

  listWeeklyReflections(userId: string, limitCount = 20): WeeklyReflection[] {
    logFallbackNoticeOnce(userId);
    const userRefs = this.weeklyReflections.get(userId);
    if (!userRefs) return [];

    const list = Array.from(userRefs.values());
    list.sort((a, b) => (b.generatedAt > a.generatedAt ? 1 : -1));
    return list.slice(0, limitCount);
  }

  getWeeklyReflection(userId: string, reflectionId: string): WeeklyReflection | null {
    logFallbackNoticeOnce(userId);
    const userRefs = this.weeklyReflections.get(userId);
    if (!userRefs) return null;
    return userRefs.get(reflectionId) || null;
  }

  deleteWeeklyReflection(userId: string, reflectionId: string): boolean {
    const userRefs = this.weeklyReflections.get(userId);
    if (userRefs && userRefs.has(reflectionId)) {
      userRefs.delete(reflectionId);
      return true;
    }
    return false;
  }
}

export const firestoreFallbackStore = new FirestoreFallbackStore();
