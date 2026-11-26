import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import adminRoutes from '../server/routes/admin.js';
import { signToken } from '../server/middleware/auth.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('Admin Domain Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  let adminToken;
  let testDisputeId;

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
    adminToken = signToken({ id: 'user-admin', name: 'Admin', role: 'admin' });

    const reqId = `req-admin-disp-${Date.now()}`;
    const escId = `esc-admin-disp-${Date.now()}`;
    testDisputeId = `disp-admin-test-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (
        id, customer_id, device_category, device_brand, device_model,
        issue_category, issue_title, description, location, status
      ) VALUES (?, 'user-alex', 'phone', 'Google', 'Pixel 8', 'Screen', 'Line', 'OLED line', 'SF', 'disputed')
    `).run(reqId);

    db.prepare(`
      INSERT INTO escrow_ledger (
        id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount,
        customer_refund_amount, shop_payout_amount, status
      ) VALUES (?, ?, 'user-alex', 'shop-1', 340, 17, 340, 0, 0, 'disputed_frozen')
    `).run(escId, reqId);

    db.prepare(`
      INSERT INTO disputes (
        id, request_id, escrow_id, opened_by_user_id, reason, customer_statement,
        resolution_customer_amount, resolution_shop_amount, resolution
      ) VALUES (?, ?, ?, 'user-alex', 'Defective screen', 'Defective', 0, 0, 'pending')
    `).run(testDisputeId, reqId, escId);
  });

  test('GET /api/admin/metrics returns marketplace aggregate statistics', async () => {
    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.totalUsers === 'number');
    assert.ok(typeof res.body.totalShops === 'number');
    assert.ok(typeof res.body.totalRequests === 'number');
    assert.ok(typeof res.body.escrowHeldTotal === 'number');
  });

  test('POST /api/admin/disputes/:id/resolve handles split_payout atomically', async () => {
    const res = await request(app)
      .post(`/api/admin/disputes/${testDisputeId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        resolution: 'split_payout',
        customerRefundAmount: 140,
        shopPayoutAmount: 200,
        adminNotes: 'Customer compensated for cosmetic scratch; technician paid for motherboard rework.'
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.dispute.resolution, 'split_payout');
    assert.equal(res.body.escrow.status, 'split_payout');
    assert.equal(res.body.escrow.customer_refund_amount, 140);
    assert.equal(res.body.escrow.shop_payout_amount, 200);
  });

  test('POST /api/admin/disputes/:id/resolve handles refund_customer correctly without CHECK violation', async () => {
    const reqId = `req-ref-${Date.now()}`;
    const escId = `esc-ref-${Date.now()}`;
    const dispId = `disp-ref-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone', 'Screen', 'T', 'D', 'SF', 'disputed')
    `).run(reqId);

    db.prepare(`
      INSERT INTO escrow_ledger (id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount, status)
      VALUES (?, ?, 'user-alex', 'shop-1', 200, 10, 200, 'disputed_frozen')
    `).run(escId, reqId);

    db.prepare(`
      INSERT INTO disputes (id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, resolution)
      VALUES (?, ?, ?, 'user-alex', 'Defective', 'Bad repair', 'pending')
    `).run(dispId, reqId, escId);

    const res = await request(app)
      .post(`/api/admin/disputes/${dispId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'refund_customer', adminNotes: 'Full refund to customer' });

    assert.equal(res.status, 200);
    assert.equal(res.body.escrow.status, 'refunded_to_customer');
    assert.equal(res.body.escrow.customer_refund_amount, 200);
  });

  test('POST /api/admin/disputes/:id/resolve handles release_to_shop correctly without CHECK violation', async () => {
    const reqId = `req-rel-${Date.now()}`;
    const escId = `esc-rel-${Date.now()}`;
    const dispId = `disp-rel-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone', 'Screen', 'T', 'D', 'SF', 'disputed')
    `).run(reqId);

    db.prepare(`
      INSERT INTO escrow_ledger (id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount, status)
      VALUES (?, ?, 'user-alex', 'shop-1', 200, 10, 200, 'disputed_frozen')
    `).run(escId, reqId);

    db.prepare(`
      INSERT INTO disputes (id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, resolution)
      VALUES (?, ?, ?, 'user-alex', 'Defective', 'Bad repair', 'pending')
    `).run(dispId, reqId, escId);

    const res = await request(app)
      .post(`/api/admin/disputes/${dispId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'release_to_shop', adminNotes: 'Payout to shop' });

    assert.equal(res.status, 200);
    assert.equal(res.body.escrow.status, 'released_to_shop');
    assert.equal(res.body.escrow.shop_payout_amount, 190);
  });

  test('Arbitration split exceeding total escrow amount is rejected with 400', async () => {
    const reqId = `req-inv-${Date.now()}`;
    const escId = `esc-inv-${Date.now()}`;
    const dispId = `disp-inv-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone', 'Screen', 'T', 'D', 'SF', 'disputed')
    `).run(reqId);

    db.prepare(`
      INSERT INTO escrow_ledger (id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount, status)
      VALUES (?, ?, 'user-alex', 'shop-1', 200, 10, 200, 'disputed_frozen')
    `).run(escId, reqId);

    db.prepare(`
      INSERT INTO disputes (id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, resolution)
      VALUES (?, ?, ?, 'user-alex', 'Defective', 'Bad repair', 'pending')
    `).run(dispId, reqId, escId);

    const res = await request(app)
      .post(`/api/admin/disputes/${dispId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        resolution: 'split_payout',
        customerRefundAmount: 500,
        shopPayoutAmount: 500
      });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Split amounts/);
  });
});
