import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createExpressApp } from '../../src/server/app';
import { setMockAdminAuth, setMockAdminFirestore } from '../../src/server/services/firebaseAdmin';
import { InMemoryFirestoreMock } from '../helpers/mockDb';
import { GeminiService } from '../../src/server/services/geminiService';
import {
  InsightGenerateRateLimiter,
  WeeklyReflectionRateLimiter,
} from '../../src/server/middleware/rateLimiter';
import { InsightService, getWeekRange } from '../../src/server/services/insightService';

describe('Phase 5 — Personal Insight Engine & Weekly AI Reflection', () => {
  let server: http.Server;
  let serverUrl: string;
  const mockDb = new InMemoryFirestoreMock();

  // Mock identities
  const ALICE_TOKEN = 'token-alice-5';
  const ALICE_UID = 'alice-p5-123';

  const BOB_TOKEN = 'token-bob-5';
  const BOB_UID = 'bob-p5-456';

  before(async () => {
    setMockAdminAuth({
      verifyIdToken: async (token: string) => {
        if (token === ALICE_TOKEN) {
          return { uid: ALICE_UID, email: 'alice@example.com' };
        }
        if (token === BOB_TOKEN) {
          return { uid: BOB_UID, email: 'bob@example.com' };
        }
        const err: any = new Error('Token verification failed');
        err.code = 'auth/argument-error';
        throw err;
      },
    });

    setMockAdminFirestore(mockDb);

    const app = createExpressApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as any;
    serverUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    server.close();
    setMockAdminAuth(null);
    setMockAdminFirestore(null);
    GeminiService.setMockClient(null);
  });

  beforeEach(() => {
    mockDb.clear();
    InsightGenerateRateLimiter.reset();
    WeeklyReflectionRateLimiter.reset();

    // Default mock Gemini response
    GeminiService.setMockClient({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            insights: [
              {
                type: 'recurring_theme',
                title: 'Iterative Problem Solving',
                description: 'Consistently focuses on breaking complex challenges into manageable milestones.',
                evidence: ['Mentioned breaking tasks into smaller steps on multiple occasions.'],
                relatedGoal: 'Improve architectural execution',
                confidence: 0.92,
                sourceJournalIds: ['j-alice-1'],
              },
            ],
          }),
        }),
      },
    });
  });

  // ==================== AUTHENTICATION & IDENTITY ====================

  it('Authentication: Rejects unauthenticated requests with 401', async () => {
    const resInsights = await fetch(`${serverUrl}/api/insights/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(resInsights.status, 401);

    const resWeekly = await fetch(`${serverUrl}/api/insights/weekly`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(resWeekly.status, 401);

    const resList = await fetch(`${serverUrl}/api/insights`, {
      method: 'GET',
    });
    assert.equal(resList.status, 401);
  });

  it('Anti-UID Tampering: Rejects client-supplied identity fields with 400', async () => {
    const payloads = [
      { uid: BOB_UID },
      { userId: BOB_UID },
      { ownerUid: BOB_UID },
    ];

    for (const body of payloads) {
      const res = await fetch(`${serverUrl}/api/insights/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ALICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'UNEXPECTED_IDENTITY_FIELD');
    }
  });

  // ==================== INSIGHT GENERATION & GROUNDING ====================

  it('Generates insights from user journals and filters hallucinated source IDs', async () => {
    // Seed 1 real journal for Alice
    const realJournalId = 'j-alice-1';
    await mockDb
      .collection('users')
      .doc(ALICE_UID)
      .collection('journals')
      .doc(realJournalId)
      .set({
        id: realJournalId,
        title: 'Deep Architecture Reflection',
        summary: 'Focused on breaking down large tasks and setting daily boundaries.',
        keyThoughts: ['Modular design is key'],
        mood: 'reflective',
        emotions: ['focused'],
        insights: ['Single responsibility helps cognitive load'],
        actionItems: ['Review tests'],
        goals: ['Finish Phase 5 cleanly'],
        tags: ['architecture', 'productivity'],
        sourceConversationId: 'conv-alice-99',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    // Mock Gemini returning 1 real source ID and 1 hallucinated ID
    GeminiService.setMockClient({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            insights: [
              {
                type: 'goal_progress',
                title: 'Milestone Decomposition',
                description: 'Progress observed in structuring large initiatives into small units.',
                evidence: ['Broke complex tasks into modular components.'],
                relatedGoal: 'Finish Phase 5 cleanly',
                confidence: 0.95,
                sourceJournalIds: [realJournalId, 'hallucinated-journal-id-999'],
              },
            ],
          }),
        }),
      },
    });

    const res = await fetch(`${serverUrl}/api/insights/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'recent' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.insights.length, 1);

    const generated = data.insights[0];
    assert.equal(generated.title, 'Milestone Decomposition');
    assert.equal(generated.type, 'goal_progress');
    // Grounded reference validation: hallucinated ID MUST be filtered out
    assert.deepEqual(generated.sourceJournalIds, [realJournalId]);
    assert.deepEqual(generated.sourceConversationIds, ['conv-alice-99']);
    assert.equal(generated.status, 'active');

    // Verify persisted in Firestore under Alice's scope
    const storedSnap = await mockDb
      .collection('users')
      .doc(ALICE_UID)
      .collection('insights')
      .doc(generated.id)
      .get();
    assert.equal(storedSnap.exists, true);
    assert.equal(storedSnap.data().title, 'Milestone Decomposition');
  });

  it('Returns empty array when user has 0 journals without calling model unnecessarily', async () => {
    let modelCalled = false;
    GeminiService.setMockClient({
      models: {
        generateContent: async () => {
          modelCalled = true;
          return { text: '{}' };
        },
      },
    });

    const res = await fetch(`${serverUrl}/api/insights/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.insights, []);
    assert.equal(modelCalled, false);
  });

  // ==================== TENANT ISOLATION & IDOR DEFENSE ====================

  it('Tenant Isolation: Alice cannot read, update, or delete Bob’s insights', async () => {
    // Seed Bob's insight
    const bobInsightId = 'insight-bob-private';
    await mockDb
      .collection('users')
      .doc(BOB_UID)
      .collection('insights')
      .doc(bobInsightId)
      .set({
        id: bobInsightId,
        type: 'behavioral_pattern',
        title: 'Bob Secret Insight',
        description: 'Private reflections of Bob',
        evidence: ['Bob evidence'],
        relatedGoal: null,
        sourceJournalIds: [],
        sourceConversationIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        generationVersion: '1.0.0',
        status: 'active',
        confidence: 0.88,
      });

    // Alice attempts to GET Bob's insight
    const getRes = await fetch(`${serverUrl}/api/insights/${bobInsightId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.equal(getRes.status, 404);

    // Alice attempts to PATCH Bob's insight
    const patchRes = await fetch(`${serverUrl}/api/insights/${bobInsightId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    assert.equal(patchRes.status, 404);

    // Alice attempts to DELETE Bob's insight
    const deleteRes = await fetch(`${serverUrl}/api/insights/${bobInsightId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.equal(deleteRes.status, 404);

    // Verify Bob's insight remains completely unmodified and active
    const bobDoc = await mockDb
      .collection('users')
      .doc(BOB_UID)
      .collection('insights')
      .doc(bobInsightId)
      .get();
    assert.equal(bobDoc.exists, true);
    assert.equal(bobDoc.data().status, 'active');
  });

  it('Tenant Isolation: Alice cannot access Bob’s weekly reflections', async () => {
    const bobReflectionId = 'weekly-2026-w35';
    await mockDb
      .collection('users')
      .doc(BOB_UID)
      .collection('weeklyReflections')
      .doc(bobReflectionId)
      .set({
        id: bobReflectionId,
        periodStart: '2026-08-24T00:00:00.000Z',
        periodEnd: '2026-08-30T23:59:59.999Z',
        headline: 'Bob Weekly Reflection',
        whatStoodOut: ['Bob project milestone'],
        progress: ['Feature completion'],
        recurringThemes: ['Focus'],
        openLoops: ['Refactor'],
        keyInsight: 'Patience pays off',
        carryForward: ['Keep going'],
        generatedAt: new Date().toISOString(),
        generationVersion: '1.0.0',
      });

    // Alice attempts to read Bob's reflection
    const res = await fetch(`${serverUrl}/api/insights/weekly/${bobReflectionId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.equal(res.status, 404);

    // Alice attempts to delete Bob's reflection
    const delRes = await fetch(`${serverUrl}/api/insights/weekly/${bobReflectionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.equal(delRes.status, 404);
  });

  // ==================== WEEKLY REFLECTIONS ====================

  it('Weekly Reflection: Returns insufficientData status when fewer than 2 journals exist', async () => {
    // Only 1 journal for Alice
    await mockDb
      .collection('users')
      .doc(ALICE_UID)
      .collection('journals')
      .doc('j-single')
      .set({
        id: 'j-single',
        title: 'Single Day Entry',
        summary: 'Only journal written this week.',
        keyThoughts: ['Lone reflection'],
        mood: 'calm',
        emotions: ['calm'],
        insights: [],
        actionItems: [],
        goals: [],
        tags: ['day1'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    const res = await fetch(`${serverUrl}/api/insights/weekly`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'current' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.reflection.insufficientData, true);
    assert.ok(data.reflection.headline.includes('Not enough'));
  });

  it('Weekly Reflection: Generates and provides idempotent responses unless regenerate is true', async () => {
    // Seed 2 journals for Alice
    for (let i = 1; i <= 3; i++) {
      await mockDb
        .collection('users')
        .doc(ALICE_UID)
        .collection('journals')
        .doc(`j-week-${i}`)
        .set({
          id: `j-week-${i}`,
          title: `Journal Entry Day ${i}`,
          summary: `Summary of thoughts for day ${i}.`,
          keyThoughts: [`Thought ${i}`],
          mood: 'optimistic',
          emotions: ['determined'],
          insights: [`Insight ${i}`],
          actionItems: [`Action ${i}`],
          goals: ['Continuous improvement'],
          tags: ['growth'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
    }

    let modelCalls = 0;
    GeminiService.setMockClient({
      models: {
        generateContent: async () => {
          modelCalls++;
          return {
            text: JSON.stringify({
              headline: 'A Week of Solid Architectural Progress',
              whatStoodOut: ['Consistent progression each day'],
              progress: ['Completed multiple core modules'],
              recurringThemes: ['Modularity', 'Discipline'],
              openLoops: ['Final verification'],
              keyInsight: 'Structured planning prevents unexpected errors',
              carryForward: ['Maintain clean test coverage'],
            }),
          };
        },
      },
    });

    // 1st call: generates reflection and persists
    const res1 = await fetch(`${serverUrl}/api/insights/weekly`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'current' }),
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.reflection.headline, 'A Week of Solid Architectural Progress');
    assert.equal(modelCalls, 1);

    // 2nd call: idempotent (returns existing reflection without re-invoking model)
    const res2 = await fetch(`${serverUrl}/api/insights/weekly`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'current', regenerate: false }),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.reflection.id, data1.reflection.id);
    assert.equal(modelCalls, 1); // Model not called again!

    // 3rd call with regenerate: true: re-invokes model (reset rate limiter for test)
    WeeklyReflectionRateLimiter.reset();
    const res3 = await fetch(`${serverUrl}/api/insights/weekly`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'current', regenerate: true }),
    });
    assert.equal(res3.status, 200);
    assert.equal(modelCalls, 2);
  });

  // ==================== RATE LIMITING ====================

  it('Rate Limiting: Enforces 3 requests/min on insight generation', async () => {
    // Seed 1 journal so generation succeeds
    await mockDb
      .collection('users')
      .doc(ALICE_UID)
      .collection('journals')
      .doc('j-rate-test')
      .set({
        id: 'j-rate-test',
        title: 'Rate Limit Test Journal',
        summary: 'Testing rate limits',
        createdAt: new Date().toISOString(),
      });

    // Perform 3 successful requests
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${serverUrl}/api/insights/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ALICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 200);
    }

    // 4th request must be rejected with 429 RATE_LIMITED
    const res4 = await fetch(`${serverUrl}/api/insights/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(res4.status, 429);
    const data4 = await res4.json();
    assert.equal(data4.code, 'RATE_LIMITED');
    assert.ok(res4.headers.get('Retry-After'));
  });

  it('Rate Limiting: Enforces 2 requests/10min on weekly reflections', async () => {
    // Perform 2 requests
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${serverUrl}/api/insights/weekly`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ALICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 200);
    }

    // 3rd request must be rejected with 429 RATE_LIMITED
    const res3 = await fetch(`${serverUrl}/api/insights/weekly`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(res3.status, 429);
    const data3 = await res3.json();
    assert.equal(data3.code, 'RATE_LIMITED');
    assert.ok(res3.headers.get('Retry-After'));
  });
});
