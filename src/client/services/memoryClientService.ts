import type {
  UserMemory,
  MemoryCandidate,
  MemoryCategory,
  MemoryStatus,
  MemoryProvenance,
  ExtractMemoriesResponse,
} from '../../shared/types';
import { authenticatedJsonFetch } from './apiClient';

/**
 * Client-side Service for AI Memory operations.
 * Communicates with the trusted backend (/api/memories/*) using Firebase ID tokens.
 */
export class MemoryClientService {
  /**
   * Requests Gemini to propose candidate memories from a reflection conversation.
   * NOTE: Candidates are NOT persisted to the database; user approval is strictly required.
   */
  static async extractCandidates(
    token?: string,
    conversationId?: string
  ): Promise<MemoryCandidate[]> {
    const data = await authenticatedJsonFetch<ExtractMemoriesResponse>('/api/memories/extract', {
      method: 'POST',
      token,
      body: JSON.stringify({ conversationId }),
    });
    return data.candidates;
  }

  /**
   * Persists an explicitly approved or user-created memory.
   */
  static async createMemory(
    token: string | undefined,
    data: {
      content: string;
      category: MemoryCategory;
      sourceConversationId?: string | null;
      confidence?: number | null;
      provenance?: MemoryProvenance;
    }
  ): Promise<UserMemory> {
    const json = await authenticatedJsonFetch<{ memory: UserMemory }>('/api/memories', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    });
    return json.memory;
  }

  /**
   * Lists all memories for the authenticated user.
   */
  static async listMemories(token?: string): Promise<UserMemory[]> {
    const json = await authenticatedJsonFetch<{ memories: UserMemory[] }>('/api/memories', {
      method: 'GET',
      token,
    });
    return json.memories || [];
  }

  /**
   * Updates an existing memory.
   */
  static async updateMemory(
    token: string | undefined,
    memoryId: string,
    updates: {
      content?: string;
      category?: MemoryCategory;
      status?: MemoryStatus;
    }
  ): Promise<UserMemory> {
    const json = await authenticatedJsonFetch<{ memory: UserMemory }>(`/api/memories/${encodeURIComponent(memoryId)}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(updates),
    });
    return json.memory;
  }

  /**
   * Deletes a memory document permanently.
   */
  static async deleteMemory(token: string | undefined, memoryId: string): Promise<void> {
    await authenticatedJsonFetch<{ success: boolean }>(`/api/memories/${encodeURIComponent(memoryId)}`, {
      method: 'DELETE',
      token,
    });
  }

  /**
   * Disables a memory so it is excluded from future chat contexts.
   */
  static async disableMemory(token: string | undefined, memoryId: string): Promise<UserMemory> {
    const json = await authenticatedJsonFetch<{ memory: UserMemory }>(
      `/api/memories/${encodeURIComponent(memoryId)}/disable`,
      {
        method: 'POST',
        token,
      }
    );
    return json.memory;
  }

  /**
   * Enables a memory so it is included in future chat contexts.
   */
  static async enableMemory(token: string | undefined, memoryId: string): Promise<UserMemory> {
    const json = await authenticatedJsonFetch<{ memory: UserMemory }>(
      `/api/memories/${encodeURIComponent(memoryId)}/enable`,
      {
        method: 'POST',
        token,
      }
    );
    return json.memory;
  }
}
