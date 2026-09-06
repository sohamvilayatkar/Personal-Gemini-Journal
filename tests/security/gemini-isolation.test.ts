import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { InMemoryFirestoreMock } from '../helpers/mockDb';
import { getBoundedContext } from '../../src/server/services/conversationService';

describe('Gemini Secret & Context Isolation Security Verification', () => {
  // 1. Static codebase audit: Client code MUST NEVER import @google/genai or access GEMINI_API_KEY
  it('Static Audit: Frontend bundles never import @google/genai or reference GEMINI_API_KEY', () => {
    const clientDir = path.resolve(process.cwd(), 'src/client');

    function scanFiles(dir: string): string[] {
      const files: string[] = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          files.push(...scanFiles(full));
        } else if (/\.(ts|tsx|js|jsx|html)$/.test(item)) {
          files.push(full);
        }
      }
      return files;
    }

    const clientFiles = scanFiles(clientDir);
    assert.ok(clientFiles.length > 0, 'Must have frontend source files to scan');

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      // Assert no Gemini SDK imports in client
      assert.equal(
        content.includes('@google/genai'),
        false,
        `SECURITY VIOLATION: ${file} imports @google/genai directly in the frontend!`
      );

      // Assert no GEMINI_API_KEY references in client
      assert.equal(
        content.includes('GEMINI_API_KEY'),
        false,
        `SECURITY VIOLATION: ${file} references GEMINI_API_KEY in the frontend!`
      );
    }
  });

  // 2. Context Isolation: Alice's Gemini prompt context must never contain Bob's messages
  it('Context Isolation: Loaded context contains strictly the target user\'s conversation turns', async () => {
    const mockDb = new InMemoryFirestoreMock();
    const aliceUid = 'alice-100';
    const bobUid = 'bob-200';

    const aliceConv = 'alice-conv-abc';
    const bobConv = 'bob-conv-xyz';

    // Seed Alice's conversation messages
    const aliceMessagesRef = mockDb
      .collection('users')
      .doc(aliceUid)
      .collection('conversations')
      .doc(aliceConv)
      .collection('messages');

    await aliceMessagesRef.doc('msg-a1').set({
      role: 'user',
      content: "Alice's private secret note 1",
      createdAt: '2026-09-03T10:00:00Z',
    });
    await aliceMessagesRef.doc('msg-a2').set({
      role: 'model',
      content: 'Reflecting with Alice',
      createdAt: '2026-09-03T10:01:00Z',
    });

    // Seed Bob's conversation messages
    const bobMessagesRef = mockDb
      .collection('users')
      .doc(bobUid)
      .collection('conversations')
      .doc(bobConv)
      .collection('messages');

    await bobMessagesRef.doc('msg-b1').set({
      role: 'user',
      content: "Bob's confidential trade secret",
      createdAt: '2026-09-03T10:05:00Z',
    });

    // Load context for Alice
    const aliceContext = await getBoundedContext(aliceUid, aliceConv, 16, 24000, mockDb);

    // Verify context contains ONLY Alice's turns
    assert.equal(aliceContext.length, 2);
    assert.equal(aliceContext[0].content, "Alice's private secret note 1");
    assert.equal(aliceContext[1].content, 'Reflecting with Alice');

    // Cross-contamination verification: Bob's secrets must NEVER appear in Alice's context
    const serialized = JSON.stringify(aliceContext);
    assert.equal(serialized.includes("Bob's confidential trade secret"), false);
  });

  // 3. Bounded Context Limits: Capped turns and character pruning
  it('Bounded Context: Enforces strict message count limit and prunes oldest turns', async () => {
    const mockDb = new InMemoryFirestoreMock();
    const aliceUid = 'alice-turn-test';
    const convId = 'conv-large';

    const messagesRef = mockDb
      .collection('users')
      .doc(aliceUid)
      .collection('conversations')
      .doc(convId)
      .collection('messages');

    // Seed 25 turns (exceeding MAX_CONTEXT_MESSAGES limit of 5 for this test)
    for (let i = 1; i <= 25; i++) {
      await messagesRef.doc(`msg-${i.toString().padStart(2, '0')}`).set({
        role: i % 2 === 0 ? 'model' : 'user',
        content: `Turn ${i} content`,
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    }

    // Request with maxMessages = 5
    const bounded = await getBoundedContext(aliceUid, convId, 5, 24000, mockDb);

    // Must be bounded to exactly 5 turns
    assert.equal(bounded.length, 5);

    // Must contain the most recent turns (21 to 25), not the oldest
    assert.ok(bounded.some((t) => t.content === 'Turn 25 content'));
    assert.ok(!bounded.some((t) => t.content === 'Turn 1 content'));
  });
});
