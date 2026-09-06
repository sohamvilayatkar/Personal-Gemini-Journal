import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

/**
 * In-Memory Sliding Window Rate Limiter for AI Chat Endpoints
 *
 * Scoped by authenticated UID (derived from req.user.uid).
 * Prevents prompt flooding, resource exhaustion, and denial-of-wallet attacks.
 *
 * Production Architectural Note:
 * This in-memory limiter operates on the local process. For multi-replica
 * Cloud Run deployments, back this interface with a distributed cache
 * such as Google Cloud Memorystore (Redis).
 */
export class ChatRateLimiter {
  private static userWindows = new Map<string, RateLimitRecord>();
  private static readonly WINDOW_MS = 60 * 1000; // 1 minute window
  private static readonly MAX_REQUESTS_PER_WINDOW = 20; // 20 requests per minute

  /**
   * Cleans up expired entries periodically to prevent memory leaks
   */
  static cleanup(): void {
    const now = Date.now();
    for (const [uid, record] of this.userWindows.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);
      if (record.timestamps.length === 0) {
        this.userWindows.delete(uid);
      }
    }
  }

  /**
   * Express middleware enforcing rate limit on authenticated requests
   */
  static middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const uid = req.user?.uid;
      if (!uid) {
        // If unauthenticated, requireAuth will catch it; but if somehow invoked without UID, reject
        res.status(401).json({
          error: 'Authentication required for rate limiting verification.',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const now = Date.now();
      let record = this.userWindows.get(uid);

      if (!record) {
        record = { timestamps: [] };
        this.userWindows.set(uid, record);
      }

      // Filter timestamps within the current sliding window
      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);

      if (record.timestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
        const oldest = record.timestamps[0];
        const retryAfterSec = Math.ceil((this.WINDOW_MS - (now - oldest)) / 1000);

        res.setHeader('Retry-After', retryAfterSec.toString());
        res.status(429).json({
          error: 'Rate limit exceeded. Please pause before sending another message.',
          code: 'RATE_LIMITED',
          retryAfter: retryAfterSec,
        });
        return;
      }

      // Record this request
      record.timestamps.push(now);
      next();
    };
  }

  /**
   * Reset helper for unit testing
   */
  static reset(): void {
    this.userWindows.clear();
  }
}

/**
 * Sliding Window Rate Limiter for AI Journal Synthesis Endpoints
 *
 * Scoped by authenticated UID (derived from req.user.uid).
 * Restricts heavier AI summarization operations to 6 requests per minute.
 */
export class JournalRateLimiter {
  private static userWindows = new Map<string, RateLimitRecord>();
  private static readonly WINDOW_MS = 60 * 1000; // 1 minute window
  private static readonly MAX_REQUESTS_PER_WINDOW = 6; // 6 requests per minute

  static cleanup(): void {
    const now = Date.now();
    for (const [uid, record] of this.userWindows.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);
      if (record.timestamps.length === 0) {
        this.userWindows.delete(uid);
      }
    }
  }

  static middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({
          error: 'Authentication required for rate limiting verification.',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const now = Date.now();
      let record = this.userWindows.get(uid);

      if (!record) {
        record = { timestamps: [] };
        this.userWindows.set(uid, record);
      }

      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);

      if (record.timestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
        const oldest = record.timestamps[0];
        const retryAfterSec = Math.ceil((this.WINDOW_MS - (now - oldest)) / 1000);

        console.warn(
          `[JOURNAL_DIAGNOSTIC] failure category=JOURNAL_RATE_LIMITED code=RATE_LIMITED user=${uid.slice(
            0,
            8
          )}... retryAfterSec=${retryAfterSec}`
        );

        res.setHeader('Retry-After', retryAfterSec.toString());
        res.status(429).json({
          error: 'Journal generation rate limit exceeded. Please wait before generating another entry.',
          code: 'RATE_LIMITED',
          retryAfter: retryAfterSec,
        });
        return;
      }

      record.timestamps.push(now);
      next();
    };
  }

  static reset(): void {
    this.userWindows.clear();
  }
}

/**
 * Sliding Window Rate Limiter for AI Memory Extraction Endpoints (POST /api/memories/extract)
 *
 * Scoped by authenticated UID (derived from req.user.uid).
 * Restricts extraction requests to 5 per minute to prevent prompt flooding and resource abuse.
 *
 * Production Architectural Note:
 * This in-memory limiter operates on the local process. For multi-replica
 * Cloud Run deployments, back this interface with a distributed cache
 * such as Google Cloud Memorystore (Redis).
 */
export class MemoryExtractRateLimiter {
  private static userWindows = new Map<string, RateLimitRecord>();
  private static readonly WINDOW_MS = 60 * 1000; // 1 minute window
  private static readonly MAX_REQUESTS_PER_WINDOW = 5; // 5 requests per minute

  static cleanup(): void {
    const now = Date.now();
    for (const [uid, record] of this.userWindows.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);
      if (record.timestamps.length === 0) {
        this.userWindows.delete(uid);
      }
    }
  }

  static middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({
          error: 'Authentication required for rate limiting verification.',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const now = Date.now();
      let record = this.userWindows.get(uid);

      if (!record) {
        record = { timestamps: [] };
        this.userWindows.set(uid, record);
      }

      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);

      if (record.timestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
        const oldest = record.timestamps[0];
        const retryAfterSec = Math.ceil((this.WINDOW_MS - (now - oldest)) / 1000);

        res.setHeader('Retry-After', retryAfterSec.toString());
        res.status(429).json({
          error: 'Memory extraction rate limit exceeded. Please wait before extracting candidate memories again.',
          code: 'RATE_LIMITED',
          retryAfter: retryAfterSec,
        });
        return;
      }

      record.timestamps.push(now);
      next();
    };
  }

  static reset(): void {
    this.userWindows.clear();
  }
}

/**
 * Sliding Window Rate Limiter for Personal AI Insight Generation (POST /api/insights/generate)
 *
 * Scoped by authenticated UID.
 * Limits users to 3 insight generation requests per minute to prevent model abuse and prompt flooding.
 *
 * Production Note:
 * In-memory limiting is for local/single-instance prototype execution. In distributed
 * multi-instance Cloud Run containers, back this rate limiter with Google Cloud Memorystore (Redis).
 */
export class InsightGenerateRateLimiter {
  private static userWindows = new Map<string, RateLimitRecord>();
  private static readonly WINDOW_MS = 60 * 1000; // 1 minute
  private static readonly MAX_REQUESTS_PER_WINDOW = 3; // 3 requests per minute

  static cleanup(): void {
    const now = Date.now();
    for (const [uid, record] of this.userWindows.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);
      if (record.timestamps.length === 0) {
        this.userWindows.delete(uid);
      }
    }
  }

  static middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({
          error: 'Authentication required for rate limiting verification.',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const now = Date.now();
      let record = this.userWindows.get(uid);

      if (!record) {
        record = { timestamps: [] };
        this.userWindows.set(uid, record);
      }

      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);

      if (record.timestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
        const oldest = record.timestamps[0];
        const retryAfterSec = Math.ceil((this.WINDOW_MS - (now - oldest)) / 1000);

        res.setHeader('Retry-After', retryAfterSec.toString());
        res.status(429).json({
          error: 'Insight generation rate limit exceeded. Please wait before generating new insights.',
          code: 'RATE_LIMITED',
          retryAfter: retryAfterSec,
        });
        return;
      }

      record.timestamps.push(now);
      next();
    };
  }

  static reset(): void {
    this.userWindows.clear();
  }
}

/**
 * Sliding Window Rate Limiter for Weekly AI Reflection Generation (POST /api/insights/weekly)
 *
 * Scoped by authenticated UID.
 * Limits users to 2 weekly reflection generations per 10 minutes.
 *
 * Production Note:
 * In-memory limiting is prototype-level. Distributed Cloud Run deployments must use Redis.
 */
export class WeeklyReflectionRateLimiter {
  private static userWindows = new Map<string, RateLimitRecord>();
  private static readonly WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly MAX_REQUESTS_PER_WINDOW = 2; // 2 requests per 10 minutes

  static cleanup(): void {
    const now = Date.now();
    for (const [uid, record] of this.userWindows.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);
      if (record.timestamps.length === 0) {
        this.userWindows.delete(uid);
      }
    }
  }

  static middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({
          error: 'Authentication required for rate limiting verification.',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const now = Date.now();
      let record = this.userWindows.get(uid);

      if (!record) {
        record = { timestamps: [] };
        this.userWindows.set(uid, record);
      }

      record.timestamps = record.timestamps.filter((t) => now - t < this.WINDOW_MS);

      if (record.timestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
        const oldest = record.timestamps[0];
        const retryAfterSec = Math.ceil((this.WINDOW_MS - (now - oldest)) / 1000);

        res.setHeader('Retry-After', retryAfterSec.toString());
        res.status(429).json({
          error: 'Weekly reflection rate limit exceeded. Please wait before generating another weekly reflection.',
          code: 'RATE_LIMITED',
          retryAfter: retryAfterSec,
        });
        return;
      }

      record.timestamps.push(now);
      next();
    };
  }

  static reset(): void {
    this.userWindows.clear();
  }
}

