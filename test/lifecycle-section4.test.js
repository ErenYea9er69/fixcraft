import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import clientRoutes from '../server/routes/client.js';
import shopRoutes from '../server/routes/shop.js';
import adminRoutes from '../server/routes/admin.js';
import sharedRoutes from '../server/routes/shared.js';
import { signToken } from '../server/middleware/auth.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('Section 4: Atomic Transactions, Race Conditions & State Machines', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/client', clientRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/shared', sharedRoutes);

  let tokenAdmin;
  let tokenCustomer;
  let tokenShop1;
  let tokenShop2;

  before(() => {
    initDatabase();

    tokenAdmin = signToken({ id: 'user-admin', email: 'admin@fixcraft.local', role: 'admin', token_version: 1 });
    tokenCustomer = signToken({ id: 'user-alex', email: 'alex@example.com', role: 'customer', token_version: 1 });
    tokenShop1 = signToken({ id: 'user-apex', email: 'apex@fixcraft.local', role: 'shop', shop_id: 'shop-1', token_version: 1 });
    tokenShop2 = signToken({ id: 'user-silicon', email: 'silicon@fixcraft.local', role: 'shop', shop_id: 'shop-3', token_version: 1 });
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

  test('Task 4.1: Atomic quote acceptance locks escrow, declines competing quotes, returns 200 without simulated phrasing', async () => {
    const reqId = `req-t41-${Date.now()}`;
    const q1Id = `q1-t41-${Date.now()}`;
    const q2Id = `q2-t41-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 15', 'Screen', 'Cracked Glass', 'Drop damage', 'SF', 'open')
    `).run(reqId);

    db.prepare(`
      INSERT INTO quotes (id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status)
      VALUES (?, ?, 'shop-1', 100, 50, 150, 'OEM Genuine', '1 day', 'pending')
    `).run(q1Id, reqId);

    db.prepare(`
      INSERT INTO quotes (id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status)
      VALUES (?, ?, 'shop-3', 120, 60, 180, 'Refurbished Original', '2 days', 'pending')
    `).run(q2Id, reqId);

    const res = await request(app)
      .post(`/api/client/quotes/${q1Id}/accept`)
      .set('Authorization', `Bearer ${tokenCustomer}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(!res.body.message.includes('simulated'));
    assert.equal(res.body.request.status, 'quote_accepted');
    assert.equal(res.body.escrow.platform_fee, 7.5); // 5% of 150

    const competing = db.prepare('SELECT status FROM quotes WHERE id = ?').get(q2Id);
    assert.equal(competing.status, 'declined');

    const secondRes = await request(app)
      .post(`/api/client/quotes/${q1Id}/accept`)
      .set('Authorization', `Bearer ${tokenCustomer}`);
    assert.equal(secondRes.status, 409);
  });

  test('Task 4.2: Handover release requires ready_for_pickup, releases escrow, increments shop count', async () => {
    const reqId = `req-t42-${Date.now()}`;
    const qId = `q-t42-${Date.now()}`;
    const escId = `esc-t42-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status, accepted_quote_id)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 14', 'Battery', 'Degraded', 'Needs replacement', 'SF', 'in_repair', null)
    `).run(reqId);

    db.prepare(`
      INSERT INTO quotes (id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status)
      VALUES (?, ?, 'shop-1', 40, 40, 80, 'OEM Genuine', '1 hour', 'accepted')
    `).run(qId, reqId);

    db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(qId, reqId);

    db.prepare(`
      INSERT INTO escrow_ledger (id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount, status)
      VALUES (?, ?, 'user-alex', 'shop-1', 80, 4, 80, 'held_in_escrow')
    `).run(escId, reqId);

    const badStageRes = await request(app)
      .post(`/api/client/requests/${reqId}/confirm-handover`)
      .set('Authorization', `Bearer ${tokenCustomer}`);
    assert.equal(badStageRes.status, 400);

    db.prepare("UPDATE repair_requests SET status = 'ready_for_pickup' WHERE id = ?").run(reqId);

    const shopBefore = db.prepare('SELECT completed_repairs_count FROM shops WHERE id = ?').get('shop-1').completed_repairs_count;

    const okRes = await request(app)
      .post(`/api/client/requests/${reqId}/confirm-handover`)
      .set('Authorization', `Bearer ${tokenCustomer}`);
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.request.status, 'completed');
    assert.equal(okRes.body.escrow.status, 'released_to_shop');
    assert.equal(okRes.body.escrow.shop_payout_amount, 76);

    const shopAfter = db.prepare('SELECT completed_repairs_count FROM shops WHERE id = ?').get('shop-1').completed_repairs_count;
    assert.equal(shopAfter, shopBefore + 1);

    const duplicateRes = await request(app)
      .post(`/api/client/requests/${reqId}/confirm-handover`)
      .set('Authorization', `Bearer ${tokenCustomer}`);
    assert.equal(duplicateRes.status, 400);
  });

  test('Task 4.3: Dispute resolution handles float addition accurately and prevents negative numbers', async () => {
    const reqId = `req-t43-${Date.now()}`;
    const escId = `esc-t43-${Date.now()}`;
    const dispId = `disp-t43-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 13', 'Screen', 'Lines', 'Flicker', 'SF', 'disputed')
    `).run(reqId);

    db.prepare(`
      INSERT INTO escrow_ledger (id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount, status)
      VALUES (?, ?, 'user-alex', 'shop-1', 140.30, 7.01, 140.30, 'disputed_frozen')
    `).run(escId, reqId);

    db.prepare(`
      INSERT INTO disputes (id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, resolution)
      VALUES (?, ?, ?, 'user-alex', 'Defective screen', 'Colors washed out', 'pending')
    `).run(dispId, reqId, escId);

    const negRes = await request(app)
      .post(`/api/admin/disputes/${dispId}/resolve`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        resolution: 'split_payout',
        customerRefundAmount: -10,
        shopPayoutAmount: 150.30
      });
    assert.equal(negRes.status, 400);

    const mismatchRes = await request(app)
      .post(`/api/admin/disputes/${dispId}/resolve`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        resolution: 'split_payout',
        customerRefundAmount: 40.10,
        shopPayoutAmount: 100.00
      });
    assert.equal(mismatchRes.status, 400);

    const floatRes = await request(app)
      .post(`/api/admin/disputes/${dispId}/resolve`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        resolution: 'split_payout',
        customerRefundAmount: 40.10,
        shopPayoutAmount: 100.20
      });
    assert.equal(floatRes.status, 200);
    assert.equal(floatRes.body.dispute.resolution_customer_amount, 40.1);
    assert.equal(floatRes.body.dispute.resolution_shop_amount, 100.2);

    const shopDefenseRes = await request(app)
      .post(`/api/shop/disputes/${dispId}/respond`)
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({ shopStatement: 'Counter evidence statement' });
    assert.equal(shopDefenseRes.status, 400);
  });

  test('Task 4.4: Bench repair strictly enforces sequential stages and rejects skipping or regressing', async () => {
    const reqId = `req-t44-${Date.now()}`;
    const qId = `q-t44-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status, accepted_quote_id)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 15', 'Port', 'Loose', 'Port loose', 'SF', 'quote_accepted', null)
    `).run(reqId);

    db.prepare(`
      INSERT INTO quotes (id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status)
      VALUES (?, ?, 'shop-1', 20, 30, 50, 'OEM Genuine', '2 hours', 'accepted')
    `).run(qId, reqId);

    db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(qId, reqId);

    const skipRes = await request(app)
      .patch(`/api/shop/requests/${reqId}/advance-stage`)
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({ status: 'in_repair' });
    assert.equal(skipRes.status, 400);

    const step1 = await request(app)
      .patch(`/api/shop/requests/${reqId}/advance-stage`)
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({ status: 'in_shop' });
    assert.equal(step1.status, 200);

    const step2 = await request(app)
      .patch(`/api/shop/requests/${reqId}/advance-stage`)
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({ status: 'diagnosing' });
    assert.equal(step2.status, 200);

    const regressRes = await request(app)
      .patch(`/api/shop/requests/${reqId}/advance-stage`)
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({ status: 'in_shop' });
    assert.equal(regressRes.status, 400);
  });

  test('Task 4.4: Quote submission validates positive numbers, valid partsQuality, and rejects duplicate active quote', async () => {
    const reqId = `req-t44-q-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 12', 'Battery', 'Dead', 'Dead battery', 'SF', 'open')
    `).run(reqId);

    const negQuote = await request(app)
      .post('/api/shop/quotes')
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({
        requestId: reqId,
        partsCost: -10,
        laborCost: 20,
        totalCost: 10
      });
    assert.equal(negQuote.status, 400);

    const badQualityQuote = await request(app)
      .post('/api/shop/quotes')
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({
        requestId: reqId,
        partsCost: 30,
        laborCost: 20,
        totalCost: 50,
        partsQuality: 'Counterfeit Knockoff'
      });
    assert.equal(badQualityQuote.status, 400);

    const validQuote = await request(app)
      .post('/api/shop/quotes')
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({
        requestId: reqId,
        partsCost: 30,
        laborCost: 20,
        totalCost: 50,
        partsQuality: 'OEM Genuine'
      });
    assert.equal(validQuote.status, 201);

    const dupQuote = await request(app)
      .post('/api/shop/quotes')
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({
        requestId: reqId,
        partsCost: 35,
        laborCost: 25,
        totalCost: 60,
        partsQuality: 'OEM Genuine'
      });
    assert.equal(dupQuote.status, 409);
  });

  test('Task 4.4: Warranty claim without quote rejects without hardcoded shop-1 fallback', async () => {
    const reqId = `req-t44-w-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status, completed_at, accepted_quote_id)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 11', 'Audio', 'No sound', 'Speaker dead', 'SF', 'completed', datetime('now', '-5 days'), null)
    `).run(reqId);

    const res = await request(app)
      .post('/api/client/warranty-claims')
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({ requestId: reqId, claimIssue: 'Speaker failed again' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /does not have an associated workshop quote/i);
  });

  test('Task 4.5: Messages on open ticket are scoped between customer and target shop', async () => {
    const reqId = `req-t45-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status)
      VALUES (?, 'user-alex', 'phone', 'Google', 'Pixel 8', 'Screen', 'Cracked', 'Screen break', 'SF', 'open')
    `).run(reqId);

    const sendRes = await request(app)
      .post(`/api/shared/requests/${reqId}/messages`)
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({
        content: 'Private inquiry for Apex',
        recipientId: 'user-apex'
      });
    assert.equal(sendRes.status, 201);

    const shop1Res = await request(app)
      .get(`/api/shared/requests/${reqId}/messages`)
      .set('Authorization', `Bearer ${tokenShop1}`);
    assert.equal(shop1Res.status, 200);
    assert.equal(shop1Res.body.length, 1);
    assert.equal(shop1Res.body[0].content, 'Private inquiry for Apex');

    const shop2Res = await request(app)
      .get(`/api/shared/requests/${reqId}/messages`)
      .set('Authorization', `Bearer ${tokenShop2}`);
    assert.equal(shop2Res.status, 200);
    assert.equal(shop2Res.body.length, 0);
  });

  test('Task 4.6: Reviews reject duplicates and preserve baseline shop review count', async () => {
    const reqId = `req-t46-${Date.now()}`;
    const qId = `q-t46-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status, accepted_quote_id, completed_at)
      VALUES (?, 'user-alex', 'laptop', 'Dell', 'XPS 15', 'Fan', 'Noisy', 'Fan rattle', 'SF', 'completed', null, datetime('now', '-1 day'))
    `).run(reqId);

    db.prepare(`
      INSERT INTO quotes (id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status)
      VALUES (?, ?, 'shop-1', 50, 50, 100, 'OEM Genuine', '1 day', 'accepted')
    `).run(qId, reqId);

    db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(qId, reqId);

    const initialShop = db.prepare('SELECT rating, review_count FROM shops WHERE id = ?').get('shop-1');

    const reviewRes = await request(app)
      .post(`/api/client/requests/${reqId}/reviews`)
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({
        rating: 5,
        comment: 'Outstanding repair craftsmanship!'
      });
    assert.equal(reviewRes.status, 201);

    const updatedShop = db.prepare('SELECT rating, review_count FROM shops WHERE id = ?').get('shop-1');
    assert.equal(updatedShop.review_count, initialShop.review_count + 1);

    const dupReview = await request(app)
      .post(`/api/client/requests/${reqId}/reviews`)
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({
        rating: 4,
        comment: 'Trying to review a second time'
      });
    assert.equal(dupReview.status, 409);
  });

  test('Task 4.6: Workshop can update warranty claim status', async () => {
    const claimId = `claim-t46-${Date.now()}`;
    const reqId = `req-t46-w-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location, status)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone 13', 'Screen', 'OLED', 'Screen repair', 'SF', 'completed')
    `).run(reqId);

    db.prepare(`
      INSERT INTO warranty_claims (id, request_id, shop_id, customer_id, claim_issue, status, warranty_expiry_date)
      VALUES (?, ?, 'shop-1', 'user-alex', 'Flicker returns', 'submitted', datetime('now', '+30 days'))
    `).run(claimId, reqId);

    const updateRes = await request(app)
      .patch(`/api/shop/warranty-claims/${claimId}`)
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({
        status: 'under_review',
        shopResponse: 'Hardware received for inspection bench testing.'
      });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.status, 'under_review');
    assert.equal(updateRes.body.shop_response, 'Hardware received for inspection bench testing.');

    const badStatusRes = await request(app)
      .patch(`/api/shop/warranty-claims/${claimId}`)
      .set('Authorization', `Bearer ${tokenShop1}`)
      .send({ status: 'invalid_status' });
    assert.equal(badStatusRes.status, 400);
  });

  test('Task 4.7 & 4.8: Admin self-suspension prevented, verified directory filter, and audit logs recorded', async () => {
    const selfSuspendRes = await request(app)
      .patch('/api/admin/users/user-admin/status')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ isActive: false });
    assert.equal(selfSuspendRes.status, 400);
    assert.match(selfSuspendRes.body.error, /cannot modify their own active status/i);

    const dirRes = await request(app).get('/api/shared/shops');
    assert.equal(dirRes.status, 200);
    assert.ok(dirRes.body.length > 0);
    assert.ok(dirRes.body.every(s => s.verified === true));

    const auditRes = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    assert.equal(auditRes.status, 200);
    assert.ok(Array.isArray(auditRes.body));
    assert.ok(auditRes.body.length > 0);
  });
});
