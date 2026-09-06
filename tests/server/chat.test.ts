import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createExpressApp } from '../../src/server/app';
import { setMockAdminAuth, setMockAdminFirestore } from '../../src/server/services/firebaseAdmin';
import { InMemoryFirestoreMock } from '../helpers/mockDb';
import { GeminiService } from '../../src/server/services/geminiService';
import { ChatRateLimiter } from '../../src/server/middleware/rateLimiter';

describe('Secure Chat Endpoint (/api/chat) & Multi-Turn Engine', () => {
  let server: http.Server;
  let serverUrl: string;
  const mockDb = new InMemoryFirestoreMock();

  // Mock users
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
    ChatRateLimiter.reset();

    // Default mock Gemini Client for testing
    GeminiService.setMockClient({
      models: {
        generateContent: async (args: any) => {
          return {
            text: 'I hear how important this is to you. How did that make you feel?',
            usageMetadata: { totalTokenCount: 42 },
          };
        },
        generateContentStream: async function* (args: any) {
          yield { text: 'I hear ' };
          yield { text: 'how important ' };
          yield { text: 'this is to you.' };
        },
      },
    });
  });

  // Helper to create an active conversation in Firestore
  async function createTestConversation(uid: string, convId: string, title = 'Test Reflection') {
    const convRef = mockDb.collection('users').doc(uid).collection('conversations').doc(convId);
    await convRef.set({
      id: convId,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessageAt: null,
      messageCount: 0,
      archived: false,
    });
  }

  // 1. Authentication
  it('Rejects unauthenticated chat requests with 401 AUTH_REQUIRED', async () => {
    const res = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv-1', message: 'Hello' }),
    });

    assert.equal(res.status, 401);
    const body: any = await res.json();
    assert.equal(body.code, 'AUTH_REQUIRED');
  });

  // 2. Anti-UID Tampering
  it('Rejects client-supplied uid or userId with 400 UNEXPECTED_IDENTITY_FIELD', async () => {
    const res = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        conversationId: 'conv-1',
        message: 'Hello',
        uid: BOB_UID, // Adversary attempts to act as Bob
      }),
    });

    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.equal(body.code, 'UNEXPECTED_IDENTITY_FIELD');
  });

  // 3. Input Validation (Zod strict validation)
  it('Rejects empty or blank messages with 400', async () => {
    await createTestConversation(ALICE_UID, 'conv-1');

    const res = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        conversationId: 'conv-1',
        message: '   ',
      }),
    });

    assert.equal(res.status, 400);
  });

  it('Rejects oversized messages exceeding 4,000 characters with 400', async () => {
    await createTestConversation(ALICE_UID, 'conv-1');

    const oversizedMessage = 'a'.repeat(4001);
    const res = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        conversationId: 'conv-1',
        message: oversizedMessage,
      }),
    });

    assert.equal(res.status, 400);
  });

  it('Rejects unexpected client-supplied fields (e.g. role, history) with 400', async () => {
    await createTestConversation(ALICE_UID, 'conv-1');

    const res = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        conversationId: 'conv-1',
        message: 'Hello',
        role: 'model', // Illegal field
      }),
    });

    assert.equal(res.status, 400);
  });

  // 4. Cross-User Conversation Isolation
  it('Alice cannot send messages to Bob\'s conversation (returns 404)', async () => {
    // Bob has a conversation
    await createTestConversation(BOB_UID, 'bob-private-conv');

    // Alice attempts to chat in Bob's conversation
    const res = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        conversationId: 'bob-private-conv',
        message: 'Injected message from Alice',
      }),
    });

    assert.equal(res.status, 404);
    const body: any = await res.json();
    assert.equal(body.code, 'CONVERSATION_NOT_FOUND');

    // Verify Bob's conversation has 0 messages
    const bobsConvRef = mockDb.collection('users').doc(BOB_UID).collection('conversations').doc('bob-private-conv');
    const messages = await bobsConvRef.collection('messages').get();
    assert.equal(messages.docs.length, 0);
  });

  // 5. Normal Non-Streaming Flow & Message Ordering
  it('Executes non-streaming chat: user message persisted, Gemini called, model message persisted', async () => {
    await createTestConversation(ALICE_UID, 'alice-conv-1');

    const res = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        conversationId: 'alice-conv-1',
        message: 'I felt really overwhelmed at work today.',
        stream: false,
      }),
    });

    assert.equal(res.status, 200);
    const data: any = await res.json();

    assert.equal(data.conversationId, 'alice-conv-1');
    assert.ok(data.reply.includes('important this is to you'));
    assert.equal(data.userMessage.role, 'user');
    assert.equal(data.modelMessage.role, 'model');

    // Verify in Firestore
    const convRef = mockDb.collection('users').doc(ALICE_UID).collection('conversations').doc('alice-conv-1');
    const messagesSnap = await convRef.collection('messages').get();

    // Must have exactly 2 messages (user turn + model turn)
    assert.equal(messagesSnap.docs.length, 2);

    const roles = messagesSnap.docs.map((d: any) => d.data().role);
    assert.ok(roles.includes('user'));
    assert.ok(roles.includes('model'));
  });

  // 6. Gemini Failure Handling
  it('Gemini failure handling: User message preserved, Model message NOT created, safe error returned', async () => {
    await createTestConversation(ALICE_UID, 'alice-conv-fail');

    // Configure Gemini mock to simulate an unexpected upstream failure
    GeminiService.setMockClient({
      models: {
        generateContent: async () => {
          throw new Error('Upstream model quota exceeded');
        },
      },
    });

    const res = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        conversationId: 'alice-conv-fail',
        message: 'Important personal thought that must not be lost.',
        stream: false,
      }),
    });

    assert.equal(res.status, 500);
    const body: any = await res.json();
    assert.equal(body.code, 'AI_GENERATION_FAILED');

    // Security assertion: No secrets or raw stack traces exposed
    assert.equal(body.error.includes('AI reflection generation failed'), true);
    assert.equal(JSON.stringify(body).includes('GEMINI_API_KEY'), false);

    // CRITICAL REQUIREMENT: User message MUST be preserved, model message MUST NOT exist
    const convRef = mockDb.collection('users').doc(ALICE_UID).collection('conversations').doc('alice-conv-fail');
    const messagesSnap = await convRef.collection('messages').get();

    assert.equal(messagesSnap.docs.length, 1);
    const preservedMsg = messagesSnap.docs[0].data();
    assert.equal(preservedMsg.role, 'user');
    assert.equal(preservedMsg.content, 'Important personal thought that must not be lost.');
  });

  // 7. Rate Limiting Protection
  it('Enforces rate limiting (rejects excessive chat requests with 429)', async () => {
    await createTestConversation(ALICE_UID, 'alice-rate-conv');

    // Send 20 allowed requests
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${serverUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ALICE_TOKEN}`,
        },
        body: JSON.stringify({
          conversationId: 'alice-rate-conv',
          message: `Turn ${i}`,
          stream: false,
        }),
      });
      assert.equal(res.status, 200);
    }

    // 21st request must be blocked by rate limiter
    const blockedRes = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALICE_TOKEN}`,
      },
      body: JSON.stringify({
        conversationId: 'alice-rate-conv',
        message: 'Excessive request attempt',
        stream: false,
      }),
    });

    assert.equal(blockedRes.status, 429);
    const blockedBody: any = await blockedRes.json();
    assert.equal(blockedBody.code, 'RATE_LIMITED');
    assert.ok(blockedRes.headers.get('retry-after'));
  });
});
