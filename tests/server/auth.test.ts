import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from '../../src/server/middleware/auth';

describe('requireAuth Middleware Verification', () => {
  it('Rejects missing Authorization header with 401 AUTH_REQUIRED', async () => {
    let statusCode = 200;
    let jsonResult: any = null;

    const mockReq = { headers: {} } as any;
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

    assert.equal(statusCode, 401);
    assert.equal(jsonResult?.code, 'AUTH_REQUIRED');
    assert.equal(nextCalled, false);
  });

  it('Rejects malformed Authorization header without Bearer prefix', async () => {
    let statusCode = 200;
    let jsonResult: any = null;

    const mockReq = { headers: { authorization: 'Basic dXNlcjpwYXNz' } } as any;
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

    assert.equal(statusCode, 401);
    assert.equal(jsonResult?.code, 'AUTH_REQUIRED');
    assert.equal(nextCalled, false);
  });

  it('Rejects forged/invalid token string', async () => {
    let statusCode = 200;
    let jsonResult: any = null;

    const mockReq = { headers: { authorization: 'Bearer invalid.forged.jwt.token' } } as any;
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

    assert.equal(statusCode, 401);
    assert.equal(jsonResult?.code, 'AUTH_VERIFICATION_FAILED');
    assert.equal(nextCalled, false);
  });
});
