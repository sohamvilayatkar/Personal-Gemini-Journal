/**
 * Centralized Authenticated API Client
 *
 * Guarantees that every protected API request to the trusted Express backend:
 * 1. Obtains a fresh cryptographic Firebase ID token via auth.currentUser.getIdToken()
 * 2. Properly injects the "Authorization: Bearer <Firebase ID token>" header
 * 3. Never caches ID tokens in React state or localStorage (which would cause expiration failures)
 * 4. Automatically detects 401 TOKEN_EXPIRED responses, triggers token refresh via Firebase SDK,
 *    and retries the protected request once
 * 5. Strictly keeps ID tokens out of URLs, query parameters, bodies, and prompts
 */

import { auth } from '../lib/firebaseClient';
import { AuthService } from './authService';

/**
 * Resolves a fresh, non-expired Firebase ID token.
 * If user session has expired, user.getIdToken() automatically queries Google Secure Token service.
 */
export async function getValidIdToken(forceRefresh = false): Promise<string> {
  const firebaseUser = auth?.currentUser;
  if (firebaseUser) {
    const token = await firebaseUser.getIdToken(forceRefresh);
    if (token) return token;
  }

  const fallbackToken = await AuthService.getIdToken(null, forceRefresh);
  if (fallbackToken) return fallbackToken;

  throw new Error('Authentication required. Please sign in to continue.');
}

export interface AuthenticatedFetchOptions extends RequestInit {
  token?: string;
  forceRefresh?: boolean;
}

/**
 * Core authenticatedFetch helper
 */
export async function authenticatedFetch(
  endpoint: string,
  options: AuthenticatedFetchOptions = {}
): Promise<Response> {
  const { token: explicitToken, forceRefresh = false, ...fetchOptions } = options;

  let activeToken = explicitToken || (await getValidIdToken(forceRefresh));

  const applyAuthHeaders = (tokenToUse: string): Headers => {
    const headers = new Headers(fetchOptions.headers || {});
    headers.set('Authorization', `Bearer ${tokenToUse}`);
    if (
      fetchOptions.body &&
      typeof fetchOptions.body === 'string' &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  };

  let response = await fetch(endpoint, {
    ...fetchOptions,
    headers: applyAuthHeaders(activeToken),
  });

  // If token expired on the backend, force a refresh and retry once
  if (response.status === 401 && !forceRefresh) {
    try {
      const cloned = response.clone();
      const errData = await cloned.json().catch(() => ({}));
      if (errData.code === 'TOKEN_EXPIRED') {
        activeToken = await getValidIdToken(true);
        response = await fetch(endpoint, {
          ...fetchOptions,
          headers: applyAuthHeaders(activeToken),
        });
      }
    } catch {
      // If retry fails, return the original response
    }
  }

  return response;
}

/**
 * JSON-parsing wrapper for authenticatedFetch with structured error extraction
 */
export async function authenticatedJsonFetch<T>(
  endpoint: string,
  options: AuthenticatedFetchOptions = {}
): Promise<T> {
  const response = await authenticatedFetch(endpoint, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
    const error: any = new Error(message);
    error.status = response.status;
    error.code = errorData.code || 'REQUEST_FAILED';
    error.details = errorData.details;
    if (errorData.retryAfter) {
      error.retryAfter = errorData.retryAfter;
    }
    throw error;
  }

  return response.json() as Promise<T>;
}
