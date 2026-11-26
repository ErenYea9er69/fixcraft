import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import app from '../server/server.js';
import { signToken } from '../server/middleware/auth.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('Section 8 - Task 8.2: Complete Route Coverage & Negative RBAC Verification', () => {
  let adminToken;
  let cust1Token;
  let cust2Token;
  let shop1Token;
  let shop2Token;

  const cust1Id = 'user-cov-cust-1';
  const cust2Id = 'user-cov-cust-2';
  const shop1UserId = 'user-cov-shop-1';
  const shop2UserId = 'user-cov-shop-2';
  const shop1Id = 'shop-cov-1';
  const shop2Id = 'shop-cov-2';

  before(() => {
    initDatabase();

    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
      VALUES (?, 'Coverage Customer 1', 'covcust1@fixcraft.local', 'hash', 'customer')
    `).run(cust1Id);

    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
      VALUES (?, 'Coverage Customer 2', 'covcust2@fixcraft.local', 'hash', 'customer')
    `).run(cust2Id);

    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
      VALUES (?, 'Coverage Shop 1 User', 'covshop1@fixcraft.local', 'hash', 'shop')
    `).run(shop1UserId);

    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
      VALUES (?, 'Coverage Shop 2 User', 'covshop2@fixcraft.local', 'hash', 'shop')
    `).run(shop2UserId);

    db.prepare(`
      INSERT OR IGNORE INTO shops (
        id, user_id, name, address, city, phone, email, specialties, verified
      ) VALUES (?, ?, 'Coverage Shop Alpha', '500 Market St', 'SF', '555-0201', 'alpha@cov.local', '["phone", "laptop"]', 1)
    `).run(shop1Id, shop1UserId);

    db.prepare(`
      INSERT OR IGNORE INTO shops (
        id, user_id, name, address, city, phone, email, specialties, verified
      ) VALUES (?, ?, 'Coverage Shop Beta', '600 Market St', 'SF', '555-0202', 'beta@cov.local', '["appliance"]', 1)
    `).run(shop2Id, shop2UserId);

    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
      VALUES ('user-cov-dummy-toggle', 'Toggle User', 'covtoggle@fixcraft.local', 'hash', 'customer')
    `).run();

    adminToken = signToken({ id: 'user-admin', name: 'FixCraft Operations Admin', role: 'admin' });
    cust1Token = signToken({ id: cust1Id, name: 'Coverage Customer 1', role: 'customer' });
    cust2Token = signToken({ id: cust2Id, name: 'Coverage Customer 2', role: 'customer' });
    shop1Token = signToken({ id: shop1UserId, name: 'Coverage Shop 1 User', role: 'shop' });
    shop2Token = signToken({ id: shop2UserId, name: 'Coverage Shop 2 User', role: 'shop' });
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

  describe('Admin Routes Coverage', () => {
    test('GET /api/admin/users returns list of users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
      assert.ok(res.body[0].email);
      assert.ok(res.body[0].role);
    });

    test('PATCH /api/admin/users/:id/status rejects administrator self-suspension with 400', async () => {
      const res = await request(app)
        .patch('/api/admin/users/user-admin/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Administrators cannot modify their own active status');
    });

    test('PATCH /api/admin/users/:id/status returns 404 for missing user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/user-nonexistent-999/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'User not found');
    });

    test('PATCH /api/admin/users/:id/status suspends and reactivates user', async () => {
      const targetUserId = 'user-cov-dummy-toggle';
      const suspendRes = await request(app)
        .patch(`/api/admin/users/${targetUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      assert.equal(suspendRes.status, 200);
      assert.equal(suspendRes.body.success, true);

      const suspendedUser = db.prepare('SELECT is_active, token_version FROM users WHERE id = ?').get(targetUserId);
      assert.equal(suspendedUser.is_active, 0);

      const activateRes = await request(app)
        .patch(`/api/admin/users/${targetUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });
      assert.equal(activateRes.status, 200);
      assert.equal(activateRes.body.success, true);

      const activeUser = db.prepare('SELECT is_active FROM users WHERE id = ?').get(targetUserId);
      assert.equal(activeUser.is_active, 1);
    });

    test('GET /api/admin/shops/pending and PATCH /api/admin/shops/:id/verify', async () => {
      const unverifiedUserId = 'user-cov-unverified-shop';
      const unverifiedShopId = 'shop-cov-unverified';

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Unverified Shop User', 'unverifiedshop@fixcraft.local', 'hash', 'shop')
      `).run(unverifiedUserId);

      db.prepare(`
        INSERT OR IGNORE INTO shops (
          id, user_id, name, address, city, phone, email, specialties, verified
        ) VALUES (?, ?, 'Unverified Shop', '700 Main St', 'SF', '555-0203', 'unverified@cov.local', '["phone"]', 0)
      `).run(unverifiedShopId, unverifiedUserId);

      const pendingRes = await request(app)
        .get('/api/admin/shops/pending')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(pendingRes.status, 200);
      assert.ok(Array.isArray(pendingRes.body));
      assert.ok(pendingRes.body.some((s) => s.id === unverifiedShopId && (s.verified === 0 || s.verified === false)));

      const missingRes = await request(app)
        .patch('/api/admin/shops/shop-nonexistent-999/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ verified: true });
      assert.equal(missingRes.status, 404);

      const verifyRes = await request(app)
        .patch(`/api/admin/shops/${unverifiedShopId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ verified: true });
      assert.equal(verifyRes.status, 200);
      assert.ok(verifyRes.body.verified === true || verifyRes.body.verified === 1);

      const verifiedRecord = db.prepare('SELECT verified FROM shops WHERE id = ?').get(unverifiedShopId);
      assert.equal(verifiedRecord.verified, 1);
    });

    test('GET /api/admin/escrow returns escrow ledger records', async () => {
      const res = await request(app)
        .get('/api/admin/escrow')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    test('GET /api/admin/disputes returns dispute records', async () => {
      const res = await request(app)
        .get('/api/admin/disputes')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    test('GET /api/admin/audit-logs returns audit log entries', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('Client Routes Coverage', () => {
    const openReqId = 'req-cov-cancel-open';
    const nonOpenReqId = 'req-cov-cancel-closed';
    const dispReqId = 'req-cov-dispute-target';
    const dispQuoteId = 'q-cov-dispute-target';
    const dispEscrowId = 'escrow-cov-dispute-target';

    before(() => {
      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status
        ) VALUES (
          ?, ?, 'phone', 'Apple', 'iPhone 12', 'Screen',
          'Cracked Glass', 'Glass cracked', 'SF', 'open'
        )
      `).run(openReqId, cust1Id);

      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status
        ) VALUES (
          ?, ?, 'laptop', 'Apple', 'MacBook Air', 'Keyboard',
          'Sticky keys', 'Keys sticky', 'SF', 'in_repair'
        )
      `).run(nonOpenReqId, cust1Id);

      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status, accepted_quote_id
        ) VALUES (
          ?, ?, 'phone', 'Apple', 'iPhone 13', 'Camera',
          'Blurry lens', 'Lens blurry', 'SF', 'quote_accepted', NULL
        )
      `).run(dispReqId, cust1Id);

      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (
          ?, ?, ?, 90, 50, 140, 'OEM Genuine', '1 day', 'accepted'
        )
      `).run(dispQuoteId, dispReqId, shop1Id);

      db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(dispQuoteId, dispReqId);

      db.prepare(`
        INSERT INTO escrow_ledger (
          id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount,
          customer_refund_amount, shop_payout_amount, status
        ) VALUES (
          ?, ?, ?, ?, 140, 7, 140, 0, 0, 'held_in_escrow'
        )
      `).run(dispEscrowId, dispReqId, cust1Id, shop1Id);
    });

    test('GET /api/client/requests returns customer requests', async () => {
      const res = await request(app)
        .get('/api/client/requests')
        .set('Authorization', `Bearer ${cust1Token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some((r) => r.id === openReqId));
    });

    test('DELETE /api/client/requests/:id successfully cancels open ticket', async () => {
      const res = await request(app)
        .delete(`/api/client/requests/${openReqId}`)
        .set('Authorization', `Bearer ${cust1Token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const record = db.prepare('SELECT status FROM repair_requests WHERE id = ?').get(openReqId);
      assert.equal(record.status, 'cancelled');
    });

    test('DELETE /api/client/requests/:id returns 400 when cancelling non-open ticket', async () => {
      const res = await request(app)
        .delete(`/api/client/requests/${nonOpenReqId}`)
        .set('Authorization', `Bearer ${cust1Token}`);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Cannot cancel ticket after a quote has been accepted. Please raise a dispute or contact workshop.');
    });

    test('POST /api/client/requests/:id/dispute validates fields and creates dispute', async () => {
      const missingFieldsRes = await request(app)
        .post(`/api/client/requests/${dispReqId}/dispute`)
        .set('Authorization', `Bearer ${cust1Token}`)
        .send({});
      assert.equal(missingFieldsRes.status, 400);

      const missingReqRes = await request(app)
        .post('/api/client/requests/req-nonexistent-999/dispute')
        .set('Authorization', `Bearer ${cust1Token}`)
        .send({ reason: 'Test', customerStatement: 'Details' });
      assert.equal(missingReqRes.status, 404);

      const validRes = await request(app)
        .post(`/api/client/requests/${dispReqId}/dispute`)
        .set('Authorization', `Bearer ${cust1Token}`)
        .send({
          reason: 'Excessive delay',
          customerStatement: 'Shop has stopped responding for two weeks.',
        });
      assert.equal(validRes.status, 201);
      assert.equal(validRes.body.success, true);

      const reqRecord = db.prepare('SELECT status FROM repair_requests WHERE id = ?').get(dispReqId);
      assert.equal(reqRecord.status, 'disputed');

      const escrowRecord = db.prepare('SELECT status FROM escrow_ledger WHERE id = ?').get(dispEscrowId);
      assert.equal(escrowRecord.status, 'disputed_frozen');
    });
  });

  describe('Shop Routes Coverage', () => {
    const inboundReqId = 'req-cov-inbound-1';
    const benchReqId = 'req-cov-bench-1';
    const benchQuoteId = 'q-cov-bench-1';
    const withdrawQuoteId = 'q-cov-withdraw-1';
    const dispId = 'disp-cov-shop-target';
    const dispEscrowId = 'escrow-cov-shop-target';
    const claimId = 'claim-cov-1';

    before(() => {
      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status
        ) VALUES (
          ?, ?, 'phone', 'Apple', 'iPhone 11', 'Battery',
          'Battery drain', 'Battery drains quickly', 'SF', 'open'
        )
      `).run(inboundReqId, cust1Id);

      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status, accepted_quote_id
        ) VALUES (
          ?, ?, 'phone', 'Apple', 'iPhone 15', 'Screen',
          'Cracked front panel', 'Panel fractured', 'SF', 'in_repair', NULL
        )
      `).run(benchReqId, cust1Id);

      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (
          ?, ?, ?, 150, 50, 200, 'OEM Genuine', '1 day', 'accepted'
        )
      `).run(benchQuoteId, benchReqId, shop1Id);

      db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(benchQuoteId, benchReqId);

      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (
          ?, ?, ?, 70, 30, 100, 'OEM Genuine', '4 hours', 'pending'
        )
      `).run(withdrawQuoteId, inboundReqId, shop1Id);

      db.prepare(`
        INSERT INTO escrow_ledger (
          id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount,
          customer_refund_amount, shop_payout_amount, status
        ) VALUES (
          ?, ?, ?, ?, 200, 10, 200, 0, 0, 'disputed_frozen'
        )
      `).run(dispEscrowId, benchReqId, cust1Id, shop1Id);

      db.prepare(`
        INSERT INTO disputes (
          id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, resolution
        ) VALUES (
          ?, ?, ?, ?, 'Slow turnaround', 'Part was promised last week', 'pending'
        )
      `).run(dispId, benchReqId, dispEscrowId, cust1Id);

      db.prepare(`
        INSERT INTO warranty_claims (
          id, request_id, shop_id, customer_id, claim_issue, status, warranty_expiry_date
        ) VALUES (
          ?, ?, ?, ?, 'FaceID ceased working after screen swap', 'submitted', datetime('now', '+30 days')
        )
      `).run(claimId, benchReqId, shop1Id, cust1Id);
    });

    test('GET /api/shop/profile returns profile data', async () => {
      const res = await request(app)
        .get('/api/shop/profile')
        .set('Authorization', `Bearer ${shop1Token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.id, shop1Id);
      assert.ok(Array.isArray(res.body.specialties));
    });

    test('PATCH /api/shop/profile updates workshop details', async () => {
      const res = await request(app)
        .patch('/api/shop/profile')
        .set('Authorization', `Bearer ${shop1Token}`)
        .send({
          tagline: 'Precision Diagnostics & Board Repair',
          phone: '(415) 555-9988',
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.tagline, 'Precision Diagnostics & Board Repair');
      assert.equal(res.body.phone, '(415) 555-9988');

      const record = db.prepare('SELECT tagline, phone FROM shops WHERE id = ?').get(shop1Id);
      assert.equal(record.tagline, 'Precision Diagnostics & Board Repair');
      assert.equal(record.phone, '(415) 555-9988');
    });

    test('GET /api/shop/inbound-requests returns matching open tickets', async () => {
      const res = await request(app)
        .get('/api/shop/inbound-requests')
        .set('Authorization', `Bearer ${shop1Token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some((r) => r.id === inboundReqId));
    });

    test('GET /api/shop/bench-repairs returns active repair jobs', async () => {
      const res = await request(app)
        .get('/api/shop/bench-repairs')
        .set('Authorization', `Bearer ${shop1Token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some((r) => r.id === benchReqId));
    });

    test('DELETE /api/shop/quotes/:id withdraws pending quote', async () => {
      const res = await request(app)
        .delete(`/api/shop/quotes/${withdrawQuoteId}`)
        .set('Authorization', `Bearer ${shop1Token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const record = db.prepare('SELECT status FROM quotes WHERE id = ?').get(withdrawQuoteId);
      assert.equal(record.status, 'withdrawn');

      const reWithdraw = await request(app)
        .delete(`/api/shop/quotes/${withdrawQuoteId}`)
        .set('Authorization', `Bearer ${shop1Token}`);
      assert.equal(reWithdraw.status, 400);
    });

    test('POST /api/shop/disputes/:id/respond submits workshop defense statement', async () => {
      const emptyRes = await request(app)
        .post(`/api/shop/disputes/${dispId}/respond`)
        .set('Authorization', `Bearer ${shop1Token}`)
        .send({});
      assert.equal(emptyRes.status, 400);

      const missingDisputeRes = await request(app)
        .post('/api/shop/disputes/disp-nonexistent-999/respond')
        .set('Authorization', `Bearer ${shop1Token}`)
        .send({ shopStatement: 'Statement text' });
      assert.equal(missingDisputeRes.status, 404);

      const validRes = await request(app)
        .post(`/api/shop/disputes/${dispId}/respond`)
        .set('Authorization', `Bearer ${shop1Token}`)
        .send({
          shopStatement: 'OEM part shipment cleared customs yesterday. Repair bench ready.',
        });
      assert.equal(validRes.status, 200);
      assert.equal(validRes.body.success, true);

      const record = db.prepare('SELECT shop_statement FROM disputes WHERE id = ?').get(dispId);
      assert.equal(record.shop_statement, 'OEM part shipment cleared customs yesterday. Repair bench ready.');
    });

    test('GET /api/shop/warranty-claims returns shop warranty claims', async () => {
      const res = await request(app)
        .get('/api/shop/warranty-claims')
        .set('Authorization', `Bearer ${shop1Token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some((w) => w.id === claimId));
    });
  });

  describe('Negative RBAC & Ownership Boundary Verification', () => {
    const custAReqId = 'req-cov-rbac-custA';
    const shopAQuoteId = 'q-cov-rbac-shopA';
    const shopBDisputeId = 'disp-cov-rbac-shopB';
    const shopBEscrowId = 'escrow-cov-rbac-shopB';

    before(() => {
      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status
        ) VALUES (
          ?, ?, 'phone', 'Apple', 'iPhone XR', 'Battery',
          'Battery life', 'Degraded cells', 'SF', 'open'
        )
      `).run(custAReqId, cust1Id);

      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (
          ?, ?, ?, 60, 40, 100, 'OEM Genuine', '1 hour', 'pending'
        )
      `).run(shopAQuoteId, custAReqId, shop1Id);

      db.prepare(`
        INSERT INTO escrow_ledger (
          id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount,
          customer_refund_amount, shop_payout_amount, status
        ) VALUES (
          ?, ?, ?, ?, 150, 7.5, 150, 0, 0, 'disputed_frozen'
        )
      `).run(shopBEscrowId, custAReqId, cust1Id, shop2Id);

      db.prepare(`
        INSERT INTO disputes (
          id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, resolution
        ) VALUES (
          ?, ?, ?, ?, 'Delay', 'Shop 2 delayed', 'pending'
        )
      `).run(shopBDisputeId, custAReqId, shopBEscrowId, cust1Id);
    });

    test('customer token cannot access admin metrics (403)', async () => {
      const res = await request(app)
        .get('/api/admin/metrics')
        .set('Authorization', `Bearer ${cust1Token}`);
      assert.equal(res.status, 403);
    });

    test('shop token cannot access admin users (403)', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${shop1Token}`);
      assert.equal(res.status, 403);
    });

    test('customer token cannot access shop bench repairs (403)', async () => {
      const res = await request(app)
        .get('/api/shop/bench-repairs')
        .set('Authorization', `Bearer ${cust1Token}`);
      assert.equal(res.status, 403);
    });

    test('shop token cannot access client requests (403)', async () => {
      const res = await request(app)
        .get('/api/client/requests')
        .set('Authorization', `Bearer ${shop1Token}`);
      assert.equal(res.status, 403);
    });

    test('unauthenticated requests return 401 across admin, client, and shop endpoints', async () => {
      const adminRes = await request(app).get('/api/admin/metrics');
      assert.equal(adminRes.status, 401);

      const clientRes = await request(app).get('/api/client/requests');
      assert.equal(clientRes.status, 401);

      const shopRes = await request(app).get('/api/shop/profile');
      assert.equal(shopRes.status, 401);
    });

    test('customer B cannot delete customer A repair request (403)', async () => {
      const res = await request(app)
        .delete(`/api/client/requests/${custAReqId}`)
        .set('Authorization', `Bearer ${cust2Token}`);
      assert.equal(res.status, 403);
      assert.equal(res.body.error, 'Forbidden: You do not own this repair ticket');
    });

    test('shop B cannot withdraw shop A quote (403)', async () => {
      const res = await request(app)
        .delete(`/api/shop/quotes/${shopAQuoteId}`)
        .set('Authorization', `Bearer ${shop2Token}`);
      assert.equal(res.status, 403);
      assert.equal(res.body.error, 'Forbidden: You do not own this quote');
    });

    test('shop A cannot respond to shop B dispute (403)', async () => {
      const res = await request(app)
        .post(`/api/shop/disputes/${shopBDisputeId}/respond`)
        .set('Authorization', `Bearer ${shop1Token}`)
        .send({ shopStatement: 'Unauthorized response attempt' });
      assert.equal(res.status, 403);
      assert.equal(res.body.error, 'Unauthorized to respond to this dispute');
    });
  });
});
