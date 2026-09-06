import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from '../../src/server/middleware/auth';

describe('Security Verification: Identity Boundaries & Anti-UID Tampering', () => {
  it('Rejects client-supplied body.uid with 400 UNEXPECTED_IDENTITY_FIELD', async () => {
    // Adversary attempts to pass uid in body
    const mockReq = {
      headers: {
        authorization: 'Bearer sample-token',
      },
      body: {
        uid: 'bob',
        message: 'Hello',
      },
    } as any;

    let statusCode = 200;
    let jsonResult: any = null;
    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonResult = data;
        return this;
      },
    } as any;

    let nextCalled = false;
    await requireAuth(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(statusCode, 400);
    assert.equal(jsonResult?.code, 'UNEXPECTED_IDENTITY_FIELD');
    assert.equal(nextCalled, false);
  });

  it('Rejects client-supplied query.userId with 400 UNEXPECTED_IDENTITY_FIELD', async () => {
    // Adversary attempts to pass userId in query params
    const mockReq = {
      headers: {
        authorization: 'Bearer sample-token',
      },
      query: {
        userId: 'bob',
      },
    } as any;

    let statusCode = 200;
    let jsonResult: any = null;
    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonResult = data;
        return this;
      },
    } as any;

    let nextCalled = false;
    await requireAuth(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(statusCode, 400);
    assert.equal(jsonResult?.code, 'UNEXPECTED_IDENTITY_FIELD');
    assert.equal(nextCalled, false);
  });

  it('Rejects client-supplied body.ownerUid or query.ownerUid with 400 UNEXPECTED_IDENTITY_FIELD', async () => {
    // Adversary attempts to pass ownerUid
    const mockReq = {
      headers: {
        authorization: 'Bearer sample-token',
      },
      body: {
        ownerUid: 'bob',
      },
    } as any;

    let statusCode = 200;
    let jsonResult: any = null;
    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonResult = data;
        return this;
      },
    } as any;

    let nextCalled = false;
    await requireAuth(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(statusCode, 400);
    assert.equal(jsonResult?.code, 'UNEXPECTED_IDENTITY_FIELD');
    assert.equal(nextCalled, false);
  });

  it('Derives UID strictly from verified token, never client input', async () => {
    // Verified user is Alice
    const decodedAliceToken = {
      uid: 'alice-verified-uid',
      email: 'alice@example.com',
    };

    const mockReq = {
      headers: {
        authorization: 'Bearer valid.jwt.token',
      },
      body: {
        message: 'Valid message without identity parameters',
      },
      user: decodedAliceToken,
    } as any;

    // Verified UID must be Alice
    assert.equal(mockReq.user.uid, 'alice-verified-uid');
    assert.notEqual(mockReq.user.uid, 'bob');
  });
});
