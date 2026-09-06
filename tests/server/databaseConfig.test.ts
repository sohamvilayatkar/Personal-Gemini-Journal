import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTargetFirebaseProjectId,
  getTargetFirestoreDatabaseId,
  getAdminFirestore,
  getFirebaseAdmin,
  resetAdminAppForTesting,
} from '../../src/server/services/firebaseAdmin';
import { createExpressApp } from '../../src/server/app';
import http from 'http';

describe('Named Firestore Database Configuration (personal-gemini-journal)', () => {
  it('correctly targets project quick-district-507517-f7 by default', () => {
    const projectId = getTargetFirebaseProjectId();
    assert.equal(projectId, 'quick-district-507517-f7');
  });

  it('correctly targets named database personal-gemini-journal by default', () => {
    const databaseId = getTargetFirestoreDatabaseId();
    assert.equal(databaseId, 'personal-gemini-journal');
  });

  it('initializes Firestore client with databaseId personal-gemini-journal', () => {
    resetAdminAppForTesting();
    const db = getAdminFirestore();
    assert.ok(db, 'Firestore instance should be created');
    assert.equal(
      db.databaseId,
      'personal-gemini-journal',
      'Firestore Admin client must explicitly target personal-gemini-journal'
    );
  });

  it('reports firebaseProject and firestoreDatabase on GET /api/health', async () => {
    const app = createExpressApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as any;
    const url = `http://127.0.0.1:${addr.port}/api/health`;

    try {
      const res = await fetch(url);
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.status, 'ok');
      assert.equal(data.firebaseProject, 'quick-district-507517-f7');
      assert.equal(data.firestoreDatabase, 'personal-gemini-journal');
    } finally {
      server.close();
    }
  });
});
