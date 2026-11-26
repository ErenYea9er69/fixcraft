import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import clientRoutes from '../server/routes/client.js';
import { signToken } from '../server/middleware/auth.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('Client Domain Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/client', clientRoutes);

  let customerToken;
  let testQuoteId;
  before(() => {
    initDatabase();
    customerToken = signToken({ id: 'user-alex', name: 'Alex Morgan', role: 'customer' });

    const reqId = `req-accept-test-${Date.now()}`;
    testQuoteId = `q-accept-test-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (
        id, customer_id, device_category, device_brand, device_model,
        issue_category, issue_title, description, location, status
      ) VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 15', 'Screen', 'OLED crack', 'Fix it', 'SF', 'open')
    `).run(reqId);

    db.prepare(`
      INSERT INTO quotes (
        id, request_id, shop_id, parts_cost, labor_cost, total_cost,
        parts_quality, estimated_turnaround, status
      ) VALUES (?, ?, 'shop-1', 100, 50, 150, 'OEM Genuine', '1 day', 'pending')
    `).run(testQuoteId, reqId);

    // Seed dedicated expired warranty ticket for this test
    const daysAgo = (d) => new Date(Date.now() - d * 24 * 3600 * 1000).toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO repair_requests (
        id, customer_id, device_category, device_brand, device_model,
        issue_category, issue_title, description, location, status,
        accepted_quote_id, completed_at, created_at, updated_at
      ) VALUES (
        'req-expired-stub', 'user-alex', 'laptop', 'Lenovo', 'ThinkPad X1',
        'Battery', 'Swollen battery', 'Battery replacement completed long ago.',
        'San Francisco', 'completed', null, ?, ?, ?
      )
    `).run(daysAgo(400), daysAgo(400), daysAgo(400));
  });

  after(() => {
    closeDatabase();
    const dbPath = process.env.DB_PATH;
    if (dbPath && dbPath.includes('test-fixcraft')) {
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
      try { if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`); } catch {}
      try { if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`); } catch {}
    }
  });

  test('POST /api/client/requests creates a new repair ticket', async () => {
    const res = await request(app)
      .post('/api/client/requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        deviceCategory: 'phone',
        deviceBrand: 'Apple',
        deviceModel: 'iPhone 14 Pro',
        issueCategory: 'Battery',
        issueTitle: 'Battery degrading quickly',
        description: 'Battery health at 74% and drains fast',
        location: 'San Francisco, CA'
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.customer_id, 'user-alex');
    assert.equal(res.body.status, 'open');
  });

  test('POST /api/client/quotes/:id/accept locks escrow atomically', async () => {
    const res = await request(app)
      .post(`/api/client/quotes/${testQuoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.escrow.status, 'held_in_escrow');
  });

  test('POST /api/client/warranty/claim rejects expired warranties', async () => {
    const res = await request(app)
      .post('/api/client/warranty/claim')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        requestId: 'req-expired-stub',
        claimIssue: 'Screen flickering again'
      });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('expired') || res.body.error.toLowerCase().includes('warranty'));
  });
});
