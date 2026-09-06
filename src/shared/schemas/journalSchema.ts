import { z } from 'zod';

/**
 * Request payload schema for POST /api/journals/generate
 *
 * Strict validation:
 * - Reject any client-provided identity (uid, userId, ownerUid)
 * - Reject custom roles, system prompts, timestamps, or client-provided history
 */
export const generateJournalRequestSchema = z
  .object({
    conversationId: z
      .string()
      .trim()
      .min(1, 'conversationId is required')
      .max(128, 'conversationId exceeds maximum length'),
    regenerate: z.boolean().optional(),
    messagesContext: z
      .array(
        z.object({
          role: z.enum(['user', 'model']),
          content: z.string().min(1).max(10000),
        })
      )
      .max(32)
      .optional(),
  })
  .strict();

export type GenerateJournalRequestInput = z.infer<typeof generateJournalRequestSchema>;

/**
 * Strict backend schema for Gemini's structured JSON journal synthesis.
 *
 * Enforces maximum lengths and counts to prevent unbounded payload persistence:
 * - title: max 120 characters
 * - summary: max 2,000 characters
 * - keyThoughts: max 8 items, each max 200 characters
 * - mood: max 50 characters
 * - emotions: max 8 items, each max 50 characters
 * - insights: max 8 items, each max 200 characters
 * - actionItems: max 8 items, each max 200 characters
 * - goals: max 8 items, each max 200 characters
 * - tags: max 10 items, each max 30 characters
 */
export const geminiJournalStructuredOutputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title cannot be empty')
      .max(120, 'Title cannot exceed 120 characters'),
    summary: z
      .string()
      .trim()
      .min(1, 'Summary cannot be empty')
      .max(2000, 'Summary cannot exceed 2,000 characters'),
    keyThoughts: z
      .array(z.string().trim().min(1).max(200, 'Thought item cannot exceed 200 characters'))
      .max(8, 'keyThoughts cannot exceed 8 items')
      .default([]),
    mood: z
      .string()
      .trim()
      .min(1, 'Mood cannot be empty')
      .max(50, 'Mood cannot exceed 50 characters')
      .default('reflective'),
    emotions: z
      .array(z.string().trim().min(1).max(50, 'Emotion item cannot exceed 50 characters'))
      .max(8, 'emotions cannot exceed 8 items')
      .default([]),
    insights: z
      .array(z.string().trim().min(1).max(200, 'Insight item cannot exceed 200 characters'))
      .max(8, 'insights cannot exceed 8 items')
      .default([]),
    actionItems: z
      .array(z.string().trim().min(1).max(200, 'Action item cannot exceed 200 characters'))
      .max(8, 'actionItems cannot exceed 8 items')
      .default([]),
    goals: z
      .array(z.string().trim().min(1).max(200, 'Goal item cannot exceed 200 characters'))
      .max(8, 'goals cannot exceed 8 items')
      .default([]),
    tags: z
      .array(z.string().trim().min(1).max(30, 'Tag item cannot exceed 30 characters'))
      .max(10, 'tags cannot exceed 10 items')
      .default([]),
  })
  .strict();

export type GeminiJournalStructuredOutput = z.infer<typeof geminiJournalStructuredOutputSchema>;

/**
 * User editability schema for PATCH /api/journals/:journalId
 *
 * Clients may only edit content fields.
 * Direct modification of uid, timestamps, aiGenerated, or sourceConversationId is rejected.
 */
export const updateJournalRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    summary: z.string().trim().min(1).max(2000).optional(),
    keyThoughts: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    mood: z.string().trim().min(1).max(50).optional(),
    emotions: z.array(z.string().trim().min(1).max(50)).max(8).optional(),
    insights: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    actionItems: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    goals: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  })
  .strict();

export type UpdateJournalRequestInput = z.infer<typeof updateJournalRequestSchema>;

/**
 * Full Firestore Journal Document Schema
 */
export const journalDocumentSchema = geminiJournalStructuredOutputSchema.extend({
  id: z.string().min(1),
  sourceConversationId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  aiGenerated: z.literal(true),
  generationVersion: z.string(),
  updatedBy: z.enum(['ai', 'user']),
});

export type JournalDocumentModel = z.infer<typeof journalDocumentSchema>;


