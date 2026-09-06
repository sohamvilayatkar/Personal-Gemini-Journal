import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import {
  getTargetFirebaseProjectId,
  getTargetFirestoreDatabaseId,
  getAuthorizedServiceAccountEmail,
} from '../services/firebaseAdmin';

export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Safe logging in server process (no credentials logged)
  console.error(`[Error Handler] ${req.method} ${req.path}:`, err?.message || err);

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request payload format',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  // Handle Payload Too Large
  if (err.type === 'entity.too.large' || err.status === 413) {
    res.status(413).json({
      error: 'Request payload exceeds the maximum allowed limit (100KB).',
      code: 'PAYLOAD_TOO_LARGE',
    });
    return;
  }

  // Handle Firestore IAM Missing Permissions (Code 7 PERMISSION_DENIED)
  if (err.code === 7 || err.code === 'PERMISSION_DENIED' || String(err.message).includes('PERMISSION_DENIED')) {
    const sa = getAuthorizedServiceAccountEmail();
    const proj = getTargetFirebaseProjectId();
    const db = getTargetFirestoreDatabaseId();

    console.error(
      `\n[FIRESTORE IAM CONFIGURATION REQUIRED]\n` +
      `The Cloud Run service account (${sa}) lacks permissions on project "${proj}" (database: "${db}").\n` +
      `To resolve:\n` +
      `1. Open Google Cloud Console IAM: https://console.cloud.google.com/iam-admin/iam?project=${proj}\n` +
      `2. Click "Grant Access"\n` +
      `3. New Principal: ${sa}\n` +
      `4. Role: Cloud Datastore User (roles/datastore.user)\n`
    );

    res.status(503).json({
      error: 'Database permissions required: The backend service account needs the "Cloud Datastore User" role in Google Cloud Console IAM.',
      code: 'FIRESTORE_PERMISSION_DENIED',
      details: {
        serviceAccount: sa,
        targetProject: proj,
        targetDatabase: db,
        requiredRole: 'roles/datastore.user (Cloud Datastore User)',
        iamConsoleUrl: `https://console.cloud.google.com/iam-admin/iam?project=${proj}`,
      },
    });
    return;
  }

  // Generic Secure Internal Error (Stack traces and internal details suppressed)
  res.status(err.status || 500).json({
    error: err.status && err.status < 500 ? err.message : 'An internal error occurred. Please try again.',
    code: err.code || 'INTERNAL_SERVER_ERROR',
  });
};
