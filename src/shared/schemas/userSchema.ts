import { z } from 'zod';

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  memoryEnabled: z.boolean().default(true),
  reflectionFrequency: z.enum(['daily', 'weekly', 'manual']).default('weekly'),
});

export const userProfileSchema = z.object({
  uid: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().max(100).nullable(),
  photoURL: z.string().url().nullable().optional(),
  preferences: userPreferencesSchema,
  createdAt: z.string().datetime().or(z.string()),
  updatedAt: z.string().datetime().or(z.string()),
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type UserProfileInput = z.infer<typeof userProfileSchema>;
