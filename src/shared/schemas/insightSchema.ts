import { z } from 'zod';

export const insightTypeSchema = z.enum([
  'recurring_theme',
  'goal_progress',
  'recurring_goal',
  'open_loop',
  'behavioral_pattern',
  'positive_progress',
  'topic_shift',
  'reflection_pattern',
]);
export type InsightType = z.infer<typeof insightTypeSchema>;

export const insightStatusSchema = z.enum(['active', 'dismissed']);
export type InsightStatus = z.infer<typeof insightStatusSchema>;

/**
 * Stored User Insight in Firestore: users/{uid}/insights/{insightId}
 */
export const userInsightSchema = z.object({
  id: z.string().min(1),
  type: insightTypeSchema,
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(800),
  evidence: z.array(z.string().min(1).max(300)).min(1).max(4),
  relatedGoal: z.string().max(300).nullable(),
  sourceJournalIds: z.array(z.string()).max(20),
  sourceConversationIds: z.array(z.string()).max(20),
  createdAt: z.string(),
  updatedAt: z.string(),
  generatedAt: z.string(),
  generationVersion: z.string(),
  status: insightStatusSchema,
  confidence: z.number().min(0).max(1).optional(),
});
export type UserInsight = z.infer<typeof userInsightSchema>;

/**
 * Gemini Structured Output Schema for Individual Insights
 */
export const geminiInsightItemSchema = z.object({
  type: insightTypeSchema,
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(800),
  evidence: z.array(z.string().min(1).max(300)).min(1).max(4),
  relatedGoal: z.string().max(300).nullable().optional(),
  confidence: z.number().min(0).max(1),
  sourceJournalIds: z.array(z.string().max(100)).max(20).optional().default([]),
});
export type GeminiInsightItem = z.infer<typeof geminiInsightItemSchema>;

/**
 * Gemini Structured Output Root for Insight Generation
 */
export const geminiInsightGenerationOutputSchema = z.object({
  insights: z.array(geminiInsightItemSchema).max(8),
});
export type GeminiInsightGenerationOutput = z.infer<typeof geminiInsightGenerationOutputSchema>;

/**
 * Request payload for POST /api/insights/generate
 */
export const generateInsightsRequestSchema = z.object({
  scope: z.enum(['recent', 'weekly']).default('recent'),
});
export type GenerateInsightsRequest = z.infer<typeof generateInsightsRequestSchema>;

/**
 * Stored Weekly Reflection in Firestore: users/{uid}/weeklyReflections/{reflectionId}
 */
export const weeklyReflectionSchema = z.object({
  id: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  headline: z.string().min(1).max(200),
  whatStoodOut: z.array(z.string().max(400)).max(6),
  progress: z.array(z.string().max(400)).max(6),
  recurringThemes: z.array(z.string().max(200)).max(6),
  openLoops: z.array(z.string().max(400)).max(6),
  keyInsight: z.string().min(1).max(800),
  carryForward: z.array(z.string().max(400)).max(6),
  generatedAt: z.string(),
  generationVersion: z.string(),
  insufficientData: z.boolean().optional(),
});
export type WeeklyReflection = z.infer<typeof weeklyReflectionSchema>;

/**
 * Gemini Structured Output Schema for Weekly Reflection
 */
export const geminiWeeklyReflectionOutputSchema = z.object({
  headline: z.string().min(1).max(200),
  whatStoodOut: z.array(z.string().max(400)).max(6),
  progress: z.array(z.string().max(400)).max(6),
  recurringThemes: z.array(z.string().max(200)).max(6),
  openLoops: z.array(z.string().max(400)).max(6),
  keyInsight: z.string().min(1).max(800),
  carryForward: z.array(z.string().max(400)).max(6),
  insufficientData: z.boolean().optional(),
});
export type GeminiWeeklyReflectionOutput = z.infer<typeof geminiWeeklyReflectionOutputSchema>;

/**
 * Request payload for POST /api/insights/weekly
 */
export const generateWeeklyReflectionRequestSchema = z.object({
  scope: z.enum(['current', 'previous']).optional().default('current'),
  regenerate: z.boolean().optional().default(false),
});
export type GenerateWeeklyReflectionRequest = z.infer<typeof generateWeeklyReflectionRequestSchema>;

// Legacy periodic insight schema compatibility
export const periodicInsightSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  periodType: z.enum(['weekly', 'monthly']),
  startDate: z.string().datetime().or(z.string()),
  endDate: z.string().datetime().or(z.string()),
  dominantThemes: z.array(z.string().max(100)).max(20),
  emotionalTrends: z.record(z.string(), z.number()),
  growthSummary: z.string().max(10000),
  createdAt: z.string().datetime().or(z.string()),
  updatedAt: z.string().datetime().or(z.string()),
});
export type PeriodicInsightModel = z.infer<typeof periodicInsightSchema>;

