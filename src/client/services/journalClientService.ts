import type { JournalEntry, UpdateJournalRequest } from '../../shared/types';
import { authenticatedJsonFetch } from './apiClient';

export class JournalClientService {
  /**
   * Helper to execute authenticated requests to /api/journals endpoints
   */
  private static async authFetch<T>(
    endpoint: string,
    token?: string,
    options: RequestInit = {}
  ): Promise<T> {
    return authenticatedJsonFetch<T>(endpoint, {
      ...options,
      token,
    });
  }

  /**
   * Generates a structured personal journal entry from a completed reflection conversation
   */
  static async generateJournal(
    token?: string,
    conversationId?: string,
    regenerate?: boolean,
    messagesContext?: Array<{ role: 'user' | 'model'; content: string }>
  ): Promise<{ journal: JournalEntry; alreadyExists?: boolean; regenerated?: boolean }> {
    return this.authFetch<{ journal: JournalEntry; alreadyExists?: boolean; regenerated?: boolean }>(
      '/api/journals/generate',
      token,
      {
        method: 'POST',
        body: JSON.stringify({ conversationId, regenerate, messagesContext }),
      }
    );
  }

  /**
   * Lists all journal entries owned by the authenticated user
   */
  static async listJournals(token?: string): Promise<JournalEntry[]> {
    const data = await this.authFetch<{ journals: JournalEntry[] }>('/api/journals', token);
    return data.journals;
  }

  /**
   * Retrieves a single journal entry
   */
  static async getJournal(token: string | undefined, journalId: string): Promise<JournalEntry> {
    const data = await this.authFetch<{ journal: JournalEntry }>(
      `/api/journals/${encodeURIComponent(journalId)}`,
      token
    );
    return data.journal;
  }

  /**
   * Updates allowable fields of a journal entry with user provenance
   */
  static async updateJournal(
    token: string | undefined,
    journalId: string,
    updates: UpdateJournalRequest
  ): Promise<JournalEntry> {
    const data = await this.authFetch<{ journal: JournalEntry }>(
      `/api/journals/${encodeURIComponent(journalId)}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
    return data.journal;
  }

  /**
   * Deletes a journal entry
   */
  static async deleteJournal(token: string | undefined, journalId: string): Promise<void> {
    await this.authFetch<{ success: boolean }>(
      `/api/journals/${encodeURIComponent(journalId)}`,
      token,
      {
        method: 'DELETE',
      }
    );
  }

  /**
   * Ask My Journal: Answers questions grounded strictly in the user's past journals and memories
   */
  static async askJournal(
    token: string | undefined,
    question: string
  ): Promise<{
    answer: string;
    sources: Array<{ title: string; date: string; snippet: string; type: 'journal' | 'memory' }>;
  }> {
    return this.authFetch<{
      answer: string;
      sources: Array<{ title: string; date: string; snippet: string; type: 'journal' | 'memory' }>;
    }>('/api/journals/ask', token, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  }
}
