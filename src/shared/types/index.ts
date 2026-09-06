/**
 * Shared Type Definitions for Personal Gemini Journal
 * Strictly defines domain models and API contracts across client & server.
 */

export type MoodType =
  | 'reflective'
  | 'calm'
  | 'anxious'
  | 'energized'
  | 'grateful'
  | 'melancholy'
  | 'focused'
  | 'overwhelmed';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  memoryEnabled: boolean;
  reflectionFrequency: 'daily' | 'weekly' | 'manual';
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface MessageMetadata {
  tokenEstimate?: number;
  safetyFeedback?: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
  isJournalQuery?: boolean;
  matchedMemoriesCount?: number;
  sources?: Array<{ title: string; date: string; snippet: string; type: 'journal' | 'memory' }>;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  archived: boolean;
}

export interface JournalEntry {
  id: string;
  sourceConversationId: string;
  title: string;
  summary: string;
  keyThoughts: string[];
  mood: string;
  emotions: string[];
  insights: string[];
  actionItems: string[];
  goals: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  aiGenerated: boolean;
  generationVersion: string;
  updatedBy: 'ai' | 'user';
}

export interface GenerateJournalRequest {
  conversationId: string;
  regenerate?: boolean;
}

export interface GenerateJournalResponse {
  journal: JournalEntry;
  alreadyExists?: boolean;
  regenerated?: boolean;
}

export interface UpdateJournalRequest {
  title?: string;
  summary?: string;
  keyThoughts?: string[];
  mood?: string;
  emotions?: string[];
  insights?: string[];
  actionItems?: string[];
  goals?: string[];
  tags?: string[];
}

export type MemoryCategory = 'goal' | 'preference' | 'project' | 'learning' | 'habit' | 'context' | 'principle';
export type MemoryStatus = 'active' | 'disabled';
export type MemoryProvenance = 'user' | 'ai_suggested';

export interface UserMemory {
  id: string;
  uid?: string;
  content: string;
  category: MemoryCategory;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
  status: MemoryStatus;
  userApproved: boolean;
  provenance: MemoryProvenance;
  confidence: number | null;
  updatedBy?: 'user' | 'ai';
}

export interface MemoryCandidate {
  content: string;
  category: MemoryCategory;
  confidence: number;
  reason: string;
}

export interface ExtractMemoriesRequest {
  conversationId: string;
}

export interface ExtractMemoriesResponse {
  candidates: MemoryCandidate[];
  conversationId: string;
}

export interface CreateMemoryRequest {
  content: string;
  category: MemoryCategory;
  sourceConversationId?: string | null;
  confidence?: number | null;
  provenance?: MemoryProvenance;
}

export interface UpdateMemoryRequest {
  content?: string;
  category?: MemoryCategory;
  status?: MemoryStatus;
}

export type {
  InsightType,
  InsightStatus,
  UserInsight,
  GeminiInsightItem,
  GeminiInsightGenerationOutput,
  GenerateInsightsRequest,
  WeeklyReflection,
  GeminiWeeklyReflectionOutput,
  GenerateWeeklyReflectionRequest,
} from '../schemas/insightSchema';

export interface PeriodicInsight {
  id: string;
  userId: string;
  periodType: 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  dominantThemes: string[];
  emotionalTrends: Record<string, number>;
  growthSummary: string;
  createdAt: string;
  updatedAt: string;
}

// API DTOs
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
  firebaseProject?: string;
  firestoreDatabase?: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

export interface ChatApiRequest {
  conversationId: string;
  message: string;
  stream?: boolean;
}

export interface ChatApiResponse {
  reply: string;
  conversationId: string;
  userMessage?: ConversationMessage;
  modelMessage?: ConversationMessage;
}
