import { z } from 'zod';

/**
 * CLIENT CHAT REQUEST SCHEMA
 * Enforces strict boundaries:
 * - message: between 1 and 4,000 characters (prevents denial of wallet / token exhaustion)
 * - conversationId: alphanumeric/dash/underscore between 1 and 128 chars
 * - stream: optional boolean flag (default true for SSE streaming)
 * .strict() ensures no client can inject unexpected identity or role fields.
 */
export const chatRequestSchema = z
  .object({
    conversationId: z
      .string()
      .min(1, 'conversationId is required')
      .max(128, 'conversationId cannot exceed 128 characters')
      .regex(/^[a-zA-Z0-9_\-]+$/, 'conversationId contains invalid characters'),
    message: z
      .string()
      .trim()
      .min(1, 'Message cannot be empty')
      .max(4000, 'Message cannot exceed 4,000 characters'),
    stream: z.boolean().optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Alias for backward compatibility
export const chatMessageInputSchema = chatRequestSchema;
export type ChatMessageInput = ChatRequest;

/**
 * CLIENT CREATE CONVERSATION SCHEMA
 */
export const createConversationInputSchema = z
  .object({
    title: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type CreateConversationInput = z.infer<typeof createConversationInputSchema>;

/**
 * SERVER-CONTROLLED CONVERSATION SCHEMA
 * Stored at users/{uid}/conversations/{conversationId}
 */
export const conversationModelSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(128),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastMessageAt: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  archived: z.boolean().default(false),
});

export type ConversationModel = z.infer<typeof conversationModelSchema>;
export const conversationSchema = conversationModelSchema;

/**
 * SERVER-CONTROLLED CONVERSATION MESSAGE SCHEMA
 * Stored at users/{uid}/conversations/{conversationId}/messages/{messageId}
 */
export const conversationMessageModelSchema = z.object({
  id: z.string().min(1).max(128),
  role: z.enum(['user', 'model']),
  content: z.string().min(1).max(10000),
  createdAt: z.string(),
});

export type ConversationMessageModel = z.infer<typeof conversationMessageModelSchema>;
export const conversationMessageSchema = conversationMessageModelSchema;
