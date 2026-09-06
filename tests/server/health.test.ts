import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createExpressApp } from '../../src/server/app';

describe('Server Health Endpoint', () => {
  const app = createExpressApp();

  it('GET /api/health returns safe operational payload', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as any;
    const port = address.port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(response.status, 200);

      const jsonResult: any = await response.json();

      // Assert safe response structure
      assert.equal(jsonResult?.status, 'ok');
      assert.ok(jsonResult?.timestamp);
      assert.equal(jsonResult?.version, '1.0.0');

      // Security assertions: NO sensitive secrets exposed
      assert.equal(jsonResult?.GEMINI_API_KEY, undefined);
      assert.equal(jsonResult?.env, undefined);
      assert.equal(jsonResult?.credentials, undefined);
      assert.equal(jsonResult?.secret, undefined);
    } finally {
      server.close();
    }
  });
});

