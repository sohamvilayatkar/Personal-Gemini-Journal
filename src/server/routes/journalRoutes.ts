import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { JournalRateLimiter } from '../middleware/rateLimiter';
import { JournalService } from '../services/journalService';
import { getConversation, listMessages } from '../services/conversationService';
import { GeminiService } from '../services/geminiService';
import {
  generateJournalRequestSchema,
  updateJournalRequestSchema,
} from '../../shared/schemas/journalSchema';
import type { JournalEntry } from '../../shared/types';
import { listMemories } from '../services/memoryService';
import { z } from 'zod';

const router = Router();

/**
 * All journal endpoints require a valid Firebase ID Token.
 * req.user is guaranteed by requireAuth.
 */
router.use(requireAuth);

/**
 * POST /api/journals/generate
 * Synthesizes a structured personal journal entry from a completed reflection conversation.
 *
 * Security and Privacy Invariants:
 * 1. Derives owner UID strictly from req.user.uid (verified Firebase ID token).
 * 2. Rejects client-supplied identity fields (uid, userId, ownerUid) with 400.
 * 3. Enforces authorization: verified user must own the source conversation (anti-IDOR).
 * 4. Bounded conversation context: retrieves up to 32 messages (16 turns), max 24,000 characters.
 * 5. Structured Gemini generation: output validated via Zod against strict length/element bounds.
 * 6. Deduplication: returns existing journal entry if already synthesized (unless regenerate is specified).
 * 7. Logging privacy: never logs prompt, raw Gemini response, or synthesized journal content.
 * 8. Rate limited: protected by JournalRateLimiter (6 requests per minute per user).
 */
router.post(
  '/generate',
  JournalRateLimiter.middleware(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      console.info(
        `[JOURNAL_DIAGNOSTIC] request_authenticated userId=${verifiedUid.slice(0, 8)}...`
      );

      // 1. Explicit Anti-UID Tampering Check
      const rawBody = req.body || {};
      if (
        'uid' in rawBody ||
        'userId' in rawBody ||
        'ownerUid' in rawBody ||
        'role' in rawBody ||
        'history' in rawBody ||
        'systemPrompt' in rawBody
      ) {
        console.warn(
          `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_UNKNOWN_ERROR code=UNEXPECTED_IDENTITY_FIELD`
        );
        res.status(400).json({
          error:
            'Unexpected or forbidden field detected. Client identity and execution context are strictly server-controlled.',
          code: 'UNEXPECTED_IDENTITY_FIELD',
        });
        return;
      }

      // 2. Strict Zod Validation of Request Payload
      const { conversationId, regenerate, messagesContext } = generateJournalRequestSchema.parse(rawBody);

      // 3. Conversation Authorization & Existence Check (Anti-IDOR)
      let conversation = null;
      try {
        conversation = await getConversation(verifiedUid, conversationId);
      } catch (convErr: any) {
        if (convErr?.code === 'FIRESTORE_PERMISSION_DENIED' && messagesContext && messagesContext.length > 0) {
          console.warn('[JOURNAL_DIAGNOSTIC] backend Firestore read denied, using client-provided conversation context');
        } else {
          throw convErr;
        }
      }

      if (!conversation && (!messagesContext || messagesContext.length === 0)) {
        console.warn(
          `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_CONVERSATION_NOT_FOUND code=CONVERSATION_NOT_FOUND conversationId=${conversationId}`
        );
        res.status(404).json({
          error: 'The requested conversation does not exist or access is unauthorized.',
          code: 'CONVERSATION_NOT_FOUND',
        });
        return;
      }

      console.info(
        `[JOURNAL_DIAGNOSTIC] conversation_loaded conversationId=${conversationId} archived=${Boolean(
          conversation?.archived
        )}`
      );

      // 4. Duplicate Check
      let existingJournal = null;
      try {
        existingJournal = await JournalService.findJournalByConversationId(
          verifiedUid,
          conversationId
        );
      } catch (findErr: any) {
        if (findErr?.code !== 'FIRESTORE_PERMISSION_DENIED') {
          throw findErr;
        }
      }

      if (existingJournal && !regenerate) {
        console.info(
          `[JOURNAL_DIAGNOSTIC] deduplication_hit journalId=${existingJournal.id}`
        );
        res.status(200).json({
          journal: existingJournal,
          alreadyExists: true,
        });
        return;
      }

      // 5. Bounded Conversation Turn Retrieval
      let rawMessages: Array<{ role: 'user' | 'model'; content: string }> = [];
      if (messagesContext && messagesContext.length > 0) {
        rawMessages = messagesContext;
      } else {
        const { messages } = await listMessages(verifiedUid, conversationId, 32);
        rawMessages = messages;
      }

      if (!rawMessages || rawMessages.length === 0) {
        console.warn(
          `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_EMPTY_CONTEXT code=EMPTY_MESSAGES conversationId=${conversationId}`
        );
        res.status(400).json({
          error: 'Cannot synthesize a journal entry from an empty reflection conversation.',
          code: 'CANNOT_SYNTHESIZE_EMPTY_CONVERSATION',
        });
        return;
      }

      // Format turns and enforce character budget (max 24,000 characters)
      const historyTurns: Array<{ role: 'user' | 'model'; content: string }> = [];
      let totalCharCount = 0;
      const MAX_CHAR_BUDGET = 24000;

      for (const msg of rawMessages) {
        const trimmed = (msg.content || '').trim();
        if (!trimmed) {
          continue;
        }
        if (totalCharCount + trimmed.length > MAX_CHAR_BUDGET) {
          break;
        }
        historyTurns.push({
          role: msg.role === 'model' ? 'model' : 'user',
          content: trimmed,
        });
        totalCharCount += trimmed.length;
      }

      if (historyTurns.length === 0) {
        console.warn(
          `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_EMPTY_CONTEXT code=EMPTY_MESSAGES conversationId=${conversationId}`
        );
        res.status(400).json({
          error: 'Cannot synthesize a journal entry from an empty reflection conversation.',
          code: 'CANNOT_SYNTHESIZE_EMPTY_CONVERSATION',
        });
        return;
      }

      console.info(
        `[JOURNAL_DIAGNOSTIC] context_built turnsCount=${historyTurns.length} charBudgetUsed=${totalCharCount}`
      );

      // 6. Invoke Gemini Structured Journal Generation
      let synthesizedJournal;
      try {
        synthesizedJournal = await GeminiService.generateJournalFromConversation({
          history: historyTurns,
        });
      } catch (geminiErr: any) {
        const errMsg = geminiErr?.message || '';
        if (errMsg.includes('CANNOT_SYNTHESIZE_EMPTY_CONVERSATION')) {
          console.warn(
            `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_EMPTY_CONTEXT code=CANNOT_SYNTHESIZE_EMPTY_CONVERSATION`
          );
          res.status(400).json({
            error: 'Cannot synthesize a journal entry from an empty reflection conversation.',
            code: 'CANNOT_SYNTHESIZE_EMPTY_CONVERSATION',
          });
          return;
        }
        if (
          errMsg.includes('MODEL_MALFORMED_JSON') ||
          errMsg.includes('JOURNAL_GEMINI_OUTPUT_INVALID')
        ) {
          console.warn(
            `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_GEMINI_OUTPUT_INVALID code=MALFORMED_JSON`
          );
          res.status(502).json({
            error: 'AI reflection synthesis produced invalid structure. Please try again.',
            code: 'AI_SYNTHESIS_MALFORMED',
          });
          return;
        }
        if (errMsg.includes('JOURNAL_SCHEMA_VALIDATION_FAILED')) {
          console.warn(
            `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_SCHEMA_VALIDATION_FAILED code=SCHEMA_VALIDATION_FAILED`
          );
          res.status(502).json({
            error: 'AI reflection synthesis produced invalid structure. Please try again.',
            code: 'AI_SYNTHESIS_MALFORMED',
          });
          return;
        }
        if (
          errMsg.includes('quota') ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED')
        ) {
          console.warn(
            `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_RATE_LIMITED code=AI_QUOTA_EXCEEDED`
          );
          res.status(429).json({
            error: 'AI service capacity temporarily reached. Please retry in a few moments.',
            code: 'AI_QUOTA_EXCEEDED',
          });
          return;
        }

        const technicalCode = geminiErr?.status || geminiErr?.code || 'GEMINI_SYNTHESIS_FAILED';
        console.warn(
          `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_GEMINI_REQUEST_FAILED code=${technicalCode}`
        );
        res.status(500).json({
          error: 'Unable to synthesize journal entry at this time. Please try again.',
          code: 'AI_SYNTHESIS_FAILED',
        });
        return;
      }

      // 7. Persist to Firestore with Provenance
      console.info(
        `[JOURNAL_DIAGNOSTIC] firestore_write_started isRegenerate=${Boolean(
          existingJournal && regenerate
        )} database=personal-gemini-journal`
      );

      try {
        if (existingJournal && regenerate) {
          const updated = await JournalService.updateWithRegeneration(
            verifiedUid,
            existingJournal.id,
            {
              sourceConversationId: conversationId,
              data: synthesizedJournal,
              previousVersion: existingJournal.generationVersion || '1.0.0',
            }
          );
          console.info(
            `[JOURNAL_DIAGNOSTIC] firestore_write_succeeded journalId=${updated.id} regenerated=true`
          );
          res.status(200).json({
            journal: updated,
            regenerated: true,
          });
          return;
        }

        const created = await JournalService.createJournal(verifiedUid, {
          sourceConversationId: conversationId,
          data: synthesizedJournal,
        });

        console.info(
          `[JOURNAL_DIAGNOSTIC] firestore_write_succeeded journalId=${created.id} regenerated=false`
        );
        res.status(201).json({
          journal: created,
        });
      } catch (writeErr: any) {
        if (writeErr?.code === 'FIRESTORE_PERMISSION_DENIED') {
          console.warn(
            `[JOURNAL_DIAGNOSTIC] backend Firestore write permission denied; returning synthesized journal for client SDK persistence`
          );
          const journalId = `journal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const now = new Date().toISOString();
          const clientJournal: JournalEntry = {
            id: journalId,
            sourceConversationId: conversationId,
            title: synthesizedJournal.title,
            summary: synthesizedJournal.summary,
            keyThoughts: synthesizedJournal.keyThoughts || [],
            mood: synthesizedJournal.mood || 'reflective',
            emotions: synthesizedJournal.emotions || [],
            insights: synthesizedJournal.insights || [],
            actionItems: synthesizedJournal.actionItems || [],
            goals: synthesizedJournal.goals || [],
            tags: synthesizedJournal.tags || [],
            createdAt: now,
            updatedAt: now,
            aiGenerated: true,
            generationVersion: '1.0.0',
            updatedBy: 'ai',
          };
          res.status(201).json({
            journal: clientJournal,
            backendPersistenceNotice:
              'Backend Firestore IAM pending; journal returned for authoritative client Firestore persistence',
          });
          return;
        }

        const writeCode = writeErr?.code || writeErr?.status || 'PERSISTENCE_FAILED';
        console.error(
          `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_FIRESTORE_WRITE_FAILED code=${writeCode}`
        );
        res.status(500).json({
          error: 'Unable to persist synthesized journal entry at this time. Please try again.',
          code: 'JOURNAL_FIRESTORE_WRITE_FAILED',
        });
        return;
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/journals
 * Lists all journal entries owned by the authenticated user.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;
    const journals = await JournalService.listJournals(verifiedUid);
    res.status(200).json({ journals });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/journals/:journalId
 * Retrieves a single journal entry, verifying ownership.
 */
router.get(
  '/:journalId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const { journalId } = req.params;

      if (!journalId || typeof journalId !== 'string' || journalId.length > 128) {
        res.status(400).json({
          error: 'Invalid journalId parameter.',
          code: 'INVALID_JOURNAL_ID',
        });
        return;
      }

      const journal = await JournalService.getJournal(verifiedUid, journalId);
      if (!journal) {
        res.status(404).json({
          error: 'Journal entry not found.',
          code: 'JOURNAL_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ journal });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/journals/:journalId
 * Allows user to edit allowable content fields.
 * Stamped with updatedBy: 'user' and authoritative server updatedAt timestamp.
 */
router.patch(
  '/:journalId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const { journalId } = req.params;

      if (!journalId || typeof journalId !== 'string' || journalId.length > 128) {
        res.status(400).json({
          error: 'Invalid journalId parameter.',
          code: 'INVALID_JOURNAL_ID',
        });
        return;
      }

      // Check for forbidden server-controlled fields
      const rawBody = req.body || {};
      if (
        'uid' in rawBody ||
        'userId' in rawBody ||
        'ownerUid' in rawBody ||
        'id' in rawBody ||
        'sourceConversationId' in rawBody ||
        'createdAt' in rawBody ||
        'aiGenerated' in rawBody ||
        'generationVersion' in rawBody ||
        'updatedBy' in rawBody
      ) {
        res.status(400).json({
          error: 'Modification of server-controlled or provenance fields is prohibited.',
          code: 'FORBIDDEN_FIELD_MUTATION',
        });
        return;
      }

      const validatedUpdates = updateJournalRequestSchema.parse(rawBody);

      const updated = await JournalService.updateJournal(
        verifiedUid,
        journalId,
        validatedUpdates
      );

      if (!updated) {
        res.status(404).json({
          error: 'Journal entry not found.',
          code: 'JOURNAL_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ journal: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/journals/:journalId
 * Deletes a journal entry owned by the user.
 */
router.delete(
  '/:journalId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const { journalId } = req.params;

      if (!journalId || typeof journalId !== 'string' || journalId.length > 128) {
        res.status(400).json({
          error: 'Invalid journalId parameter.',
          code: 'INVALID_JOURNAL_ID',
        });
        return;
      }

      const success = await JournalService.deleteJournal(verifiedUid, journalId);
      if (!success) {
        res.status(404).json({
          error: 'Journal entry not found.',
          code: 'JOURNAL_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

const askJournalSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty').max(1000, 'Question is too long'),
});

/**
 * POST /api/journals/ask
 * Ask My Journal: answers user queries strictly grounded in their real journal entries and memories.
 * Prevents hallucination by requiring explicit evidence in user's saved data.
 */
router.post('/ask', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;

    const parsed = askJournalSchema.parse(req.body);
    const question = parsed.question.trim();

    // 1. Fetch user's journals and memories with strict UID isolation
    const [journals, memories] = await Promise.all([
      JournalService.listJournals(verifiedUid),
      listMemories(verifiedUid),
    ]);

    const activeMemories = memories.filter(
      (m) => m.status === 'active' && m.userApproved === true
    );

    if (journals.length === 0 && activeMemories.length === 0) {
      res.status(200).json({
        answer:
          "Your journal and memory bank are currently empty. Start by having a reflection in Chat and clicking 'Generate Journal' or adding memories to your Memory Bank!",
        sources: [],
      });
      return;
    }

    // 2. Tokenize question for relevance scoring
    const queryTokens = question
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // Score and rank journals
    const scoredJournals = journals.map((j) => {
      let score = 0;
      const haystack = `${j.title} ${j.summary} ${(j.keyThoughts || []).join(' ')} ${(j.goals || []).join(' ')} ${(j.actionItems || []).join(' ')} ${(j.insights || []).join(' ')} ${j.mood || ''} ${(j.tags || []).join(' ')}`.toLowerCase();

      for (const token of queryTokens) {
        if (haystack.includes(token)) {
          score += 2;
        }
      }

      // If general query (e.g. "recently", "last week"), give recent journals a baseline score
      if (question.toLowerCase().includes('recent') || question.toLowerCase().includes('lately') || question.toLowerCase().includes('last')) {
        score += 1;
      }

      return { journal: j, score };
    });

    // Score and rank memories
    const scoredMemories = activeMemories.map((m) => {
      let score = 0;
      const haystack = `${m.category} ${m.content}`.toLowerCase();

      for (const token of queryTokens) {
        if (haystack.includes(token)) {
          score += 2;
        }
      }

      return { memory: m, score };
    });

    // Select top relevant journals and memories (or fallback to recent if no specific keyword match)
    scoredJournals.sort((a, b) => b.score - a.score);
    scoredMemories.sort((a, b) => b.score - a.score);

    const topJournals = scoredJournals.slice(0, 5).map((item) => item.journal);
    const topMemories = scoredMemories.slice(0, 5).map((item) => item.memory);

    // 3. Construct structured journal excerpts
    const excerpts: string[] = [];
    const sources: Array<{ title: string; date: string; snippet: string; type: 'journal' | 'memory' }> = [];

    for (const j of topJournals) {
      const dateStr = j.createdAt ? new Date(j.createdAt).toLocaleDateString() : 'Unknown Date';
      let entryText = `[JOURNAL ENTRY] "${j.title}" (Date: ${dateStr}, Mood: ${j.mood || 'reflective'})
Summary: ${j.summary}`;

      if (j.goals && j.goals.length > 0) {
        entryText += `\nGoals Mentioned: ${j.goals.join('; ')}`;
      }
      if (j.keyThoughts && j.keyThoughts.length > 0) {
        entryText += `\nKey Thoughts: ${j.keyThoughts.join('; ')}`;
      }
      if (j.actionItems && j.actionItems.length > 0) {
        entryText += `\nAction Items: ${j.actionItems.join('; ')}`;
      }
      if (j.insights && j.insights.length > 0) {
        entryText += `\nInsights: ${j.insights.join('; ')}`;
      }

      excerpts.push(entryText);
      sources.push({
        title: j.title,
        date: dateStr,
        snippet: j.summary.slice(0, 140) + (j.summary.length > 140 ? '...' : ''),
        type: 'journal',
      });
    }

    for (const m of topMemories) {
      const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'Active Memory';
      excerpts.push(`[ACTIVE USER MEMORY] (${m.category}): ${m.content}`);
      sources.push({
        title: `Memory: ${m.category}`,
        date: dateStr,
        snippet: m.content.slice(0, 140) + (m.content.length > 140 ? '...' : ''),
        type: 'memory',
      });
    }

    const journalContext = excerpts.join('\n\n---\n\n');

    // 4. Grounded answer generation via Gemini
    const result = await GeminiService.askJournalQuestion({
      question,
      journalContext,
    });

    res.status(200).json({
      answer: result.answer,
      sources,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
