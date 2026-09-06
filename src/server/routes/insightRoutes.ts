/**
 * Insight and Weekly AI Reflection Routes
 *
 * All endpoints require a valid Firebase ID token verified via requireAuth.
 * All operations are strictly tenant-isolated to req.user.uid.
 *
 * Endpoints:
 * - POST /api/insights/generate        : Generates cross-cutting insights from recent journals & memories.
 * - GET  /api/insights                 : Lists active/dismissed insights.
 * - GET  /api/insights/:insightId      : Retrieves a specific insight.
 * - PATCH /api/insights/:insightId     : Updates insight status ('active' | 'dismissed').
 * - DELETE /api/insights/:insightId    : Deletes an insight.
 * - POST /api/insights/weekly          : Generates or retrieves a weekly reflection.
 * - GET  /api/insights/weekly          : Lists weekly reflections.
 * - GET  /api/insights/weekly/:id      : Retrieves a specific weekly reflection.
 * - DELETE /api/insights/weekly/:id    : Deletes a weekly reflection.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  InsightGenerateRateLimiter,
  WeeklyReflectionRateLimiter,
} from '../middleware/rateLimiter';
import {
  generateInsightsRequestSchema,
  generateWeeklyReflectionRequestSchema,
  insightStatusSchema,
  insightTypeSchema,
} from '../../shared/schemas/insightSchema';
import { InsightService } from '../services/insightService';

const router = Router();

// All insight and weekly reflection routes require an authenticated Firebase user
router.use(requireAuth);

/**
 * Anti-Tampering Check helper for insight routes
 */
function checkForbiddenFields(req: Request, res: Response): boolean {
  const forbiddenFields = ['uid', 'userId', 'ownerUid', 'journals', 'memories'];
  for (const field of forbiddenFields) {
    if (req.body && field in req.body) {
      res.status(400).json({
        error: `Unauthorized field in request: ${field}. Identity and authorization are derived solely from verified token.`,
        code: 'UNEXPECTED_IDENTITY_FIELD',
      });
      return true;
    }
  }
  return false;
}

// ==================== WEEKLY REFLECTIONS (must precede :insightId parameterized routes) ====================

/**
 * POST /api/insights/weekly
 * Generates or retrieves a weekly reflection for the authenticated user.
 */
router.post(
  '/weekly',
  WeeklyReflectionRateLimiter.middleware(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (checkForbiddenFields(req, res)) return;

      const parseResult = generateWeeklyReflectionRequestSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Invalid weekly reflection request payload.',
          code: 'INVALID_REQUEST',
          details: parseResult.error.issues,
        });
        return;
      }

      const verifiedUid = req.user!.uid;
      const reflection = await InsightService.generateWeeklyReflection(
        verifiedUid,
        parseResult.data
      );

      res.status(200).json({ reflection });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * GET /api/insights/weekly
 * Lists all weekly reflections for the authenticated user.
 */
router.get(
  '/weekly',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const reflections = await InsightService.listWeeklyReflections(verifiedUid);
      res.status(200).json({ reflections });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * GET /api/insights/weekly/:reflectionId
 * Retrieves a specific weekly reflection.
 */
router.get(
  '/weekly/:reflectionId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const reflection = await InsightService.getWeeklyReflection(
        verifiedUid,
        req.params.reflectionId
      );

      if (!reflection) {
        res.status(404).json({
          error: 'Weekly reflection not found.',
          code: 'REFLECTION_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ reflection });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * DELETE /api/insights/weekly/:reflectionId
 * Deletes a weekly reflection.
 */
router.delete(
  '/weekly/:reflectionId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const success = await InsightService.deleteWeeklyReflection(
        verifiedUid,
        req.params.reflectionId
      );

      if (!success) {
        res.status(404).json({
          error: 'Weekly reflection not found or could not be deleted.',
          code: 'REFLECTION_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ success: true, deletedId: req.params.reflectionId });
    } catch (err: any) {
      next(err);
    }
  }
);

// ==================== PERSONAL INSIGHTS ====================

/**
 * POST /api/insights/generate
 * Generates personal AI insights from recent journals and approved memories.
 */
router.post(
  '/generate',
  InsightGenerateRateLimiter.middleware(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (checkForbiddenFields(req, res)) return;

      const parseResult = generateInsightsRequestSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Invalid insight generation request payload.',
          code: 'INVALID_REQUEST',
          details: parseResult.error.issues,
        });
        return;
      }

      const verifiedUid = req.user!.uid;
      const insights = await InsightService.generateInsights(verifiedUid, parseResult.data);

      res.status(200).json({ insights });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * GET /api/insights
 * Lists insights for the authenticated user, with optional filtering by status or type.
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const status = req.query.status as string | undefined;
      const type = req.query.type as string | undefined;

      const validatedStatus = status ? insightStatusSchema.safeParse(status) : null;
      const validatedType = type ? insightTypeSchema.safeParse(type) : null;

      const filters: any = {};
      if (validatedStatus && validatedStatus.success) {
        filters.status = validatedStatus.data;
      }
      if (validatedType && validatedType.success) {
        filters.type = validatedType.data;
      }

      const insights = await InsightService.listInsights(verifiedUid, filters);
      res.status(200).json({ insights });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * GET /api/insights/:insightId
 * Retrieves a specific insight owned by the authenticated user.
 */
router.get(
  '/:insightId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const insight = await InsightService.getInsight(verifiedUid, req.params.insightId);

      if (!insight) {
        res.status(404).json({
          error: 'Insight not found.',
          code: 'INSIGHT_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ insight });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * PATCH /api/insights/:insightId
 * Updates the status of an insight ('active' | 'dismissed').
 */
router.patch(
  '/:insightId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (checkForbiddenFields(req, res)) return;

      const patchSchema = z.object({
        status: insightStatusSchema,
      });

      const parseResult = patchSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Invalid patch payload. Expected { status: "active" | "dismissed" }',
          code: 'INVALID_REQUEST',
          details: parseResult.error.issues,
        });
        return;
      }

      const verifiedUid = req.user!.uid;
      const updated = await InsightService.updateInsightStatus(
        verifiedUid,
        req.params.insightId,
        parseResult.data.status
      );

      if (!updated) {
        res.status(404).json({
          error: 'Insight not found.',
          code: 'INSIGHT_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ insight: updated });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * DELETE /api/insights/:insightId
 * Deletes an insight owned by the authenticated user.
 */
router.delete(
  '/:insightId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verifiedUid = req.user!.uid;
      const success = await InsightService.deleteInsight(verifiedUid, req.params.insightId);

      if (!success) {
        res.status(404).json({
          error: 'Insight not found or could not be deleted.',
          code: 'INSIGHT_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ success: true, deletedId: req.params.insightId });
    } catch (err: any) {
      next(err);
    }
  }
);

export default router;
