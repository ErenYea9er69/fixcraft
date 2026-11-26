import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDatabase, closeDatabase } from '../server/db.js';
import {
  autoReleaseEscrows,
  escalateDisputeSlas,
  sendWarrantyPreExpiryNotices,
  cleanOrphanUploads,
  pruneRetentionData,
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
} from '../server/jobs/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testUploadsDir = path.resolve(__dirname, `test-uploads-${process.pid}`);

describe('Section 7: Background Lifecycle Schedulers & Auto-Release Jobs', () => {
  before(() => {
    initDatabase();
    if (!fs.existsSync(testUploadsDir)) {
      fs.mkdirSync(testUploadsDir, { recursive: true });
    }
  });

  after(async () => {
    await stopScheduler();
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
    closeDatabase();
  });

  describe('Task 7.1: Master Scheduler Lifecycle', () => {
    test('startScheduler boots and stopScheduler stops gracefully without leaks', async () => {
      assert.equal(isSchedulerRunning(), false);
      const started = startScheduler({
        escrowIntervalMs: 50,
        disputeIntervalMs: 50,
        warrantyIntervalMs: 50,
        orphanIntervalMs: 50,
        retentionIntervalMs: 50,
      });
      assert.equal(started, true);
      assert.equal(isSchedulerRunning(), true);

      const duplicateStart = startScheduler();
      assert.equal(duplicateStart, false);

      const stopped = await stopScheduler();
      assert.equal(stopped, true);
      assert.equal(isSchedulerRunning(), false);
    });
  });

  describe('Task 7.2: Escrow 14-Day Inactivity Auto-Release Worker', () => {
    const custId = 'user-auto-cust-1';
    const shopUserId = 'user-auto-shop-1';
    const shopId = 'shop-auto-1';
    const reqId = 'req-auto-escrow-1';
    const quoteId = 'quote-auto-escrow-1';
    const escrowId = 'escrow-auto-1';

    before(() => {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Auto Cust', 'autocust@fixcraft.local', 'hash', 'customer')
      `).run(custId);

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Auto Shop User', 'autoshop@fixcraft.local', 'hash', 'shop')
      `).run(shopUserId);

      db.prepare(`
        INSERT OR IGNORE INTO shops (
          id, user_id, name, address, city, phone, email, specialties, completed_repairs_count
        ) VALUES (?, ?, 'Auto Electronics', '100 Main St', 'Seattle', '555-0100', 'shop@auto.local', '["phone"]', 0)
      `).run(shopId, shopUserId);

      // Foreign key order: insert request with null accepted_quote_id first
      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status, accepted_quote_id, updated_at
        ) VALUES (
          ?, ?, 'phone', 'Apple', 'iPhone 13', 'Screen',
          'Broken OLED', 'Glass cracked', 'Seattle', 'ready_for_pickup', NULL, datetime('now', '-15 days')
        )
      `).run(reqId, custId);

      // Then insert quote referencing request_id
      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, status
        ) VALUES (?, ?, ?, 100, 100, 200, 'OEM Genuine', '1 day', 'accepted')
      `).run(quoteId, reqId, shopId);

      // Then update accepted_quote_id
      db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(quoteId, reqId);

      // Then insert escrow ledger
      db.prepare(`
        INSERT INTO escrow_ledger (
          id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount, status
        ) VALUES (?, ?, ?, ?, 200, 10, 200, 'held_in_escrow')
      `).run(escrowId, reqId, custId, shopId);
    });

    test('autoReleaseEscrows releases payout and completes ticket atomically', async () => {
      const result = await autoReleaseEscrows();
      assert.ok(result.released >= 1);

      const request = db.prepare('SELECT status, completed_at FROM repair_requests WHERE id = ?').get(reqId);
      assert.equal(request.status, 'completed');
      assert.ok(request.completed_at);

      const escrow = db.prepare('SELECT status, shop_payout_amount, released_at FROM escrow_ledger WHERE id = ?').get(escrowId);
      assert.equal(escrow.status, 'released_to_shop');
      assert.equal(escrow.shop_payout_amount, 190);
      assert.ok(escrow.released_at);

      const shop = db.prepare('SELECT completed_repairs_count FROM shops WHERE id = ?').get(shopId);
      assert.equal(shop.completed_repairs_count, 1);

      const timeline = db.prepare("SELECT * FROM timeline_events WHERE request_id = ? AND status = 'completed'").get(reqId);
      assert.ok(timeline);
      assert.match(timeline.title, /Auto-Completed/i);

      const shopNotif = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(shopUserId);
      assert.ok(shopNotif);
      assert.match(shopNotif.title, /Auto-Released/i);

      const custNotif = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(custId);
      assert.ok(custNotif);
      assert.match(custNotif.title, /Auto-Completed/i);

      const audit = db.prepare("SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'escrow_auto_released'").get(escrowId);
      assert.ok(audit);
    });

    test('autoReleaseEscrows is strictly idempotent on immediate rerun', async () => {
      const secondRun = await autoReleaseEscrows();
      assert.equal(secondRun.released, 0);

      const shop = db.prepare('SELECT completed_repairs_count FROM shops WHERE id = ?').get(shopId);
      assert.equal(shop.completed_repairs_count, 1);

      const auditCount = db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE entity_id = ? AND action = 'escrow_auto_released'").get(escrowId).count;
      assert.equal(auditCount, 1);
    });
  });

  describe('Task 7.3: Dispute 7-Day SLA Escalation & Warranty Notice Worker', () => {
    const adminId = 'user-auto-admin-1';
    const dispCustId = 'user-auto-dispcust-1';
    const dispReqId = 'req-auto-disp-1';
    const dispEscrowId = 'escrow-auto-disp-1';
    const disputeId = 'disp-auto-sla-1';

    const warrCustId = 'user-auto-warrcust-1';
    const warrReqId = 'req-auto-warr-1';
    const warrQuoteId = 'quote-auto-warr-1';

    before(() => {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'System Admin', 'sysadmin@fixcraft.local', 'hash', 'admin')
      `).run(adminId);

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Dispute Customer', 'dispcust@fixcraft.local', 'hash', 'customer')
      `).run(dispCustId);

      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status
        ) VALUES (
          ?, ?, 'phone', 'Google', 'Pixel 7', 'Battery', 'Swollen battery', 'Puffy back', 'Seattle', 'disputed'
        )
      `).run(dispReqId, dispCustId);

      db.prepare(`
        INSERT INTO escrow_ledger (
          id, request_id, customer_id, shop_id, subtotal, platform_fee, total_amount, status
        ) VALUES (?, ?, ?, 'shop-auto-1', 150, 7.5, 150, 'disputed_frozen')
      `).run(dispEscrowId, dispReqId, dispCustId);

      db.prepare(`
        INSERT INTO disputes (
          id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, shop_statement, created_at
        ) VALUES (
          ?, ?, ?, ?, 'Poor quality repair', 'Battery died immediately', NULL, datetime('now', '-8 days')
        )
      `).run(disputeId, dispReqId, dispEscrowId, dispCustId);

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES (?, 'Warranty Cust', 'warrcust@fixcraft.local', 'hash', 'customer')
      `).run(warrCustId);

      // Foreign key order for warranty request: insert request first with null quote
      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, status, accepted_quote_id, completed_at
        ) VALUES (
          ?, ?, 'laptop', 'Dell', 'XPS 15', 'Screen', 'Flickering display', 'Cable loose', 'Seattle', 'completed', NULL, datetime('now', '-85 days')
        )
      `).run(warrReqId, warrCustId);

      // Then quote
      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround, warranty_months, status
        ) VALUES (?, ?, 'shop-auto-1', 80, 80, 160, 'OEM Genuine', '1 day', 3, 'accepted')
      `).run(warrQuoteId, warrReqId);

      // Then update accepted_quote_id
      db.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run(warrQuoteId, warrReqId);
    });

    test('escalateDisputeSlas alerts administrator and tags dispute notes', async () => {
      const res = await escalateDisputeSlas();
      assert.ok(res.escalated >= 1);

      const dispute = db.prepare('SELECT admin_notes FROM disputes WHERE id = ?').get(disputeId);
      assert.match(dispute.admin_notes, /SLA BREACH/);

      const adminNotif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND title LIKE '%SLA%'").get(adminId);
      assert.ok(adminNotif);

      const audit = db.prepare("SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'dispute_sla_escalated'").get(disputeId);
      assert.ok(audit);

      const rerun = await escalateDisputeSlas();
      assert.equal(rerun.escalated, 0);
    });

    test('sendWarrantyPreExpiryNotices notifies customer before expiration without duplicate runs', async () => {
      const res = await sendWarrantyPreExpiryNotices();
      assert.ok(res.notified >= 1);

      const custNotif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND title LIKE '%Warranty%'").get(warrCustId);
      assert.ok(custNotif);
      assert.match(custNotif.message, /expire/i);

      const audit = db.prepare("SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'warranty_pre_expiry_notice'").get(warrReqId);
      assert.ok(audit);

      const rerun = await sendWarrantyPreExpiryNotices();
      assert.equal(rerun.notified, 0);

      const totalAudits = db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE entity_id = ? AND action = 'warranty_pre_expiry_notice'").get(warrReqId).count;
      assert.equal(totalAudits, 1);
    });
  });

  describe('Task 7.4: Orphan Uploads & Data Retention Maintenance Worker', () => {
    const orphanOldFile = 'orphan-old.png';
    const referencedOldFile = 'referenced-old.png';
    const orphanRecentFile = 'orphan-recent.png';

    const oldReadNotifId = 'notif-ret-old-read';
    const oldUnreadNotifId = 'notif-ret-old-unread';
    const recentReadNotifId = 'notif-ret-rec-read';

    const oldAuditLogId = 'audit-ret-old';
    const recentAuditLogId = 'audit-ret-rec';

    before(() => {
      const oldTime = Date.now() - 26 * 60 * 60 * 1000;
      const recentTime = Date.now() - 10 * 60 * 1000;

      const p1 = path.join(testUploadsDir, orphanOldFile);
      const p2 = path.join(testUploadsDir, referencedOldFile);
      const p3 = path.join(testUploadsDir, orphanRecentFile);

      fs.writeFileSync(p1, 'orphan old data');
      fs.utimesSync(p1, new Date(oldTime), new Date(oldTime));

      fs.writeFileSync(p2, 'referenced old data');
      fs.utimesSync(p2, new Date(oldTime), new Date(oldTime));

      fs.writeFileSync(p3, 'orphan recent data');
      fs.utimesSync(p3, new Date(recentTime), new Date(recentTime));

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
        VALUES ('user-auto-cust-1', 'Auto Cust', 'autocust@fixcraft.local', 'hash', 'customer')
      `).run();

      db.prepare(`
        INSERT INTO repair_requests (
          id, customer_id, device_category, device_brand, device_model, issue_category,
          issue_title, description, location, photos
        ) VALUES (
          'req-orphan-ref-1', 'user-auto-cust-1', 'phone', 'Apple', 'iPhone 12', 'Port', 'Dirt', 'Clean', 'Seattle', ?
        )
      `).run(JSON.stringify([`/uploads/${referencedOldFile}`]));

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
        VALUES (?, 'user-auto-cust-1', 'Old Read', 'Msg', 1, datetime('now', '-35 days'))
      `).run(oldReadNotifId);

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
        VALUES (?, 'user-auto-cust-1', 'Old Unread', 'Msg', 0, datetime('now', '-35 days'))
      `).run(oldUnreadNotifId);

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
        VALUES (?, 'user-auto-cust-1', 'Recent Read', 'Msg', 1, datetime('now', '-5 days'))
      `).run(recentReadNotifId);

      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, created_at)
        VALUES (?, 'user-auto-cust-1', 'old_action', 'entity', '1', datetime('now', '-200 days'))
      `).run(oldAuditLogId);

      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, created_at)
        VALUES (?, 'user-auto-cust-1', 'recent_action', 'entity', '2', datetime('now', '-5 days'))
      `).run(recentAuditLogId);
    });

    test('cleanOrphanUploads purges older than 24h unreferenced files while keeping referenced and recent files', async () => {
      const res = await cleanOrphanUploads({
        uploadsDir: testUploadsDir,
        maxAgeMs: 24 * 60 * 60 * 1000,
      });

      assert.equal(res.deleted, 1);
      assert.equal(res.kept, 2);

      assert.equal(fs.existsSync(path.join(testUploadsDir, orphanOldFile)), false);
      assert.equal(fs.existsSync(path.join(testUploadsDir, referencedOldFile)), true);
      assert.equal(fs.existsSync(path.join(testUploadsDir, orphanRecentFile)), true);

      const audit = db.prepare("SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'orphan_upload_deleted'").get(orphanOldFile);
      assert.ok(audit);

      const rerun = await cleanOrphanUploads({
        uploadsDir: testUploadsDir,
        maxAgeMs: 24 * 60 * 60 * 1000,
      });
      assert.equal(rerun.deleted, 0);
    });

    test('pruneRetentionData prunes read notifications >30d and audit logs >180d maintaining active records', async () => {
      const res = await pruneRetentionData({ batchSize: 50 });
      assert.ok(res.notificationsPruned >= 1);
      assert.ok(res.auditLogsPruned >= 1);

      const prunedRead = db.prepare('SELECT * FROM notifications WHERE id = ?').get(oldReadNotifId);
      assert.equal(prunedRead, undefined);

      const keptUnread = db.prepare('SELECT * FROM notifications WHERE id = ?').get(oldUnreadNotifId);
      assert.ok(keptUnread);

      const keptRecentRead = db.prepare('SELECT * FROM notifications WHERE id = ?').get(recentReadNotifId);
      assert.ok(keptRecentRead);

      const prunedAudit = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(oldAuditLogId);
      assert.equal(prunedAudit, undefined);

      const keptRecentAudit = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(recentAuditLogId);
      assert.ok(keptRecentAudit);

      const rerun = await pruneRetentionData({ batchSize: 50 });
      assert.equal(rerun.notificationsPruned, 0);
      assert.equal(rerun.auditLogsPruned, 0);
    });
  });
});
