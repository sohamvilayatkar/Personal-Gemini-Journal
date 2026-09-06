import { z } from 'zod';

export const memoryCategories = [
  'goal',
  'preference',
  'project',
  'learning',
  'habit',
  'context',
  'principle',
] as const;

export const memoryStatuses = ['active', 'disabled'] as const;
export const memoryProvenances = ['user', 'ai_suggested'] as const;

/**
 * Strict schema for memory extraction requests (POST /api/memories/extract).
 * Absolutely no extra fields allowed (.strict() enforces rejection of uid, userId, ownerUid, etc.)
 */
export const extractMemoriesRequestSchema = z
  .object({
    conversationId: z
      .string()
      .trim()
      .min(1, 'conversationId must not be empty.')
      .max(128, 'conversationId too long.'),
  })
  .strict();

export type ExtractMemoriesRequestInput = z.infer<typeof extractMemoriesRequestSchema>;

/**
 * Strict schema for memory creation/approval requests (POST /api/memories).
 * Client cannot control: uid, ownerUid, createdAt, updatedAt, userApproved, status.
 */
export const createMemoryRequestSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Memory content must not be empty.')
      .max(500, 'Memory content cannot exceed 500 characters.'),
    category: z.enum(memoryCategories),
    sourceConversationId: z
      .string()
      .trim()
      .max(128)
      .nullable()
      .optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    provenance: z.enum(memoryProvenances).optional(),
  })
  .strict();

export type CreateMemoryRequestInput = z.infer<typeof createMemoryRequestSchema>;

/**
 * Strict schema for updating existing memory (PATCH /api/memories/:memoryId).
 * Modifiable fields: content, category, status.
 * Rejects immutable/security-sensitive fields: id, uid, createdAt, userApproved, etc.
 */
export const updateMemoryRequestSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Memory content must not be empty.')
      .max(500, 'Memory content cannot exceed 500 characters.')
      .optional(),
    category: z.enum(memoryCategories).optional(),
    status: z.enum(memoryStatuses).optional(),
  })
  .strict();

export type UpdateMemoryRequestInput = z.infer<typeof updateMemoryRequestSchema>;

/**
 * Gemini structured output schema for extracted memory candidates.
 * Enforces maximum 5 candidates, content max 500 chars, reason max 300 chars, confidence between 0 and 1.
 */
export const geminiMemoryCandidateSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1)
      .max(500, 'Memory candidate content cannot exceed 500 characters.'),
    category: z.enum(memoryCategories),
    confidence: z.number().min(0).max(1),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(300, 'Reason cannot exceed 300 characters.'),
  })
  .strict();

export const geminiMemoryExtractionOutputSchema = z
  .object({
    candidates: z
      .array(geminiMemoryCandidateSchema)
      .max(5, 'Extraction is capped at a maximum of 5 candidates.'),
  })
  .strict();

export type GeminiMemoryExtractionOutput = z.infer<typeof geminiMemoryExtractionOutputSchema>;
