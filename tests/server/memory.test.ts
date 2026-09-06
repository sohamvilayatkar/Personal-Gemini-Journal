import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createExpressApp } from '../../src/server/app';
import { setMockAdminAuth, setMockAdminFirestore } from '../../src/server/services/firebaseAdmin';
import { InMemoryFirestoreMock } from '../helpers/mockDb';
import { GeminiService } from '../../src/server/services/geminiService';
import { MemoryExtractRateLimiter } from '../../src/server/middleware/rateLimiter';
import { createConversation, addMessage } from '../../src/server/services/conversationService';
import { createMemory } from '../../src/server/services/memoryService';

describe('Phase 4 — Personal AI Memory System & Security Controls', () => {
  let server: http.Server;
  let serverUrl: string;
  const mockDb = new InMemoryFirestoreMock();

  // Test identities
  const ALICE_TOKEN = 'token-alice-mem';
  const ALICE_UID = 'alice-mem-123';

  const BOB_TOKEN = 'token-bob-mem';
  const BOB_UID = 'bob-mem-456';

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
    MemoryExtractRateLimiter.reset();

    // Default mock for Gemini structured memory candidate extraction
    GeminiService.setMockClient({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            candidates: [
              {
                content: 'Prefers concise, actionable feedback with code examples',
                category: 'preference',
                confidence: 0.95,
                reason: 'Directly stated during technical discussion',
              },
              {
                content: 'Working on personal AI journal system with Firestore',
                category: 'project',
                confidence: 0.9,
                reason: 'Current project focus',
              },
            ],
          }),
        }),
      },
    });
  });

  it('Authentication: Rejects unauthenticated memory requests with 401', async () => {
    const res = await fetch(`${serverUrl}/api/memories`, {
      method: 'GET',
    });
    assert.strictEqual(res.status, 401);
  });

  it('Anti-UID Tampering: Rejects client-supplied uid or immutable fields with 400', async () => {
    const res = await fetch(`${serverUrl}/api/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        content: 'Aiming to run a 10k marathon this autumn',
        category: 'goal',
        uid: BOB_UID, // Unauthorized client-supplied identity injection
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, 'UNEXPECTED_IDENTITY_FIELD');
  });

  it('User Memory Creation: Successfully persists user-approved memory with server-stamped metadata', async () => {
    const res = await fetch(`${serverUrl}/api/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        content: 'Prefers dark roast coffee with oat milk',
        category: 'preference',
        confidence: 0.95,
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.memory.uid, ALICE_UID);
    assert.strictEqual(body.memory.userApproved, true);
    assert.strictEqual(body.memory.status, 'active');
    assert.strictEqual(body.memory.provenance, 'user');
    assert.strictEqual(body.memory.content, 'Prefers dark roast coffee with oat milk');
    assert.strictEqual(body.memory.category, 'preference');
    assert.ok(body.memory.id.startsWith('memory_'));
  });

  it('Sensitive Data Filtering: Rejects or sanitizes memory creation containing secret credentials', async () => {
    const res = await fetch(`${serverUrl}/api/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        content: 'My secret api key is AIzaSyA1234567890abcdefghijklmnopqrstuv',
        category: 'context',
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, 'SENSITIVE_CONTENT_REJECTED');
  });

  it('User Memory List & IDOR Prevention: Returns only authenticated user memories', async () => {
    // Seed Alice memory
    await createMemory(ALICE_UID, {
      content: 'Alice principle: verify before trusting',
      category: 'principle',
    });

    // Seed Bob memory
    await createMemory(BOB_UID, {
      content: 'Bob goal: build a cabin in the woods',
      category: 'goal',
    });

    // Alice requests her memories
    const resAlice = await fetch(`${serverUrl}/api/memories`, {
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.strictEqual(resAlice.status, 200);
    const dataAlice = await resAlice.json();
    assert.strictEqual(dataAlice.memories.length, 1);
    assert.strictEqual(dataAlice.memories[0].content, 'Alice principle: verify before trusting');

    // Bob requests his memories
    const resBob = await fetch(`${serverUrl}/api/memories`, {
      headers: { Authorization: `Bearer ${BOB_TOKEN}` },
    });
    assert.strictEqual(resBob.status, 200);
    const dataBob = await resBob.json();
    assert.strictEqual(dataBob.memories.length, 1);
    assert.strictEqual(dataBob.memories[0].content, 'Bob goal: build a cabin in the woods');
  });

  it('Anti-IDOR: Bob cannot read, patch, or delete Alice memory', async () => {
    const aliceMem = await createMemory(ALICE_UID, {
      content: 'Alice private habit: meditating at sunrise',
      category: 'habit',
    });

    // Bob tries to GET Alice's memory
    const getRes = await fetch(`${serverUrl}/api/memories/${aliceMem.id}`, {
      headers: { Authorization: `Bearer ${BOB_TOKEN}` },
    });
    assert.strictEqual(getRes.status, 404);

    // Bob tries to PATCH Alice's memory
    const patchRes = await fetch(`${serverUrl}/api/memories/${aliceMem.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BOB_TOKEN}`,
      },
      body: JSON.stringify({ content: 'Tampered by Bob' }),
    });
    assert.strictEqual(patchRes.status, 404);

    // Bob tries to DELETE Alice's memory
    const delRes = await fetch(`${serverUrl}/api/memories/${aliceMem.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${BOB_TOKEN}` },
    });
    assert.strictEqual(delRes.status, 404);

    // Verify Alice's memory remains intact
    const verifyAlice = await fetch(`${serverUrl}/api/memories/${aliceMem.id}`, {
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.strictEqual(verifyAlice.status, 200);
    const data = await verifyAlice.json();
    assert.strictEqual(data.memory.content, 'Alice private habit: meditating at sunrise');
  });

  it('User Memory Updates: Alice can edit content, category, or archive status', async () => {
    const aliceMem = await createMemory(ALICE_UID, {
      content: 'Learning Rust programming language',
      category: 'learning',
    });

    const res = await fetch(`${serverUrl}/api/memories/${aliceMem.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        content: 'Mastered Rust and now learning Zig',
        category: 'learning',
        status: 'disabled',
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.memory.content, 'Mastered Rust and now learning Zig');
    assert.strictEqual(body.memory.status, 'disabled');
    assert.strictEqual(body.memory.updatedBy, 'user');
  });

  it('User Memory Deletion: Alice can permanently delete her own memory', async () => {
    const aliceMem = await createMemory(ALICE_UID, {
      content: 'Temporary project memory',
      category: 'project',
    });

    const delRes = await fetch(`${serverUrl}/api/memories/${aliceMem.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.strictEqual(delRes.status, 200);

    const getRes = await fetch(`${serverUrl}/api/memories/${aliceMem.id}`, {
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    assert.strictEqual(getRes.status, 404);
  });

  it('Candidate Extraction: Gemini proposes candidates; proposals are NOT saved to Firestore automatically', async () => {
    // Seed conversation for Alice
    const conv = await createConversation(ALICE_UID, 'Planning Q4 Objectives');
    await addMessage(
      ALICE_UID,
      conv.id,
      'user',
      'I want to focus heavily on completing our security audit and writing clean docs.'
    );
    await addMessage(
      ALICE_UID,
      conv.id,
      'model',
      'That is a commendable priority. How would you like to structure the timeline?'
    );

    const res = await fetch(`${serverUrl}/api/memories/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({ conversationId: conv.id }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.candidates));
    assert.strictEqual(body.candidates.length, 2);
    assert.strictEqual(body.candidates[0].category, 'preference');

    // CRITICAL SECURITY ASSERTION: No memories should have been saved to Firestore!
    const listRes = await fetch(`${serverUrl}/api/memories`, {
      headers: { Authorization: `Bearer ${ALICE_TOKEN}` },
    });
    const listData = await listRes.json();
    assert.strictEqual(listData.memories.length, 0, 'Gemini must NEVER automatically save memories without user approval');
  });

  it('Extraction Safety: Blocks sensitive data from candidates before returning to user', async () => {
    // Mock Gemini returning a candidate with sensitive pattern
    GeminiService.setMockClient({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            candidates: [
              {
                content: 'User token is Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
                category: 'context',
                confidence: 0.99,
                reason: 'Found in user message',
              },
              {
                content: 'Enjoys morning walks in the park',
                category: 'habit',
                confidence: 0.85,
                reason: 'Mentioned daily routine',
              },
            ],
          }),
        }),
      },
    });

    const conv = await createConversation(ALICE_UID, 'Test Safety');
    await addMessage(ALICE_UID, conv.id, 'user', 'My morning routine');

    const res = await fetch(`${serverUrl}/api/memories/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({ conversationId: conv.id }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    // The candidate with Bearer token must have been stripped!
    assert.strictEqual(body.candidates.length, 1);
    assert.strictEqual(body.candidates[0].content, 'Enjoys morning walks in the park');
  });

  it('Rate Limiting: Exceeding 5 extraction requests per minute returns 429', async () => {
    const conv = await createConversation(ALICE_UID, 'Rate Limiting Conv');
    await addMessage(ALICE_UID, conv.id, 'user', 'Check rate limits');

    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${serverUrl}/api/memories/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ALICE_TOKEN}`,
        },
        body: JSON.stringify({ conversationId: conv.id }),
      });
      assert.strictEqual(res.status, 200);
    }

    // 6th request should hit 429
    const limitedRes = await fetch(`${serverUrl}/api/memories/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({ conversationId: conv.id }),
    });
    assert.strictEqual(limitedRes.status, 429);
    const body = await limitedRes.json();
    assert.strictEqual(body.code, 'RATE_LIMITED');
  });
});
