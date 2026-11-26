import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import sharedRoutes from '../server/routes/shared.js';
import uploadRoutes from '../server/routes/upload.js';
import { signToken } from '../server/middleware/auth.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('Shared & Upload Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/shared', sharedRoutes);
  app.use('/api/upload', uploadRoutes);

  after(() => {
    closeDatabase();
    const dbPath = process.env.DB_PATH;
    if (dbPath && dbPath.includes('test-fixcraft')) {
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
      try { if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`); } catch {}
      try { if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`); } catch {}
    }
  });

  before(() => {
    initDatabase();
  });

  test('POST /api/upload requires authentication', async () => {
    const res = await request(app).post('/api/upload');
    assert.equal(res.status, 401, 'Unauthenticated upload must be rejected');
  });

  test('POST /api/upload rejects non-image files with clean JSON 400', async () => {
    const token = signToken({ id: 'user-admin', name: 'Admin', role: 'admin' });
    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('malicious script'), 'payload.exe');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Only image files/);
  });

  test('Participant can post and retrieve messages on their ticket', async () => {
    const customerToken = signToken({ id: 'user-alex', name: 'Alex Morgan', role: 'customer' });
    const postRes = await request(app)
      .post('/api/shared/requests/req-2/messages')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ content: 'Are the diagnostics completed?' });
    assert.equal(postRes.status, 201);
    assert.equal(postRes.body.content, 'Are the diagnostics completed?');

    const getRes = await request(app)
      .get('/api/shared/requests/req-2/messages')
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(getRes.status, 200);
    assert.ok(Array.isArray(getRes.body));
    assert.ok(getRes.body.some(m => m.content === 'Are the diagnostics completed?'));
  });

  test('GET /api/shared/shops returns public workshop directory', async () => {
    const res = await request(app).get('/api/shared/shops');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
    assert.ok(res.body[0].name);
  });
});

