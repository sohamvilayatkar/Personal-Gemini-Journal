import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createConversation,
  listConversations,
  getConversation,
  listMessages,
  addMessage,
  deleteConversationRecursively,
} from '../../src/server/services/conversationService';
import { InMemoryFirestoreMock } from '../helpers/mockDb';

describe('Conversation Service & IDOR Prevention', () => {
  it('Scoping: Backend derives target path exclusively from verified token UID', async () => {
    const verifiedAliceUid = 'alice-123';
    const bobsConversationId = 'bob-secret-conv-999';

    // Mock Firestore where Alice does not have this conversation
    const mockDb = {
      collection: (col: string) => {
        assert.equal(col, 'users');
        return {
          doc: (userDoc: string) => {
            // Must target Alice's user document, NEVER Bob
            assert.equal(userDoc, verifiedAliceUid);
            return {
              collection: (subCol: string) => {
                assert.equal(subCol, 'conversations');
                return {
                  doc: (convDoc: string) => {
                    assert.equal(convDoc, bobsConversationId);
                    return {
                      get: async () => ({ exists: false, data: () => null }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    // Alice attempts to delete Bob's conversation
    const result = await deleteConversationRecursively(verifiedAliceUid, bobsConversationId, mockDb);
    assert.equal(result.notFound, true);
    assert.equal(result.success, false);
  });

  it('Recursively deletes conversation and all nested messages', async () => {
    const verifiedAliceUid = 'alice-123';
    const aliceConvId = 'alice-conv-456';

    const deletedPaths: string[] = [];

    const mockMessages = [
      { ref: { path: `users/${verifiedAliceUid}/conversations/${aliceConvId}/messages/msg-1` } },
      { ref: { path: `users/${verifiedAliceUid}/conversations/${aliceConvId}/messages/msg-2` } },
      { ref: { path: `users/${verifiedAliceUid}/conversations/${aliceConvId}/messages/msg-3` } },
    ];

    const mockDb = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: (convId: string) => {
              const convRef = {
                path: `users/${verifiedAliceUid}/conversations/${convId}`,
                get: async () => ({
                  exists: true,
                  data: () => ({ id: convId, userId: verifiedAliceUid, title: 'Test Conv' }),
                }),
                collection: (subCol: string) => {
                  assert.equal(subCol, 'messages');
                  return {
                    get: async () => ({
                      docs: mockMessages,
                    }),
                  };
                },
              };
              return convRef;
            },
          }),
        }),
      }),
      batch: () => ({
        delete: (ref: any) => {
          deletedPaths.push(ref.path);
        },
        commit: async () => {},
      }),
    };

    const result = await deleteConversationRecursively(verifiedAliceUid, aliceConvId, mockDb);
    assert.equal(result.success, true);
    assert.equal(result.deletedMessagesCount, 3);

    // Verify all 3 messages and the parent conversation were deleted
    assert.equal(deletedPaths.length, 4);
    assert.ok(deletedPaths.includes(`users/${verifiedAliceUid}/conversations/${aliceConvId}/messages/msg-1`));
    assert.ok(deletedPaths.includes(`users/${verifiedAliceUid}/conversations/${aliceConvId}/messages/msg-2`));
    assert.ok(deletedPaths.includes(`users/${verifiedAliceUid}/conversations/${aliceConvId}/messages/msg-3`));
    assert.ok(deletedPaths.includes(`users/${verifiedAliceUid}/conversations/${aliceConvId}`));
  });

  it('Rejects execution when mandatory identity or conversation arguments are missing', async () => {
    await assert.rejects(
      async () => {
        await deleteConversationRecursively('', 'conv-1');
      },
      {
        message: /Invalid arguments/,
      }
    );

    await assert.rejects(
      async () => {
        await deleteConversationRecursively('alice', '');
      },
      {
        message: /Invalid arguments/,
      }
    );
  });

  it('Creates conversation with server-controlled timestamps and zero message count', async () => {
    const mockDb = new InMemoryFirestoreMock();
    const aliceUid = 'alice-svc-test';

    const conv = await createConversation(aliceUid, 'Evening Reflection', mockDb);
    assert.ok(conv.id);
    assert.equal(conv.title, 'Evening Reflection');
    assert.equal(conv.messageCount, 0);
    assert.equal(conv.archived, false);
    assert.equal(conv.lastMessageAt, null);

    // Verify written to users/{aliceUid}/conversations/{conv.id}
    const retrieved = await getConversation(aliceUid, conv.id, mockDb);
    assert.ok(retrieved);
    assert.equal(retrieved.id, conv.id);
    assert.equal(retrieved.title, 'Evening Reflection');
  });

  it('Anti-IDOR: Alice cannot retrieve Bob\'s conversation (getConversation returns null)', async () => {
    const mockDb = new InMemoryFirestoreMock();
    const aliceUid = 'alice-idor-test';
    const bobUid = 'bob-idor-test';

    // Bob creates a conversation
    const bobsConv = await createConversation(bobUid, "Bob's Secret Plans", mockDb);

    // Alice queries for Bob's conversation under Alice's scope
    const aliceAttempt = await getConversation(aliceUid, bobsConv.id, mockDb);
    assert.equal(aliceAttempt, null);
  });

  it('Adds message, updates conversation metadata, and increments messageCount', async () => {
    const mockDb = new InMemoryFirestoreMock();
    const aliceUid = 'alice-msg-test';

    const conv = await createConversation(aliceUid, 'New Reflection', mockDb);

    // Add first user message
    const userMsg = await addMessage(aliceUid, conv.id, 'user', 'Feeling tired today.', mockDb);
    assert.equal(userMsg.role, 'user');
    assert.equal(userMsg.content, 'Feeling tired today.');

    await new Promise((r) => setTimeout(r, 15));

    // Add model reply
    const modelMsg = await addMessage(aliceUid, conv.id, 'model', 'I hear you. Rest is important.', mockDb);
    assert.equal(modelMsg.role, 'model');

    // Fetch conversation and messages
    const updatedConv = await getConversation(aliceUid, conv.id, mockDb);
    assert.ok(updatedConv);
    assert.equal(updatedConv.messageCount, 2);
    assert.ok(updatedConv.lastMessageAt);

    const msgsResult = await listMessages(aliceUid, conv.id, 50, mockDb);
    assert.equal(msgsResult.messages.length, 2);
    assert.equal(msgsResult.messages[0].role, 'user');
    assert.equal(msgsResult.messages[1].role, 'model');
  });
});
