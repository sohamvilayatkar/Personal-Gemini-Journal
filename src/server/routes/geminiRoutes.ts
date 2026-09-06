import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { ChatRateLimiter } from '../middleware/rateLimiter';
import { chatRequestSchema } from '../../shared/schemas/conversationSchema';
import { GeminiService } from '../services/geminiService';
import {
  getConversation,
  addMessage,
  getBoundedContext,
} from '../services/conversationService';
import { MemoryRetrievalService } from '../services/memoryRetrievalService';

const router = Router();

/**
 * All chat requests require valid Firebase ID Token and pass through the Rate Limiter.
 */
router.use(requireAuth);
router.use(ChatRateLimiter.middleware());

/**
 * POST /api/chat
 * Secure, multi-turn AI reflection chat.
 *
 * Sequence:
 * 1. Verify user identity strictly via verified token (req.user.uid)
 * 2. Validate payload bounds using strict Zod schema
 * 3. Verify conversation exists and belongs to authenticated user
 * 4. Persist user message to Firestore subcollection
 * 5. Load bounded, chronological conversation context
 * 6. Invoke Gemini (streaming SSE by default or non-streaming if stream: false)
 * 7. If successful: persist complete model response, update conversation metadata
 * 8. If aborted or failed: user message is retained, no partial/fake model message is saved
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verifiedUid = req.user!.uid;

    // Strict runtime input validation
    const parsed = chatRequestSchema.parse(req.body);

    // Verify conversation ownership
    const conversation = await getConversation(verifiedUid, parsed.conversationId);
    if (!conversation) {
      res.status(404).json({
        error: 'Conversation not found or access denied.',
        code: 'CONVERSATION_NOT_FOUND',
      });
      return;
    }

    // Step 1: Persist user message before contacting Gemini
    const userMessage = await addMessage(verifiedUid, parsed.conversationId, 'user', parsed.message);

    // Step 2: Load bounded conversation context (max 16 turns, max 24k chars)
    const history = await getBoundedContext(verifiedUid, parsed.conversationId, 16, 24000);

    // Step 3: Retrieve relevant active memories matched to the current user message
    const relevantMemories = await MemoryRetrievalService.getRelevantMemories(
      verifiedUid,
      parsed.message,
      5,
      2000
    );

    const isStreaming = parsed.stream !== false;

    if (isStreaming) {
      // Configure Server-Sent Events (SSE) headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let clientAborted = false;
      req.on('close', () => {
        clientAborted = true;
      });

      // Send initial acknowledgement event with retrieved memories metadata
      res.write(
        `data: ${JSON.stringify({
          type: 'start',
          conversationId: parsed.conversationId,
          userMessage,
          matchedMemoriesCount: relevantMemories.length,
          matchedMemories: relevantMemories.map((m) => ({
            id: m.id,
            category: m.category,
            content: m.content,
          })),
        })}\n\n`
      );

      let fullReply = '';

      try {
        for await (const chunk of GeminiService.chatStream({ history, memories: relevantMemories })) {
          if (clientAborted) {
            break;
          }
          fullReply += chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
        }

        // Only persist model message if client did not abort and text was produced
        if (!clientAborted && fullReply.trim().length > 0) {
          const modelMessage = await addMessage(
            verifiedUid,
            parsed.conversationId,
            'model',
            fullReply.trim()
          );

          res.write(
            `data: ${JSON.stringify({
              type: 'done',
              reply: fullReply.trim(),
              modelMessage,
              matchedMemoriesCount: relevantMemories.length,
            })}\n\n`
          );
        }
        res.end();
      } catch (geminiError: any) {
        // Safe failure reporting: User message stays saved, model message not created
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: 'AI reflection generation encountered an error. Please try again.',
            code: 'AI_GENERATION_FAILED',
          })}\n\n`
        );
        res.end();
      }
    } else {
      // Non-streaming fallback
      try {
        const { reply } = await GeminiService.chat({ history, memories: relevantMemories });
        const modelMessage = await addMessage(
          verifiedUid,
          parsed.conversationId,
          'model',
          reply.trim()
        );

        res.status(200).json({
          reply: reply.trim(),
          conversationId: parsed.conversationId,
          userMessage,
          modelMessage,
          matchedMemoriesCount: relevantMemories.length,
          matchedMemories: relevantMemories.map((m) => ({
            id: m.id,
            category: m.category,
            content: m.content,
          })),
        });
      } catch (geminiError: any) {
        res.status(500).json({
          error: 'AI reflection generation failed. Please try again.',
          code: 'AI_GENERATION_FAILED',
        });
      }
    }
  } catch (err) {
    next(err);
  }
});

export default router;
