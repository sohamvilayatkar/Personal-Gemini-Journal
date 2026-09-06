/**
 * Safe Firebase Client Initialization
 *
 * NOTE: The VITE_FIREBASE_* variables are public Firebase client configuration
 * values used to route requests to the Google Firebase project. They are safe
 * to expose in browser bundles and do NOT provide administrative privileges.
 *
 * Privileged credentials (Gemini AI key, Firebase Admin Service Account)
 * are strictly held server-side and NEVER exposed via VITE_ variables.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const rawApiKey = import.meta.env.VITE_FIREBASE_API_KEY || '';
const rawProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
const rawAuthDomain =
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
  (rawProjectId ? `${rawProjectId}.firebaseapp.com` : '');

const firebaseConfig = {
  apiKey: rawApiKey,
  authDomain: rawAuthDomain,
  projectId: rawProjectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (rawProjectId ? `${rawProjectId}.appspot.com` : ''),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const getClientFirestoreDatabaseId = (): string => {
  return (
    import.meta.env.VITE_FIRESTORE_DATABASE_ID ||
    'personal-gemini-journal'
  );
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== 'demo-api-key'
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app, getClientFirestoreDatabaseId());
} else {
  // If not configured, initialize with a dummy fallback in dev to prevent app crashing before config is provided
  // Note: in dev, we clearly warn the user in the UI banner
  try {
    if (getApps().length === 0 && typeof window !== 'undefined') {
      app = initializeApp({
        apiKey: 'demo-api-key',
        authDomain: 'demo-project.firebaseapp.com',
        projectId: 'demo-project',
      });
      auth = getAuth(app);
      firestore = getFirestore(app, getClientFirestoreDatabaseId());
    }
  } catch {
    // Graceful fallback
  }
}

export { app, auth, firestore };
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
