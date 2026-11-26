import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import shopRoutes from '../server/routes/shop.js';
import { signToken } from '../server/middleware/auth.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('Shop / Factory Domain Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/shop', shopRoutes);

  let shopToken;

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
    shopToken = signToken({ id: 'user-apex', name: 'David Vance', role: 'shop' });

    // Seed dedicated open ticket for shop quote tests
    db.prepare(`
      INSERT OR REPLACE INTO repair_requests (
        id, customer_id, device_category, device_brand, device_model,
        issue_category, issue_title, description, location, status
      ) VALUES ('req-quote-test', 'user-alex', 'phone', 'Apple', 'iPhone 13', 'Screen', 'Cracked glass', 'Needs replacement', 'San Francisco, CA', 'open')
    `).run();
  });

  test('PATCH /api/shop/requests/:id/advance-stage advances bench stage with notes', async () => {
    const res = await request(app)
      .patch('/api/shop/requests/req-2/advance-stage')
      .set('Authorization', `Bearer ${shopToken}`)
      .send({
        status: 'quality_check',
        technicianNotes: 'Thermal camera verification passed. Clean 2.1A charging curve.'
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'quality_check');
  });

  test('Non-assigned shop cannot advance repair stage', async () => {
    const otherShopToken = signToken({ id: 'user-silicon', name: 'Kenji Sato', role: 'shop' });
    const res = await request(app)
      .patch('/api/shop/requests/req-2/advance-stage')
      .set('Authorization', `Bearer ${otherShopToken}`)
      .send({ status: 'completed' });
    assert.equal(res.status, 403);
  });

  test('Cannot advance stage when ticket is in disputed status', async () => {
    const dispReqId = `req-shop-disp-${Date.now()}`;
    db.prepare(`
      INSERT INTO repair_requests (
        id, customer_id, device_category, device_brand, device_model,
        issue_category, issue_title, description, location, status
      ) VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 13', 'Screen', 'Dispute test', 'Disputed', 'SF', 'disputed')
    `).run(dispReqId);

    const res = await request(app)
      .patch(`/api/shop/requests/${dispReqId}/advance-stage`)
      .set('Authorization', `Bearer ${shopToken}`)
      .send({ status: 'ready_for_pickup' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /disputed/);
  });

  test('POST /api/shop/quotes submits binding quote', async () => {
    const res = await request(app)
      .post('/api/shop/quotes')
      .set('Authorization', `Bearer ${shopToken}`)
      .send({
        requestId: 'req-quote-test',
        partsCost: 150,
        laborCost: 90,
        diagnosticFee: 0,
        diagnosticFeeWaived: true,
        totalCost: 240,
        partsQuality: 'Tier-1 Certified Aftermarket',
        estimatedTurnaround: '4 hours',
        turnaroundDays: 0.2,
        warrantyMonths: 3,
        technicianNotes: 'Direct screen replacement.'
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.total_cost, 240);
  });
});
