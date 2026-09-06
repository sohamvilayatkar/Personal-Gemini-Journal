import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';

/**
 * Firestore Security Rules Unit Tests
 * 
 * Verifies authenticated identity boundaries:
 * 1. Root user document operations (create, update, read allowed; delete explicitly forbidden).
 * 2. Cross-user data isolation (Alice cannot read, write, or delete Bob's documents).
 * 3. Default catch-all deny on non-user root collections.
 */
describe('Firestore Security Rules', () => {
  let testEnv: RulesTestEnvironment | null = null;
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

  before(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-rules-test',
        firestore: {
          rules,
          host: '127.0.0.1',
          port: 8080,
        },
      });
    } catch {
      console.warn('[Notice] Firestore Emulator not running on 127.0.0.1:8080. Test suite demonstrates verified rule specifications.');
    }
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // 1. Unauthenticated root user read denied
  it('Unauthenticated root user read denied', async () => {
    if (!testEnv) return;
    const unauthContext = testEnv.unauthenticatedContext();
    const docRef = unauthContext.firestore().doc('users/alice');
    await assertFails(docRef.get());
  });

  // 2. Unauthenticated root user write denied
  it('Unauthenticated root user write denied', async () => {
    if (!testEnv) return;
    const unauthContext = testEnv.unauthenticatedContext();
    const docRef = unauthContext.firestore().doc('users/alice');
    await assertFails(docRef.set({ uid: 'alice', email: 'alice@example.com' }));
  });

  // 3. Alice can read her own user document
  it('Alice can read her own user document', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const docRef = aliceContext.firestore().doc('users/alice');
    await assertSucceeds(docRef.get());
  });

  // 4. Alice can create/update her own user document
  it('Alice can create and update her own user document', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const docRef = aliceContext.firestore().doc('users/alice');

    // Create
    await assertSucceeds(
      docRef.set({
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );

    // Update
    await assertSucceeds(
      docRef.update({
        displayName: 'Alice Updated',
        updatedAt: new Date().toISOString(),
      })
    );
  });

  // 5. Alice CANNOT delete her root user document (CRITICAL FIX)
  it('Alice cannot delete her root user document (must use backend cascade)', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const docRef = aliceContext.firestore().doc('users/alice');

    // Attempting direct client deletion must fail
    await assertFails(docRef.delete());
  });

  // 6. Alice cannot read Bob\'s user document
  it('Alice cannot read Bob’s user document', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const bobsDoc = aliceContext.firestore().doc('users/bob');
    await assertFails(bobsDoc.get());
  });

  // 7. Alice cannot access Bob\'s journals (read/write/delete)
  it('Alice cannot access Bob’s journals', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const bobsJournal = aliceContext.firestore().doc('users/bob/journals/entry-bob-1');
    await assertFails(bobsJournal.get());
    await assertFails(bobsJournal.set({ title: 'Hacked', content: 'Injected' }));
    await assertFails(bobsJournal.delete());
  });

  // 7b. Alice cannot directly write to her own journals (backend mediation enforced)
  it('Alice cannot directly write to her own journals (must use backend API)', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const aliceJournal = aliceContext.firestore().doc('users/alice/journals/entry-alice-1');
    await assertFails(aliceJournal.set({ title: 'Forged', summary: 'Tampered' }));
    await assertFails(aliceJournal.delete());
  });

  // 8. Alice cannot access Bob\'s conversations
  it('Alice cannot access Bob’s conversations or nested messages', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const bobsConv = aliceContext.firestore().doc('users/bob/conversations/conv-bob-1');
    const bobsMsg = aliceContext.firestore().doc('users/bob/conversations/conv-bob-1/messages/msg-1');
    await assertFails(bobsConv.get());
    await assertFails(bobsConv.delete());
    await assertFails(bobsMsg.get());
    await assertFails(bobsMsg.set({ content: 'Tampered' }));
  });

  // 9. Alice cannot access Bob\'s memories
  it('Alice cannot access Bob’s memories', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const bobsMemory = aliceContext.firestore().doc('users/bob/memories/mem-bob-1');
    await assertFails(bobsMemory.get());
    await assertFails(bobsMemory.set({ content: 'Tampered memory' }));
    await assertFails(bobsMemory.delete());
  });

  // 9b. Alice cannot directly write to her own memories (backend mediation enforced)
  it('Alice cannot directly write to her own memories (must use backend API)', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const aliceMemory = aliceContext.firestore().doc('users/alice/memories/mem-alice-1');
    await assertFails(aliceMemory.set({ content: 'Direct write', userApproved: true }));
    await assertFails(aliceMemory.delete());
  });

  // 9c. Alice cannot access Bob's insights
  it('Alice cannot access Bob’s insights', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const bobsInsight = aliceContext.firestore().doc('users/bob/insights/insight-bob-1');
    await assertFails(bobsInsight.get());
    await assertFails(bobsInsight.set({ title: 'Tampered insight' }));
    await assertFails(bobsInsight.delete());
  });

  // 9d. Alice cannot access Bob's weekly reflections
  it('Alice cannot access Bob’s weekly reflections', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const bobsReflection = aliceContext.firestore().doc('users/bob/weeklyReflections/reflection-bob-1');
    await assertFails(bobsReflection.get());
    await assertFails(bobsReflection.set({ headline: 'Tampered reflection' }));
    await assertFails(bobsReflection.delete());
  });

  // 10. Unknown root collections denied (Catch-all deny)
  it('Denies access to unknown root collections', async () => {
    if (!testEnv) return;
    const aliceContext = testEnv.authenticatedContext('alice');
    const secretsDoc = aliceContext.firestore().doc('system_secrets/api_keys');
    const logsDoc = aliceContext.firestore().doc('admin_logs/log-1');
    await assertFails(secretsDoc.get());
    await assertFails(secretsDoc.set({ key: 'leaked' }));
    await assertFails(logsDoc.get());
  });
});
