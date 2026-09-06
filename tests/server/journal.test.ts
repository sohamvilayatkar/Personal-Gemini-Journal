import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createExpressApp } from '../../src/server/app';
import { setMockAdminAuth, setMockAdminFirestore } from '../../src/server/services/firebaseAdmin';
import { InMemoryFirestoreMock } from '../helpers/mockDb';
import { GeminiService } from '../../src/server/services/geminiService';
import { JournalRateLimiter } from '../../src/server/middleware/rateLimiter';
import { createConversation, addMessage } from '../../src/server/services/conversationService';

describe('Phase 3 — Secure AI Journal Generation & Management', () => {
  let server: http.Server;
  let serverUrl: string;
  const mockDb = new InMemoryFirestoreMock();

  // Mock identities
  const ALICE_TOKEN = 'token-alice';
  const ALICE_UID = 'alice-123';

  const BOB_TOKEN = 'token-bob';
  const BOB_UID = 'bob-456';

  before(async () => {
    // Inject mock Admin Auth
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

    // Inject mock Admin Firestore
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
    JournalRateLimiter.reset();

    // Default mock Gemini response producing valid structured JSON
    GeminiService.setMockClient({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            title: 'Finding Clarity Amid Uncertainty',
            summary:
              'Explored work transitions and feelings of overwhelm, recognizing the value of taking one step at a time.',
            keyThoughts: [
              'Break large ambiguous goals into daily milestones',
              'Self-criticism creates unnecessary friction',
            ],
            mood: 'grounded',
            emotions: ['relieved', 'thoughtful'],
            insights: ['Perfectionism is a defensive habit rather than a quality standard'],
            actionItems: ['Schedule 30 minutes for focused prioritization tomorrow morning'],
            goals: ['Maintain healthy boundaries with late-night work communications'],
            tags: ['work', 'clarity', 'mindfulness'],
          }),
        }),
      },
    });
  });

  it('Authentication: Rejects unauthenticated journal requests with 401', async () => {
    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv-123' }),
    });

    assert.equal(res.status, 401);
  });

  it('Anti-UID Tampering: Rejects client-supplied identity fields with 400', async () => {
    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: 'conv-123',
        uid: 'attacker-injected-uid',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'UNEXPECTED_IDENTITY_FIELD');
  });

  it('Anti-IDOR: Alice cannot generate a journal from Bob conversation', async () => {
    // Create Bob's conversation and message
    const bobConv = await createConversation(BOB_UID, 'Bobs Private Topic', mockDb);
    await addMessage(BOB_UID, bobConv.id, 'user', 'My secret reflection', mockDb);

    // Alice attempts to synthesize Bob's conversation
    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: bobConv.id,
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.code, 'CONVERSATION_NOT_FOUND');
  });

  it('Empty Conversation: Rejects synthesis of conversations without messages with 400', async () => {
    const aliceConv = await createConversation(ALICE_UID, 'Empty Topic', mockDb);

    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: aliceConv.id,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'CANNOT_SYNTHESIZE_EMPTY_CONVERSATION');
  });

  it('Synthesis: Generates structured journal entry with AI provenance', async () => {
    const aliceConv = await createConversation(ALICE_UID, 'Mindful Reflection', mockDb);
    await addMessage(ALICE_UID, aliceConv.id, 'user', 'I am feeling overwhelmed with my tasks today.', mockDb);
    await addMessage(ALICE_UID, aliceConv.id, 'model', 'Let us break them down into small, achievable steps.', mockDb);

    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: aliceConv.id,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.journal);
    assert.equal(body.journal.title, 'Finding Clarity Amid Uncertainty');
    assert.equal(body.journal.updatedBy, 'ai');
    assert.equal(body.journal.aiGenerated, true);
    assert.equal(body.journal.generationVersion, '1.0.0');
    assert.equal(body.journal.sourceConversationId, aliceConv.id);
    assert.ok(body.journal.keyThoughts.length > 0);
    assert.ok(body.journal.insights.length > 0);
    assert.ok(body.journal.actionItems.length > 0);
  });

  it('Deduplication: Returns existing journal on duplicate generate request without re-calling Gemini', async () => {
    const aliceConv = await createConversation(ALICE_UID, 'Reflection 2', mockDb);
    await addMessage(ALICE_UID, aliceConv.id, 'user', 'Reflecting on healthy routines.', mockDb);

    let geminiCallCount = 0;
    GeminiService.setMockClient({
      models: {
        generateContent: async () => {
          geminiCallCount++;
          return {
            text: JSON.stringify({
              title: 'Healthy Routines',
              summary: 'Establishing morning mindfulness habits.',
              keyThoughts: ['Consistency beats intensity'],
              mood: 'calm',
              emotions: ['optimistic'],
              insights: ['Small daily habits compound'],
              actionItems: ['Wake up 15 mins earlier'],
              goals: ['Daily meditation'],
              tags: ['habits'],
            }),
          };
        },
      },
    });

    // 1st request -> generates
    const res1 = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: aliceConv.id }),
    });
    assert.equal(res1.status, 201);
    assert.equal(geminiCallCount, 1);

    // 2nd request -> returns existing journal without re-calling Gemini
    const res2 = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: aliceConv.id }),
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.alreadyExists, true);
    assert.equal(geminiCallCount, 1); // Gemini was NOT called again!
  });

  it('Regeneration: Bumps generation version when regenerate: true is passed', async () => {
    const aliceConv = await createConversation(ALICE_UID, 'Reflection 3', mockDb);
    await addMessage(ALICE_UID, aliceConv.id, 'user', 'Reflecting on stress management.', mockDb);

    // 1st generate
    await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: aliceConv.id }),
    });

    // 2nd generate with regenerate: true
    const resRegen = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: aliceConv.id,
        regenerate: true,
      }),
    });

    assert.equal(resRegen.status, 200);
    const bodyRegen = await resRegen.json();
    assert.equal(bodyRegen.regenerated, true);
    assert.equal(bodyRegen.journal.generationVersion, '2.0.0');
    assert.equal(bodyRegen.journal.updatedBy, 'ai');
  });

  it('User Editability: Allows user modifications and stamps updatedBy: user', async () => {
    const aliceConv = await createConversation(ALICE_UID, 'Reflection 4', mockDb);
    await addMessage(ALICE_UID, aliceConv.id, 'user', 'Reflecting on creative projects.', mockDb);

    const genRes = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: aliceConv.id }),
    });
    const { journal } = await genRes.json();

    // Alice edits the journal
    const patchRes = await fetch(`${serverUrl}/api/journals/${journal.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Custom User Revised Title',
        summary: 'Updated summary written in my own personal words.',
        tags: ['creative', 'personal-growth'],
      }),
    });

    assert.equal(patchRes.status, 200);
    const updatedBody = await patchRes.json();
    assert.equal(updatedBody.journal.title, 'Custom User Revised Title');
    assert.equal(updatedBody.journal.summary, 'Updated summary written in my own personal words.');
    assert.equal(updatedBody.journal.updatedBy, 'user');
    assert.deepEqual(updatedBody.journal.tags, ['creative', 'personal-growth']);

    // Attempting to mutate server-controlled provenance fields is rejected
    const badPatchRes = await fetch(`${serverUrl}/api/journals/${journal.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        aiGenerated: false,
        updatedBy: 'ai',
      }),
    });
    assert.equal(badPatchRes.status, 400);
    const badBody = await badPatchRes.json();
    assert.equal(badBody.code, 'FORBIDDEN_FIELD_MUTATION');
  });

  it('Cross-User Access: Bob cannot read, patch, or delete Alice journal', async () => {
    const aliceConv = await createConversation(ALICE_UID, 'Alice Secret Reflection', mockDb);
    await addMessage(ALICE_UID, aliceConv.id, 'user', 'Private thoughts.', mockDb);

    const genRes = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: aliceConv.id }),
    });
    const { journal } = await genRes.json();

    // Bob tries to GET Alice's journal
    const getRes = await fetch(`${serverUrl}/api/journals/${journal.id}`, {
      headers: { Authorization: `Bearer ${BOB_TOKEN}` },
    });
    assert.equal(getRes.status, 404);

    // Bob tries to PATCH Alice's journal
    const patchRes = await fetch(`${serverUrl}/api/journals/${journal.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${BOB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Hacked title' }),
    });
    assert.equal(patchRes.status, 404);

    // Bob tries to DELETE Alice's journal
    const deleteRes = await fetch(`${serverUrl}/api/journals/${journal.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${BOB_TOKEN}` },
    });
    assert.equal(deleteRes.status, 404);
  });

  it('List & Delete: Lists user journals and deletes successfully', async () => {
    const aliceConv = await createConversation(ALICE_UID, 'Topic to delete', mockDb);
    await addMessage(ALICE_UID, aliceConv.id, 'user', 'Test content', mockDb);

    const genRes = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: aliceConv.id }),
    });
    const { journal } = await genRes.json();

    // Verify in list
    const listRes = await fetch(`${serverUrl}/api/journals`, {
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(listBody.journals.some((j: any) => j.id === journal.id));

    // Delete
    const delRes = await fetch(`${serverUrl}/api/journals/${journal.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.equal(delRes.status, 200);

    // Verify deleted
    const verifyRes = await fetch(`${serverUrl}/api/journals/${journal.id}`, {
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.equal(verifyRes.status, 404);
  });

  it('Rate Limiting: Exceeding journal generation threshold returns 429', async () => {
    const conv = await createConversation(ALICE_UID, 'Rate Limit Test', mockDb);
    await addMessage(ALICE_UID, conv.id, 'user', 'Content', mockDb);

    // Send 6 generation requests (the allowed threshold)
    for (let i = 0; i < 6; i++) {
      await fetch(`${serverUrl}/api/journals/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ALICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationId: conv.id, regenerate: true }),
      });
    }

    // 7th request must trigger 429
    const rateLimitedRes = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: conv.id, regenerate: true }),
    });

    assert.equal(rateLimitedRes.status, 429);
    const body = await rateLimitedRes.json();
    assert.equal(body.code, 'RATE_LIMITED');
    assert.ok(rateLimitedRes.headers.get('Retry-After'));
  });

  it('Error Classification: Malformed Gemini JSON returns 502 with AI_SYNTHESIS_MALFORMED', async () => {
    const conv = await createConversation(ALICE_UID, 'Malformed Gemini Test', mockDb);
    await addMessage(ALICE_UID, conv.id, 'user', 'Reflection message', mockDb);

    GeminiService.setMockClient({
      models: {
        generateContent: async () => {
          return {
            text: 'This is not valid JSON at all!',
          };
        },
      },
    });

    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: conv.id }),
    });

    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.code, 'AI_SYNTHESIS_MALFORMED');
  });

  it('Robustness: Gemini output with markdown fences, extra keys, and string arrays is normalized', async () => {
    const conv = await createConversation(ALICE_UID, 'Markdown Fence Test', mockDb);
    await addMessage(ALICE_UID, conv.id, 'user', 'Reflection with fences', mockDb);

    GeminiService.setMockClient({
      models: {
        generateContent: async () => {
          return {
            text: '```json\n{"title":"Clean Title","summary":"A short summary.","keyThoughts":["Thought 1"],"mood":"peaceful","emotions":"calm, centered","insights":["Key insight"],"actionItems":[],"goals":[],"tags":"peace, calm","extraProperty":"forbidden"}\n```',
          };
        },
      },
    });

    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: conv.id }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.journal.title, 'Clean Title');
    assert.equal(body.journal.mood, 'peaceful');
    assert.deepEqual(body.journal.emotions, ['calm', 'centered']);
    assert.deepEqual(body.journal.tags, ['peace', 'calm']);
  });

  it('Nonexistent Conversation: Returns 404 with CONVERSATION_NOT_FOUND', async () => {
    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: 'conv-does-not-exist-999' }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.code, 'CONVERSATION_NOT_FOUND');
  });

  it('Resilience: Conversation ending with model message synthesizes without Gemini 400 error', async () => {
    const conv = await createConversation(ALICE_UID, 'Ending in Model Turn', mockDb);
    await addMessage(ALICE_UID, conv.id, 'user', 'I achieved my running goal this week.', mockDb);
    await addMessage(ALICE_UID, conv.id, 'model', 'Congratulations! Consistency pays off.', mockDb);

    // Mock Gemini validating that requests ending in a model turn are rejected (real API behavior)
    let capturedContents: any = null;
    GeminiService.setMockClient({
      models: {
        generateContent: async (params: any) => {
          capturedContents = params.contents;
          const lastTurn = params.contents[params.contents.length - 1];
          if (lastTurn.role === 'model') {
            const err: any = new Error('Requests ending with a model turn are not supported.');
            err.status = 400;
            throw err;
          }
          return {
            text: JSON.stringify({
              title: 'Running Consistency',
              summary: 'Achieved personal fitness milestones through consistent weekly running.',
              keyThoughts: ['Consistency pays off'],
              mood: 'accomplished',
              emotions: ['proud'],
              insights: ['Routines build lasting progress'],
              actionItems: ['Continue weekly running program'],
              goals: ['Run 10k next month'],
              tags: ['running', 'fitness'],
            }),
          };
        },
      },
    });

    const res = await fetch(`${serverUrl}/api/journals/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ALICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: conv.id }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.journal.title, 'Running Consistency');
    assert.ok(capturedContents, 'generateContent should be invoked');
    assert.equal(capturedContents[capturedContents.length - 1].role, 'user');
  });
});
