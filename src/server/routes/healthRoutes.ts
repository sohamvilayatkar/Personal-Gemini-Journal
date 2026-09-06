import { Router, type Request, type Response } from 'express';
import type { HealthResponse } from '../../shared/types';
import { getTargetFirebaseProjectId, getTargetFirestoreDatabaseId } from '../services/firebaseAdmin';

const router = Router();

router.get('/', (_req: Request, res: Response<HealthResponse>) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    firebaseProject: getTargetFirebaseProjectId(),
    firestoreDatabase: getTargetFirestoreDatabaseId(),
  });
});

export default router;
