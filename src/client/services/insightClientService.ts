/**
 * Client service for interacting with Personal Insights & Weekly Reflection APIs.
 */

import type { UserInsight, WeeklyReflection, InsightStatus, InsightType } from '../../shared/types';
import { authenticatedJsonFetch } from './apiClient';

export class InsightClientService {
  /**
   * Generates personal insights from recent journals and memories.
   */
  static async generateInsights(
    token?: string,
    options?: { scope?: 'recent' | 'weekly' }
  ): Promise<UserInsight[]> {
    const data = await authenticatedJsonFetch<{ insights: UserInsight[] }>('/api/insights/generate', {
      method: 'POST',
      token,
      body: JSON.stringify(options || {}),
    });
    return data.insights || [];
  }

  /**
   * Lists personal insights with optional status or type filtering.
   */
  static async listInsights(
    token?: string,
    filters?: { status?: InsightStatus; type?: InsightType }
  ): Promise<UserInsight[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.type) params.append('type', filters.type);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await authenticatedJsonFetch<{ insights: UserInsight[] }>(`/api/insights${qs}`, {
      method: 'GET',
      token,
    });
    return data.insights || [];
  }

  /**
   * Updates an insight status (active or dismissed).
   */
  static async updateInsightStatus(
    token: string | undefined,
    insightId: string,
    status: InsightStatus
  ): Promise<UserInsight> {
    const data = await authenticatedJsonFetch<{ insight: UserInsight }>(
      `/api/insights/${encodeURIComponent(insightId)}`,
      {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      }
    );
    return data.insight;
  }

  /**
   * Deletes an insight permanently.
   */
  static async deleteInsight(token: string | undefined, insightId: string): Promise<void> {
    await authenticatedJsonFetch<{ success: boolean }>(
      `/api/insights/${encodeURIComponent(insightId)}`,
      {
        method: 'DELETE',
        token,
      }
    );
  }

  /**
   * Generates or retrieves a weekly reflection.
   */
  static async generateWeeklyReflection(
    token?: string,
    options?: { scope?: 'current' | 'previous'; regenerate?: boolean }
  ): Promise<WeeklyReflection> {
    const data = await authenticatedJsonFetch<{ reflection: WeeklyReflection }>('/api/insights/weekly', {
      method: 'POST',
      token,
      body: JSON.stringify(options || {}),
    });
    return data.reflection;
  }

  /**
   * Lists past weekly reflections.
   */
  static async listWeeklyReflections(token?: string): Promise<WeeklyReflection[]> {
    const data = await authenticatedJsonFetch<{ reflections: WeeklyReflection[] }>('/api/insights/weekly', {
      method: 'GET',
      token,
    });
    return data.reflections || [];
  }

  /**
   * Deletes a weekly reflection.
   */
  static async deleteWeeklyReflection(token: string | undefined, reflectionId: string): Promise<void> {
    await authenticatedJsonFetch<{ success: boolean }>(
      `/api/insights/weekly/${encodeURIComponent(reflectionId)}`,
      {
        method: 'DELETE',
        token,
      }
    );
  }
}
