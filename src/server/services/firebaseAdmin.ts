/**
 * Server-Only Firebase Admin Initialization
 *
 * Runs strictly within the trusted backend process.
 * In Cloud Run, it automatically leverages Google Application Default Credentials (ADC)
 * associated with the service account.
 *
 * Never requires or uses hardcoded service account JSON keys.
 */

import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;
let mockAuth: any = null;
let mockFirestore: any = null;

export const setMockAdminAuth = (mock: any) => {
  mockAuth = mock;
};

export const setMockAdminFirestore = (mock: any) => {
  mockFirestore = mock;
};

export const getTargetFirebaseProjectId = (): string => {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    'quick-district-507517-f7'
  );
};

export const getTargetFirestoreDatabaseId = (): string => {
  return (
    process.env.FIRESTORE_DATABASE_ID ||
    process.env.VITE_FIRESTORE_DATABASE_ID ||
    'personal-gemini-journal'
  );
};

export const getAuthorizedServiceAccountEmail = (): string => {
  return (
    process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL ||
    'ais-sandbox@ais-asia-southeast1-9627f88e7f.iam.gserviceaccount.com'
  );
};

export const logFirebaseConfigurationDiagnostics = () => {
  const projectId = getTargetFirebaseProjectId();
  const databaseId = getTargetFirestoreDatabaseId();
  const sa = getAuthorizedServiceAccountEmail();
  console.log(`[Firebase Configuration] Project: ${projectId} | Firestore Database: ${databaseId} | Service Account: ${sa}`);
};

export const resetAdminAppForTesting = () => {
  adminApp = null;
  mockAuth = null;
  mockFirestore = null;
};

export const getFirebaseAdmin = (): App => {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const projectId = getTargetFirebaseProjectId();

  try {
    // 1. If explicit service account key is injected via Secret Manager / environment:
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        adminApp = initializeApp({
          credential: cert(creds),
          projectId: creds.project_id || projectId,
        });
        return adminApp;
      } catch (parseErr: any) {
        console.error('[Firebase Admin] Warning: Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:', parseErr.message);
      }
    }

    // 2. In production or Cloud Run with ADC:
    // Explicitly pass the target Firebase projectId. This ensures verifyIdToken validates
    // against the client-facing Firebase project audience (e.g. quick-district-507517-f7)
    // rather than the underlying Google Cloud hosting container's infrastructure project.
    adminApp = initializeApp({ projectId });
    return adminApp;
  } catch (err: any) {
    try {
      adminApp = initializeApp();
      return adminApp;
    } catch {
      throw new Error(`Failed to initialize Firebase Admin SDK: ${err?.message}`);
    }
  }
};

export const getAdminAuth = (): Auth => {
  if (mockAuth) {
    return mockAuth;
  }
  const app = getFirebaseAdmin();
  return getAuth(app);
};

export const getAdminFirestore = (): Firestore => {
  if (mockFirestore) {
    return mockFirestore;
  }
  const app = getFirebaseAdmin();
  const databaseId = getTargetFirestoreDatabaseId();
  return getFirestore(app, databaseId);
};

