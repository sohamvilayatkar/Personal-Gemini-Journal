import type { UserMemory, MemoryCategory } from '../../shared/types';
import { listMemories } from './memoryService';

/**
 * Common English stopwords to ignore during keyword extraction
 */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do',
  'does', 'doing', 'don\'t', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'i', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is',
  'isn\'t', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'really', 'today', 'just',
]);

/**
 * Semantic triggers to boost corresponding memory categories
 */
const CATEGORY_TRIGGERS: Record<string, string[]> = {
  project: [
    'project', 'work', 'working', 'job', 'coding', 'code', 'app', 'system',
    'feature', 'client', 'deadline', 'task', 'build', 'building', 'machine learning',
    'ml', 'ai', 'model', 'software', 'bug', 'launch', 'deliver', 'portfolio'
  ],
  goal: [
    'goal', 'goals', 'aim', 'aiming', 'target', 'hope', 'hoping', 'plan', 'planning',
    'aspire', 'resolution', 'strive', 'dream', 'achieve', 'achievement', 'reach',
    'working towards', 'future'
  ],
  preference: [
    'like', 'prefer', 'preference', 'favorite', 'hate', 'dislike', 'enjoy',
    'routine', 'habit', 'usually', 'always', 'never', 'tend to', 'style'
  ],
  relationship: [
    'friend', 'friends', 'partner', 'colleague', 'coworker', 'boss', 'manager',
    'mom', 'dad', 'family', 'wife', 'husband', 'brother', 'sister', 'team'
  ],
  emotion: [
    'feel', 'feeling', 'felt', 'mood', 'frustrated', 'anxious', 'stress', 'stressed',
    'overwhelmed', 'happy', 'excited', 'proud', 'sad', 'down', 'exhausted', 'tired',
    'peaceful', 'calm', 'burnout'
  ],
  value: [
    'value', 'believe', 'belief', 'principle', 'integrity', 'meaningful', 'purpose',
    'priority', 'matters', 'important to me'
  ],
  context: [
    'live', 'living', 'moving', 'city', 'health', 'fitness', 'schedule', 'routine',
    'background', 'situation'
  ],
};

export interface ScoredMemory {
  memory: UserMemory;
  score: number;
  matchedKeywords: string[];
}

export class MemoryRetrievalService {
  /**
   * Tokenizes and cleans a text string into normalized, meaningful tokens.
   */
  static tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  }

  /**
   * Computes a relevance score between the query text and a memory item.
   */
  static scoreMemory(query: string, memory: UserMemory): { score: number; matchedKeywords: string[] } {
    const queryTokens = this.tokenize(query);
    const queryLower = query.toLowerCase();
    const memoryTokens = this.tokenize(memory.content);
    const memoryLower = memory.content.toLowerCase();

    let score = 0;
    const matchedKeywords: string[] = [];

    // 1. Direct phrase match: if a full substring of 3+ words in query appears in memory
    for (let i = 0; i < queryTokens.length - 1; i++) {
      const bigram = `${queryTokens[i]} ${queryTokens[i + 1]}`;
      if (memoryLower.includes(bigram)) {
        score += 8.0;
        matchedKeywords.push(bigram);
      }
    }

    // 2. Individual keyword matches
    const memoryTokenSet = new Set(memoryTokens);
    for (const qToken of queryTokens) {
      if (memoryTokenSet.has(qToken)) {
        score += 3.0;
        matchedKeywords.push(qToken);
      } else {
        // Partial/stem match (e.g. "frustrated" vs "frustrate", "projects" vs "project")
        for (const mToken of memoryTokenSet) {
          if (
            (qToken.length > 4 && mToken.startsWith(qToken)) ||
            (mToken.length > 4 && qToken.startsWith(mToken))
          ) {
            score += 1.5;
            matchedKeywords.push(mToken);
            break;
          }
        }
      }
    }

    // 3. Category matching boost based on semantic query triggers
    const categoryTriggers = CATEGORY_TRIGGERS[memory.category] || [];
    for (const trigger of categoryTriggers) {
      if (queryLower.includes(trigger)) {
        score += 2.5;
        matchedKeywords.push(`category:${memory.category}`);
        break;
      }
    }

    // 4. Confidence weighting
    if (typeof memory.confidence === 'number' && memory.confidence > 0) {
      score *= (0.8 + 0.4 * Math.min(1, memory.confidence));
    }

    // 5. Recency boost (mild boost for memories created/updated recently)
    const ageDays = (Date.now() - new Date(memory.updatedAt || memory.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 7) {
      score += 1.0;
    } else if (ageDays <= 30) {
      score += 0.5;
    }

    return {
      score,
      matchedKeywords: Array.from(new Set(matchedKeywords)),
    };
  }

  /**
   * Retrieves relevant, active, user-approved memories for a user given the current message.
   * Only returns memories that have a positive relevance score above threshold.
   *
   * @param uid Authenticated user ID
   * @param currentMessage The current user message to score against
   * @param maxMemories Maximum number of relevant memories to return (default: 5)
   * @param maxChars Character budget for memories to avoid prompt bloat (default: 2000)
   */
  static async getRelevantMemories(
    uid: string,
    currentMessage: string,
    maxMemories = 5,
    maxChars = 2000
  ): Promise<UserMemory[]> {
    if (!uid || !currentMessage) {
      return [];
    }

    // Retrieve all active, approved memories
    const allMemories = await listMemories(uid);
    const activeMemories = allMemories.filter(
      (m) => m.status === 'active' && m.userApproved === true
    );

    if (activeMemories.length === 0) {
      return [];
    }

    // Score all memories against the message
    const scored: ScoredMemory[] = [];
    for (const memory of activeMemories) {
      const { score, matchedKeywords } = this.scoreMemory(currentMessage, memory);
      // Minimum relevance threshold: score >= 2.0 to ensure true relevance
      if (score >= 2.0) {
        scored.push({ memory, score, matchedKeywords });
      }
    }

    // Sort by relevance score descending
    scored.sort((a, b) => b.score - a.score);

    // Apply budget limits
    const selected: UserMemory[] = [];
    let totalChars = 0;

    for (const item of scored) {
      if (selected.length >= maxMemories) {
        break;
      }
      const charCount = item.memory.content.length + (item.memory.category?.length || 0);
      if (totalChars + charCount > maxChars) {
        break;
      }
      selected.push(item.memory);
      totalChars += charCount;
    }

    return selected;
  }
}
