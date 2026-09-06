import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createConversation,
  listConversations,
  getConversation,
  listMessages,
  deleteConversationRecursively,
} from '../services/conversationService';
import { createConversationInputSchema } from '../../shared/schemas/conversationSchema';

const router = Router();

/**
 * All conversation endpoints require a valid Firebase ID Token.
 * req.user is guaranteed by requireAuth.
 */
router.use(requireAuth);

/**
 * POST /api/conversations
 * Creates a new conversation session for the authenticated user.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;
    const parsed = createConversationInputSchema.parse(req.body || {});

    const conversation = await createConversation(verifiedUid, parsed.title);
    res.status(201).json({ conversation });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/conversations
 * Lists the authenticated user's conversations ordered by updatedAt DESC.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;
    const limitQuery = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const conversations = await listConversations(verifiedUid, limitQuery);
    res.status(200).json({ conversations });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/conversations/:conversationId
 * Retrieves a single conversation, verifying that it belongs to the authenticated user.
 */
router.get('/:conversationId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId } = req.params;
    if (!conversationId || typeof conversationId !== 'string' || conversationId.length > 128) {
      res.status(400).json({
        error: 'Invalid conversationId parameter.',
        code: 'INVALID_CONVERSATION_ID',
      });
      return;
    }

    const verifiedUid = req.user!.uid;
    const conversation = await getConversation(verifiedUid, conversationId.trim());

    if (!conversation) {
      res.status(404).json({
        error: 'Conversation not found.',
        code: 'CONVERSATION_NOT_FOUND',
      });
      return;
    }

    res.status(200).json({ conversation });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/conversations/:conversationId/messages
 * Retrieves ordered messages for a conversation belonging to the authenticated user.
 */
router.get('/:conversationId/messages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId } = req.params;
    if (!conversationId || typeof conversationId !== 'string' || conversationId.length > 128) {
      res.status(400).json({
        error: 'Invalid conversationId parameter.',
        code: 'INVALID_CONVERSATION_ID',
      });
      return;
    }

    const verifiedUid = req.user!.uid;
    const limitQuery = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const result = await listMessages(verifiedUid, conversationId.trim(), limitQuery);

    if (result.notFound) {
      res.status(404).json({
        error: 'Conversation not found.',
        code: 'CONVERSATION_NOT_FOUND',
      });
      return;
    }

    res.status(200).json({ messages: result.messages });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/conversations/:conversationId
 * Securely and recursively deletes a conversation and all descendant messages.
 */
router.delete('/:conversationId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId } = req.params;
    if (!conversationId || typeof conversationId !== 'string' || conversationId.length > 128) {
      res.status(400).json({
        error: 'Invalid conversationId parameter.',
        code: 'INVALID_CONVERSATION_ID',
      });
      return;
    }

    const verifiedUid = req.user!.uid;
    const result = await deleteConversationRecursively(verifiedUid, conversationId.trim());

    if (result.notFound) {
      res.status(404).json({
        error: 'Conversation not found or access denied.',
        code: 'CONVERSATION_NOT_FOUND',
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      message: 'Conversation and all nested messages successfully deleted.',
      conversationId: conversationId.trim(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
