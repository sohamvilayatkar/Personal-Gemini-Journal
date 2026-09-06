import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/auth/verify
 * Tests cryptographic JWT verification on the trusted backend.
 */
router.get('/verify', requireAuth, (req: Request, res: Response) => {
  const verifiedUser = req.user!;
  res.json({
    authenticated: true,
    uid: verifiedUser.uid,
    email: verifiedUser.email || null,
    provider: verifiedUser.firebase?.sign_in_provider || 'unknown',
  });
});

export default router;
