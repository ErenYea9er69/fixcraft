import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import app from '../server/server.js';
import { signToken } from '../server/middleware/auth.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('Section 8 - Task 8.1: Concurrency & Financial Race Conditions', () => {
  before(() => {
    initDatabase();
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

  describe('Race Test 1: Concurrent Quote Acceptance', () => {
    const custId = 'user-race1-cust';
    const shop1UserId = 'user-race1-shop1';
    const shop2UserId = 'user-race1-shop2';
    const shop1Id = 'shop-race1-1';
    const shop2Id = 'shop-race1-2';
    const reqId = 'req-race1-quote';
    const quote1Id = 'q-race1-1';
    const quote2Id = 'q-race1-2';
    let custToken;

    before(() => {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Race1 Customer', 'race1cust@fixcraft.local', 'hash', 'customer')
      `).run(custId);

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Race1 Shop 1 User', 'race1shop1@fixcraft.local', 'hash', 'shop')
      `).run(shop1UserId);

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Race1 Shop 2 User', 'race1shop2@fixcraft.local', 'hash', 'shop')
      `).run(shop2UserId);

      db.prepare(`
        INSERT OR IGNORE INTO shops (
          id, user_id, name, address, city, phone, email, specialties, verified
        ) VALUES (?, ?, 'Race 1 Shop Alpha', '100 Main St', 'SF', '555-0101', 'alpha@race1.local', '["phone"]', 1)
      `).run(shop1Id, shop1UserId);

      db.prepare(`
        INSERT OR IGNORE INTO shops (
          id, user_id, name, address, city, phone, email, specialties, verified
        ) VALUES (?, ?, 'Race 1 Shop Beta', '200 Main St', 'SF', '555-0102', 'beta@race1.local', '["phone"]', 1)
      `).run(shop2Id, shop2UserId);

      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status, accepted_quote_id
        ) VALUES (
          ?, ?, 'phone', 'Apple', 'iPhone 14', 'Screen',
          'Shattered screen', 'Front glass broken', 'SF', 'open', NULL
        )
      `).run(reqId, custId);

      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (
          ?, ?, ?, 100, 50, 150, 'OEM Genuine', '24 hours', 'pending'
        )
      `).run(quote1Id, reqId, shop1Id);

      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (
          ?, ?, ?, 120, 80, 200, 'OEM Equivalent', '48 hours', 'pending'
        )
      `).run(quote2Id, reqId, shop2Id);

      custToken = signToken({ id: custId, name: 'Race1 Customer', role: 'customer' });
    });

    test('multiple parallel acceptance calls on competing quotes resolve with exactly one 200 and others 409', async () => {
      const calls = [
        request(app).post(`/api/client/quotes/${quote1Id}/accept`).set('Authorization', `Bearer ${custToken}`),
        request(app).post(`/api/client/quotes/${quote2Id}/accept`).set('Authorization', `Bearer ${custToken}`),
        request(app).post(`/api/client/quotes/${quote1Id}/accept`).set('Authorization', `Bearer ${custToken}`),
        request(app).post(`/api/client/quotes/${quote2Id}/accept`).set('Authorization', `Bearer ${custToken}`),
      ];

      const responses = await Promise.all(calls);
      const successes = responses.filter((r) => r.status === 200);
      const conflicts = responses.filter((r) => r.status === 409);

      assert.equal(successes.length, 1);
      assert.equal(conflicts.length, 3);

      const escrowEntries = db.prepare('SELECT * FROM escrow_ledger WHERE request_id = ?').all(reqId);
      assert.equal(escrowEntries.length, 1);
      assert.equal(escrowEntries[0].status, 'held_in_escrow');

      const updatedReq = db.prepare('SELECT status, accepted_quote_id FROM repair_requests WHERE id = ?').get(reqId);
      assert.equal(updatedReq.status, 'quote_accepted');
      assert.ok(updatedReq.accepted_quote_id === quote1Id || updatedReq.accepted_quote_id === quote2Id);

      const winningQuote = db.prepare('SELECT status FROM quotes WHERE id = ?').get(updatedReq.accepted_quote_id);
      assert.equal(winningQuote.status, 'accepted');

      const losingQuoteId = updatedReq.accepted_quote_id === quote1Id ? quote2Id : quote1Id;
      const losingQuote = db.prepare('SELECT status FROM quotes WHERE id = ?').get(losingQuoteId);
      assert.equal(losingQuote.status, 'declined');
    });
  });

  describe('Race Test 2: Concurrent Dispute Resolution', () => {
    const custId = 'user-race2-cust';
    const shopUserId = 'user-race2-shop';
    const shopId = 'shop-race2-1';
    const reqId = 'req-race2-disp';
    const quoteId = 'q-race2-disp';
    const escrowId = 'escrow-race2-disp';
    const disputeId = 'disp-race2-1';
    let adminToken;

    before(() => {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Race2 Customer', 'race2cust@fixcraft.local', 'hash', 'customer')
      `).run(custId);

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Race2 Shop User', 'race2shop@fixcraft.local', 'hash', 'shop')
      `).run(shopUserId);

      db.prepare(`
        INSERT OR IGNORE INTO shops (
          id, user_id, name, address, city, phone, email, specialties, verified
        ) VALUES (?, ?, 'Race 2 Dispute Shop', '300 Main St', 'SF', '555-0103', 'shop@race2.local', '["laptop"]', 1)
      `).run(shopId, shopUserId);

      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status, accepted_quote_id
        ) VALUES (
          ?, ?, 'laptop', 'Dell', 'XPS 15', 'Motherboard',
          'Power failure', 'Will not boot', 'SF', 'disputed', NULL
        )
      `).run(reqId, custId);

      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (
          ?, ?, ?, 150, 100, 250, 'OEM Genuine', '3 days', 'accepted'
        )
      `).run(quoteId, reqId, shopId);

      db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(quoteId, reqId);

      db.prepare(`
        INSERT INTO escrow_ledger (
          id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount,
          customer_refund_amount, shop_payout_amount, status
        ) VALUES (
          ?, ?, ?, ?, 250, 12.5, 250, 0, 0, 'disputed_frozen'
        )
      `).run(escrowId, reqId, custId, shopId);

      db.prepare(`
        INSERT INTO disputes (
          id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, resolution
        ) VALUES (
          ?, ?, ?, ?, 'Quality issue', 'Device still does not power on after repair', 'pending'
        )
      `).run(disputeId, reqId, escrowId, custId);

      adminToken = signToken({ id: 'user-admin', name: 'FixCraft Operations Admin', role: 'admin' });
    });

    test('multiple parallel dispute resolutions resolve with exactly one 200 and others 409', async () => {
      const calls = [
        request(app)
          .post(`/api/admin/disputes/${disputeId}/resolve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ resolution: 'refund_customer', adminNotes: 'Full refund to customer' }),
        request(app)
          .post(`/api/admin/disputes/${disputeId}/resolve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ resolution: 'release_to_shop', adminNotes: 'Release to shop' }),
        request(app)
          .post(`/api/admin/disputes/${disputeId}/resolve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            resolution: 'split_payout',
            customerRefundAmount: 100,
            shopPayoutAmount: 150,
            adminNotes: 'Split payout',
          }),
      ];

      const responses = await Promise.all(calls);
      const successes = responses.filter((r) => r.status === 200);
      const rejections = responses.filter((r) => r.status === 409 || r.status === 400);

      assert.equal(successes.length, 1);
      assert.equal(rejections.length, 2);

      const disputeRecord = db.prepare('SELECT resolution, resolved_at FROM disputes WHERE id = ?').get(disputeId);
      assert.notEqual(disputeRecord.resolution, 'pending');
      assert.ok(disputeRecord.resolved_at);

      const escrowRecord = db.prepare('SELECT status, released_at FROM escrow_ledger WHERE id = ?').get(escrowId);
      assert.notEqual(escrowRecord.status, 'disputed_frozen');
      assert.ok(escrowRecord.released_at);
    });
  });

  describe('Race Test 3: Concurrent Handover Confirmation', () => {
    const custId = 'user-race3-cust';
    const shopUserId = 'user-race3-shop';
    const shopId = 'shop-race3-1';
    const reqId = 'req-race3-handover';
    const quoteId = 'q-race3-handover';
    const escrowId = 'escrow-race3-handover';
    let custToken;

    before(() => {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Race3 Customer', 'race3cust@fixcraft.local', 'hash', 'customer')
      `).run(custId);

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Race3 Shop User', 'race3shop@fixcraft.local', 'hash', 'shop')
      `).run(shopUserId);

      db.prepare(`
        INSERT OR IGNORE INTO shops (
          id, user_id, name, address, city, phone, email, specialties, verified, completed_repairs_count
        ) VALUES (?, ?, 'Race 3 Handover Shop', '400 Main St', 'SF', '555-0104', 'shop@race3.local', '["phone"]', 1, 5)
      `).run(shopId, shopUserId);

      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status, accepted_quote_id
        ) VALUES (
          ?, ?, 'phone', 'Google', 'Pixel 8', 'Battery',
          'Battery replacement', 'Degraded battery', 'SF', 'ready_for_pickup', NULL
        )
      `).run(reqId, custId);

      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (
          ?, ?, ?, 80, 40, 120, 'OEM Genuine', '2 hours', 'accepted'
        )
      `).run(quoteId, reqId, shopId);

      db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(quoteId, reqId);

      db.prepare(`
        INSERT INTO escrow_ledger (
          id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount,
          customer_refund_amount, shop_payout_amount, status
        ) VALUES (
          ?, ?, ?, ?, 120, 6, 120, 0, 0, 'held_in_escrow'
        )
      `).run(escrowId, reqId, custId, shopId);

      custToken = signToken({ id: custId, name: 'Race3 Customer', role: 'customer' });
    });

    test('multiple parallel handover confirmations resolve with exactly one 200 and others 409', async () => {
      const calls = [
        request(app).post(`/api/client/requests/${reqId}/confirm-handover`).set('Authorization', `Bearer ${custToken}`),
        request(app).post(`/api/client/requests/${reqId}/confirm-handover`).set('Authorization', `Bearer ${custToken}`),
        request(app).post(`/api/client/requests/${reqId}/confirm-handover`).set('Authorization', `Bearer ${custToken}`),
      ];

      const responses = await Promise.all(calls);
      const successes = responses.filter((r) => r.status === 200);
      const rejections = responses.filter((r) => r.status === 409 || r.status === 400);

      assert.equal(successes.length, 1);
      assert.equal(rejections.length, 2);

      const shopRecord = db.prepare('SELECT completed_repairs_count FROM shops WHERE id = ?').get(shopId);
      assert.equal(shopRecord.completed_repairs_count, 6);

      const escrowRecord = db.prepare('SELECT status, shop_payout_amount FROM escrow_ledger WHERE id = ?').get(escrowId);
      assert.equal(escrowRecord.status, 'released_to_shop');
      assert.equal(escrowRecord.shop_payout_amount, 114);

      const reqRecord = db.prepare('SELECT status, completed_at FROM repair_requests WHERE id = ?').get(reqId);
      assert.equal(reqRecord.status, 'completed');
      assert.ok(reqRecord.completed_at);
    });
  });
});
