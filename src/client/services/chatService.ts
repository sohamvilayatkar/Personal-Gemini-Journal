import type { Conversation, ConversationMessage } from '../../shared/types';
import { authenticatedJsonFetch, getValidIdToken } from './apiClient';

export class ChatClientService {
  /**
   * Helper to perform authenticated GET/POST/DELETE requests to the backend
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
   * Fetch all conversations belonging to the authenticated user
   */
  static async listConversations(token?: string): Promise<Conversation[]> {
    const data = await this.authFetch<{ conversations: Conversation[] }>('/api/conversations', token);
    return data.conversations;
  }

  /**
   * Create a new conversation session
   */
  static async createConversation(token?: string, title?: string): Promise<Conversation> {
    const data = await this.authFetch<{ conversation: Conversation }>('/api/conversations', token, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    return data.conversation;
  }

  /**
   * Fetch a single conversation
   */
  static async getConversation(token: string, conversationId: string): Promise<Conversation> {
    const data = await this.authFetch<{ conversation: Conversation }>(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      token
    );
    return data.conversation;
  }

  /**
   * Fetch ordered messages for a conversation
   */
  static async listMessages(token: string, conversationId: string): Promise<ConversationMessage[]> {
    const data = await this.authFetch<{ messages: ConversationMessage[] }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      token
    );
    return data.messages;
  }

  /**
   * Delete a conversation and its subcollections recursively
   */
  static async deleteConversation(token: string, conversationId: string): Promise<void> {
    await this.authFetch<{ status: string }>(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      token,
      {
        method: 'DELETE',
      }
    );
  }

  /**
   * Stream a chat response via Server-Sent Events (SSE)
   * Strictly preserves Authorization: Bearer <token> in headers.
   */
  static async streamChat(
    tokenInput: string,
    params: {
      conversationId: string;
      message: string;
      onStart?: (userMsg: ConversationMessage, meta?: { matchedMemoriesCount?: number; matchedMemories?: any[] }) => void;
      onChunk: (chunk: string) => void;
      onDone: (reply: string, modelMsg?: ConversationMessage, meta?: { matchedMemoriesCount?: number }) => void;
      onError: (err: Error) => void;
      signal?: AbortSignal;
    }
  ): Promise<void> {
    try {
      let activeToken = tokenInput || (await getValidIdToken());

      const executeRequest = async (t: string) => {
        return fetch('/api/chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${t}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            conversationId: params.conversationId,
            message: params.message,
            stream: true,
          }),
          signal: params.signal,
        });
      };

      let response = await executeRequest(activeToken);

      // Automated token refresh if expired
      if (response.status === 401) {
        const errCheck = await response.clone().json().catch(() => ({}));
        if (errCheck.code === 'TOKEN_EXPIRED') {
          activeToken = await getValidIdToken(true);
          response = await executeRequest(activeToken);
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err: any = new Error(errorData.error || `Chat failed with HTTP ${response.status}`);
        err.code = errorData.code;
        params.onError(err);
        return;
      }

      if (!response.body) {
        params.onError(new Error('Readable stream not supported or empty body'));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'start') {
              if (params.onStart && event.userMessage) {
                params.onStart(event.userMessage, {
                  matchedMemoriesCount: event.matchedMemoriesCount,
                  matchedMemories: event.matchedMemories,
                });
              }
            } else if (event.type === 'chunk') {
              if (event.text) {
                accumulatedReply += event.text;
                params.onChunk(event.text);
              }
            } else if (event.type === 'done') {
              params.onDone(event.reply || accumulatedReply, event.modelMessage, {
                matchedMemoriesCount: event.matchedMemoriesCount,
              });
              return;
            } else if (event.type === 'error') {
              const err: any = new Error(event.error || 'AI generation failed');
              err.code = event.code;
              params.onError(err);
              return;
            }
          } catch (e) {
            // Ignore non-json or fragmented SSE framing
          }
        }
      }

      // If finished loop without explicit 'done' event but accumulated reply exists
      params.onDone(accumulatedReply);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Handled as user-requested cancellation
        return;
      }
      params.onError(err);
    }
  }
}
