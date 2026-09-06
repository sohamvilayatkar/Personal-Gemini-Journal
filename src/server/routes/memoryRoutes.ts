import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { MemoryExtractRateLimiter } from '../middleware/rateLimiter';
import {
  extractMemoriesRequestSchema,
  createMemoryRequestSchema,
  updateMemoryRequestSchema,
} from '../../shared/schemas/memorySchema';
import {
  createMemory,
  listMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  setMemoryStatus,
} from '../services/memoryService';
import {
  getConversation,
  getBoundedContext,
} from '../services/conversationService';
import { GeminiService } from '../services/geminiService';
import { MemorySafetyService } from '../services/memorySafety';

const router = Router();

// All memory routes require authenticated Firebase session
router.use(requireAuth);

/**
 * POST /api/memories/extract
 * Proposes candidate memories using Gemini structured extraction.
 *
 * CRITICAL ARCHITECTURAL MANDATE:
 * GEMINI MAY PROPOSE MEMORIES. GEMINI MUST NEVER HAVE AUTHORITY TO SAVE MEMORIES.
 * This endpoint NEVER persists to Firestore. It only returns candidates for user review.
 */
router.post(
  '/extract',
  MemoryExtractRateLimiter.middleware(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;

      // Anti-Tampering Check: reject client-supplied identity, role, or prompt fields
      const forbiddenFields = [
        'uid',
        'userId',
        'ownerUid',
        'history',
        'role',
        'systemPrompt',
        'custom memories',
        'memories',
      ];
      for (const field of forbiddenFields) {
        if (req.body && field in req.body) {
          res.status(400).json({
            error: `Unauthorized field in request: ${field}. Identity and authorization are derived solely from verified token.`,
            code: 'UNEXPECTED_IDENTITY_FIELD',
          });
          return;
        }
      }

      const parsed = extractMemoriesRequestSchema.parse(req.body);

      // Verify conversation ownership
      const conversation = await getConversation(verifiedUid, parsed.conversationId);
      if (!conversation) {
        res.status(404).json({
          error: 'Conversation not found or access denied.',
          code: 'CONVERSATION_NOT_FOUND',
        });
        return;
      }

      // Load bounded conversation turns (max 32 turns, max 24k chars)
      const history = await getBoundedContext(verifiedUid, parsed.conversationId, 32, 24000);
      if (history.length === 0) {
        res.status(400).json({
          error: 'Cannot extract memory candidates from an empty conversation.',
          code: 'CANNOT_EXTRACT_FROM_EMPTY_CONVERSATION',
        });
        return;
      }

      // Call Gemini for structured candidates
      try {
        const candidates = await GeminiService.extractMemoryCandidates({ history });
        res.status(200).json({
          candidates,
          conversationId: parsed.conversationId,
        });
      } catch (err: any) {
        res.status(500).json({
          error: 'Failed to extract memory candidates from reflection.',
          code: 'MEMORY_EXTRACTION_FAILED',
        });
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/memories
 * Saves an explicitly approved memory.
 *
 * Sequence:
 * 1. Authenticate via verified token (req.user.uid)
 * 2. Validate payload bounds & categories
 * 3. Verify source conversation ownership if supplied
 * 4. Apply sensitive data safety filters
 * 5. Persist under users/{verifiedUid}/memories with userApproved: true, status: 'active'
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;

    // Anti-Tampering Check: client cannot control internal server metadata
    const forbiddenFields = ['uid', 'userId', 'ownerUid', 'userApproved', 'createdAt', 'updatedAt', 'status'];
    for (const field of forbiddenFields) {
      if (req.body && field in req.body) {
        res.status(400).json({
          error: `Client cannot supply server-managed field: ${field}.`,
          code: 'UNEXPECTED_IDENTITY_FIELD',
        });
        return;
      }
    }

    const parsed = createMemoryRequestSchema.parse(req.body);

    // If sourceConversationId is supplied, verify it belongs to this user
    if (parsed.sourceConversationId) {
      const conversation = await getConversation(verifiedUid, parsed.sourceConversationId);
      if (!conversation) {
        res.status(404).json({
          error: 'Source conversation not found or access denied.',
          code: 'CONVERSATION_NOT_FOUND',
        });
        return;
      }
    }

    // Sensitive data check
    if (MemorySafetyService.containsSensitiveInformation(parsed.content)) {
      res.status(400).json({
        error: 'Memory content contains sensitive credentials, keys, or private financial data and cannot be stored.',
        code: 'SENSITIVE_CONTENT_REJECTED',
      });
      return;
    }

    const memory = await createMemory(verifiedUid, {
      content: parsed.content,
      category: parsed.category,
      sourceConversationId: parsed.sourceConversationId,
      confidence: parsed.confidence,
      provenance: parsed.provenance || 'user',
    });

    res.status(201).json({ memory });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/memories
 * Lists all memories for the authenticated user.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;
    const memories = await listMemories(verifiedUid);
    res.status(200).json({ memories });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/memories/:memoryId
 * Retrieves a single memory document for the authenticated user.
 */
router.get('/:memoryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;
    const memory = await getMemory(verifiedUid, req.params.memoryId);
    if (!memory) {
      res.status(404).json({
        error: 'Memory not found or access denied.',
        code: 'MEMORY_NOT_FOUND',
      });
      return;
    }
    res.status(200).json({ memory });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/memories/:memoryId
 * Updates memory content, category, or status.
 */
router.patch('/:memoryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;

    const forbiddenFields = ['id', 'uid', 'userId', 'ownerUid', 'createdAt', 'userApproved', 'provenance'];
    for (const field of forbiddenFields) {
      if (req.body && field in req.body) {
        res.status(400).json({
          error: `Cannot mutate immutable or server-managed field: ${field}.`,
          code: 'FORBIDDEN_FIELD_MUTATION',
        });
        return;
      }
    }

    const parsed = updateMemoryRequestSchema.parse(req.body);

    if (parsed.content && MemorySafetyService.containsSensitiveInformation(parsed.content)) {
      res.status(400).json({
        error: 'Memory content contains sensitive credentials, keys, or private financial data and cannot be stored.',
        code: 'SENSITIVE_CONTENT_REJECTED',
      });
      return;
    }

    const memory = await updateMemory(verifiedUid, req.params.memoryId, parsed);
    if (!memory) {
      res.status(404).json({
        error: 'Memory not found or access denied.',
        code: 'MEMORY_NOT_FOUND',
      });
      return;
    }

    res.status(200).json({ memory });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/memories/:memoryId
 * Deletes a memory document from the user's isolated subcollection.
 */
router.delete('/:memoryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;
    const deleted = await deleteMemory(verifiedUid, req.params.memoryId);
    if (!deleted) {
      res.status(404).json({
        error: 'Memory not found or access denied.',
        code: 'MEMORY_NOT_FOUND',
      });
      return;
    }
    res.status(200).json({ success: true, message: 'Memory deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/memories/:memoryId/disable
 * Disables a memory so it is excluded from future Gemini chat contexts.
 */
router.post('/:memoryId/disable', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;
    const memory = await setMemoryStatus(verifiedUid, req.params.memoryId, 'disabled');
    if (!memory) {
      res.status(404).json({
        error: 'Memory not found or access denied.',
        code: 'MEMORY_NOT_FOUND',
      });
      return;
    }
    res.status(200).json({ memory });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/memories/:memoryId/enable
 * Enables a memory so it is included in future Gemini chat contexts.
 */
router.post('/:memoryId/enable', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;
    const memory = await setMemoryStatus(verifiedUid, req.params.memoryId, 'active');
    if (!memory) {
      res.status(404).json({
        error: 'Memory not found or access denied.',
        code: 'MEMORY_NOT_FOUND',
      });
      return;
    }
    res.status(200).json({ memory });
  } catch (err) {
    next(err);
  }
});

export default router;
