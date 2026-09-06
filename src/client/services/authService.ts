import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { auth, googleAuthProvider, isFirebaseConfigured } from '../lib/firebaseClient';

const DEMO_USER_KEY = 'pgj_demo_user_session';

/**
 * Maps raw Firebase and network errors to clean, actionable user messages
 */
export function formatAuthError(err: any): string {
  if (!err) return 'An unexpected authentication error occurred.';
  const code = err.code || '';
  const msg = err.message || '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please provide a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
      return 'No account exists with this email address. Please create an account.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please verify your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/popup-blocked':
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site or use email/password sign-in.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before completing authentication.';
    case 'auth/cancelled-popup-request':
      return 'A previous sign-in attempt was in progress and was cancelled.';
    case 'auth/unauthorized-domain':
      return `This domain (${typeof window !== 'undefined' ? window.location.hostname : 'current'}) is not authorized in Firebase. Please add it to Firebase Console > Authentication > Settings > Authorized Domains.`;
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase Console. Go to Authentication > Sign-in method to enable it.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Access is temporarily restricted. Please try again later.';
    default:
      if (msg.includes('Firebase Client is not configured')) {
        return msg;
      }
      return msg || 'Authentication failed. Please check your details and try again.';
  }
}

/**
 * Constructs a mock Firebase User object for safe preview/demo execution
 */
function createMockUser(email: string, displayName: string, isGoogle = false): User {
  const cleanEmail = email.toLowerCase().trim();
  const simpleHash = Math.abs(
    cleanEmail.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  ).toString(36);
  const uid = `demo_user_${simpleHash}`;

  const mockUser: any = {
    uid,
    email: cleanEmail,
    displayName: displayName || cleanEmail.split('@')[0],
    photoURL: isGoogle ? 'https://lh3.googleusercontent.com/a/default-user' : null,
    emailVerified: true,
    isAnonymous: false,
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString(),
    },
    providerData: [
      {
        providerId: isGoogle ? 'google.com' : 'password',
        uid,
        displayName: displayName || cleanEmail.split('@')[0],
        email: cleanEmail,
        phoneNumber: null,
        photoURL: isGoogle ? 'https://lh3.googleusercontent.com/a/default-user' : null,
      },
    ],
    refreshToken: 'demo-refresh-token',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => `demo_token_${uid}`,
    getIdTokenResult: async () => ({
      token: `demo_token_${uid}`,
      signInProvider: isGoogle ? 'google.com' : 'password',
      claims: { uid },
      authTime: new Date().toISOString(),
      issuedAtTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 3600000).toISOString(),
    }),
    reload: async () => {},
    toJSON: () => ({ uid, email: cleanEmail, displayName }),
    phoneNumber: null,
    providerId: 'firebase',
  };

  return mockUser as User;
}

// Memory listener list for demo state changes
type AuthCallback = (user: User | null) => void;
const listeners: Set<AuthCallback> = new Set();

function notifyListeners(user: User | null) {
  listeners.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.error('Error in auth state listener:', e);
    }
  });
}

function getStoredDemoUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return createMockUser(data.email, data.displayName, data.isGoogle);
  } catch {
    return null;
  }
}

function setStoredDemoUser(email: string, displayName: string, isGoogle = false): User {
  const user = createMockUser(email, displayName, isGoogle);
  try {
    localStorage.setItem(
      DEMO_USER_KEY,
      JSON.stringify({ email: user.email, displayName: user.displayName, isGoogle })
    );
  } catch {
    // Ignore storage issues
  }
  notifyListeners(user);
  return user;
}

function clearStoredDemoUser() {
  try {
    localStorage.removeItem(DEMO_USER_KEY);
  } catch {
    // Ignore
  }
  notifyListeners(null);
}

export class AuthService {
  /**
   * Listen to authentication state changes
   */
  static onAuthStateChange(callback: (user: User | null) => void): Unsubscribe {
    listeners.add(callback);

    // If real Firebase is initialized, register the native auth listener
    let firebaseUnsub: Unsubscribe | null = null;
    if (auth && isFirebaseConfigured) {
      firebaseUnsub = onAuthStateChanged(auth, (user) => {
        if (user) {
          callback(user);
        } else {
          // Check if fallback demo user is active
          const demo = getStoredDemoUser();
          callback(demo);
        }
      });
    } else {
      // In demo/preview mode, notify immediately with stored demo user
      const demo = getStoredDemoUser();
      setTimeout(() => callback(demo), 0);
    }

    return () => {
      listeners.delete(callback);
      if (firebaseUnsub) firebaseUnsub();
    };
  }

  /**
   * Sign In with Google
   */
  static async signInWithGoogle(): Promise<User> {
    if (auth && isFirebaseConfigured) {
      try {
        const result = await signInWithPopup(auth, googleAuthProvider);
        return result.user;
      } catch (err: any) {
        throw new Error(formatAuthError(err));
      }
    }

    // In preview/demo mode without Firebase credentials, provide instantaneous demo Google identity
    const demoEmail = 'sohamvilayatkar@gmail.com';
    const demoName = 'Soham Vilayatkar';
    const demoUser = setStoredDemoUser(demoEmail, demoName, true);
    return demoUser;
  }

  /**
   * Sign In with Email and Password
   */
  static async signInWithEmail(email: string, password: string): Promise<User> {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password) {
      throw new Error('Please enter your password.');
    }

    if (auth && isFirebaseConfigured) {
      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        return cred.user;
      } catch (err: any) {
        throw new Error(formatAuthError(err));
      }
    }

    // Preview / demo mode fallback
    const demoName = cleanEmail.split('@')[0];
    const demoUser = setStoredDemoUser(cleanEmail, demoName, false);
    return demoUser;
  }

  /**
   * Register with Email, Password, and Display Name
   */
  static async registerWithEmail(
    email: string,
    password: string,
    displayName: string
  ): Promise<User> {
    const cleanEmail = email.trim();
    const cleanName = displayName.trim();

    if (!cleanName) {
      throw new Error('Please enter your full name.');
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    if (auth && isFirebaseConfigured) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (cleanName && cred.user) {
          try {
            await updateProfile(cred.user, { displayName: cleanName });
          } catch {
            // Non-fatal
          }
        }
        return cred.user;
      } catch (err: any) {
        throw new Error(formatAuthError(err));
      }
    }

    // Preview / demo mode fallback
    const demoUser = setStoredDemoUser(cleanEmail, cleanName, false);
    return demoUser;
  }

  /**
   * Send Password Reset Email
   */
  static async sendPasswordReset(email: string): Promise<void> {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }

    if (auth && isFirebaseConfigured) {
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
        return;
      } catch (err: any) {
        throw new Error(formatAuthError(err));
      }
    }

    // Preview mode simulation
    return;
  }

  /**
   * Sign Out
   */
  static async signOut(): Promise<void> {
    clearStoredDemoUser();
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch {
        // Safe fallback
      }
    }
  }

  /**
   * Get cryptographic ID token for API requests
   */
  static async getIdToken(user?: User | null, forceRefresh = false): Promise<string | null> {
    const targetUser = user || auth?.currentUser || getStoredDemoUser();
    if (!targetUser) return null;
    return await targetUser.getIdToken(forceRefresh);
  }
}

