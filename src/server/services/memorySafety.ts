import type { MemoryCandidate } from '../../shared/types';

/**
 * Server-Side Safety Filter for AI Memory Candidates & Persistence
 *
 * Implements strict data protection policies to prevent credentials, secrets,
 * and high-risk sensitive data from entering long-term memory.
 */
export class MemorySafetyService {
  /**
   * Patterns matching credentials, secrets, tokens, keys, and financial account numbers.
   */
  private static readonly SENSITIVE_PATTERNS: RegExp[] = [
    // Private cryptographic keys
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    // Typical API key formats (AWS, Google, GitHub, Stripe, OpenAI, etc.)
    /AIza[0-9A-Za-z-_]{35}/,
    /gh[pousr]_[A-Za-z0-9_]{36,}/,
    /sk_live_[0-9a-zA-Z]{24,}/,
    /sk_test_[0-9a-zA-Z]{24,}/,
    /AKIA[0-9A-Z]{16}/,
    // JSON Web Tokens (JWT)
    /ey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    // Bearer token patterns
    /bearer\s+[A-Za-z0-9_.-]{16,}/i,
    // Explicit password / secret declarations
    /(?:password|passwd|pwd|secret_key|api_key|access_token|auth_token|bearer\s+token|user\s+token)\s*(?:[:=]|\bis\b)\s*[^\s,;]{4,}/i,
    // Payment card numbers (Luhn candidate 13-19 digits)
    /\b(?:\d[ -]*?){13,19}\b/,
    // Social Security Numbers (US SSN format)
    /\b\d{3}-\d{2}-\d{4}\b/,
  ];

  /**
   * Evaluates if a given text contains high-risk credential or financial data.
   */
  static containsSensitiveInformation(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    for (const pattern of this.SENSITIVE_PATTERNS) {
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Filters out candidate memories that violate safety guidelines.
   */
  static filterCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
    return candidates.filter((candidate) => {
      if (this.containsSensitiveInformation(candidate.content)) {
        return false;
      }
      if (this.containsSensitiveInformation(candidate.reason)) {
        return false;
      }
      return true;
    });
  }
}
