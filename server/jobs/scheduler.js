import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { runTransaction } from '../db.js';
import { logAudit } from '../utils/auditLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultUploadsDir = path.resolve(__dirname, '..', '..', 'uploads');

const isRunning = {
  autoRelease: false,
  disputeSla: false,
  warranty: false,
  orphanUploads: false,
  retention: false,
};

let schedulerActive = false;
let timers = [];

// Checks if background maintenance scheduler is currently running
export function isSchedulerRunning() {
  return schedulerActive;
}

// Auto-releases escrow funds to workshop after 14 days in ready_for_pickup without dispute
export async function autoReleaseEscrows(options = {}) {
  if (isRunning.autoRelease) {
    return { processed: 0, released: 0, skipped: true, reason: 'Already running' };
  }
  isRunning.autoRelease = true;

  try {
    const candidates = options.cutoff
      ? db.prepare(`
          SELECT r.id AS request_id, r.customer_id, r.device_brand, r.device_model,
                 e.id AS escrow_id, e.shop_id, e.subtotal, e.platform_fee
          FROM repair_requests r
          JOIN escrow_ledger e ON e.request_id = r.id
          WHERE r.status = 'ready_for_pickup'
            AND e.status = 'held_in_escrow'
            AND r.updated_at <= ?
            AND NOT EXISTS (
              SELECT 1 FROM disputes d
              WHERE d.request_id = r.id AND d.resolution = 'pending'
            )
        `).all(options.cutoff)
      : db.prepare(`
          SELECT r.id AS request_id, r.customer_id, r.device_brand, r.device_model,
                 e.id AS escrow_id, e.shop_id, e.subtotal, e.platform_fee
          FROM repair_requests r
          JOIN escrow_ledger e ON e.request_id = r.id
          WHERE r.status = 'ready_for_pickup'
            AND e.status = 'held_in_escrow'
            AND r.updated_at <= datetime('now', '-14 days')
            AND NOT EXISTS (
              SELECT 1 FROM disputes d
              WHERE d.request_id = r.id AND d.resolution = 'pending'
            )
        `).all();

    let releasedCount = 0;

    for (const candidate of candidates) {
      const shopPayout = Math.round((candidate.subtotal - candidate.platform_fee) * 100) / 100;

      runTransaction(() => {
        const reqResult = db.prepare(`
          UPDATE repair_requests
          SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND status = 'ready_for_pickup'
        `).run(candidate.request_id);

        if (reqResult.changes === 0) {
          return;
        }

        const escrowResult = db.prepare(`
          UPDATE escrow_ledger
          SET status = 'released_to_shop', shop_payout_amount = ?, released_at = datetime('now')
          WHERE id = ? AND status = 'held_in_escrow'
        `).run(shopPayout, candidate.escrow_id);

        if (escrowResult.changes === 0) {
          throw new Error(`Escrow ${candidate.escrow_id} status mismatch during auto-release`);
        }

        db.prepare(`
          UPDATE shops
          SET completed_repairs_count = COALESCE(completed_repairs_count, 0) + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(candidate.shop_id);

        const timelineId = `t-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        db.prepare(`
          INSERT INTO timeline_events (id, request_id, status, title, description, completed, created_at)
          VALUES (?, ?, 'completed', 'Repair Auto-Completed & Escrow Released', ?, 1, datetime('now'))
        `).run(
          timelineId,
          candidate.request_id,
          `14-day inactivity window elapsed while ready for pickup. Escrow funds of $${shopPayout} automatically released to workshop.`
        );

        const shop = db.prepare('SELECT user_id FROM shops WHERE id = ?').get(candidate.shop_id);
        if (shop && shop.user_id) {
          const shopNotifId = `notif-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
          db.prepare(`
            INSERT INTO notifications (id, user_id, title, message, link_url, created_at)
            VALUES (?, ?, 'Escrow Auto-Released', ?, ?, datetime('now'))
          `).run(
            shopNotifId,
            shop.user_id,
            `14 days elapsed without customer dispute. $${shopPayout} has been automatically released to your account.`,
            `/requests/${candidate.request_id}`
          );
        }

        const custNotifId = `notif-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        db.prepare(`
            INSERT INTO notifications (id, user_id, title, message, link_url, created_at)
            VALUES (?, ?, 'Repair Auto-Completed', ?, ?, datetime('now'))
          `).run(
          custNotifId,
          candidate.customer_id,
          `Your repair ticket was automatically completed after 14 days ready for pickup. Escrow released to shop.`,
          `/requests/${candidate.request_id}`
        );

        logAudit(null, 'escrow_auto_released', 'escrow_ledger', candidate.escrow_id, {
          request_id: candidate.request_id,
          shop_id: candidate.shop_id,
          shop_payout: shopPayout,
          reason: '14_day_inactivity',
        });

        releasedCount++;
      });
    }

    return { processed: candidates.length, released: releasedCount };
  } finally {
    isRunning.autoRelease = false;
  }
}

// Escalates disputes pending more than 7 days without workshop defense to admins
export async function escalateDisputeSlas(options = {}) {
  if (isRunning.disputeSla) {
    return { processed: 0, escalated: 0, skipped: true, reason: 'Already running' };
  }
  isRunning.disputeSla = true;

  try {
    const candidates = options.cutoff
      ? db.prepare(`
          SELECT d.id AS dispute_id, d.request_id, d.escrow_id, d.opened_by_user_id, d.admin_notes, d.created_at
          FROM disputes d
          WHERE d.resolution = 'pending'
            AND (d.shop_statement IS NULL OR TRIM(d.shop_statement) = '')
            AND d.created_at <= ?
        `).all(options.cutoff)
      : db.prepare(`
          SELECT d.id AS dispute_id, d.request_id, d.escrow_id, d.opened_by_user_id, d.admin_notes, d.created_at
          FROM disputes d
          WHERE d.resolution = 'pending'
            AND (d.shop_statement IS NULL OR TRIM(d.shop_statement) = '')
            AND d.created_at <= datetime('now', '-7 days')
        `).all();

    let escalatedCount = 0;

    for (const candidate of candidates) {
      const alreadyEscalated = db.prepare(`
        SELECT 1 FROM audit_logs
        WHERE action = 'dispute_sla_escalated' AND entity_id = ?
        LIMIT 1
      `).get(candidate.dispute_id);

      if (alreadyEscalated) {
        continue;
      }

      runTransaction(() => {
        const existingNotes = candidate.admin_notes || '';
        const breachTag = '[SLA BREACH - OVERDUE SHOP DEFENSE]';
        const updatedNotes = existingNotes.includes(breachTag)
          ? existingNotes
          : existingNotes ? `${existingNotes}\n${breachTag}` : breachTag;

        db.prepare(`
          UPDATE disputes
          SET admin_notes = ?
          WHERE id = ? AND resolution = 'pending'
        `).run(updatedNotes, candidate.dispute_id);

        const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`).all();
        for (const admin of admins) {
          const notifId = `notif-sla-${candidate.dispute_id}-${admin.id}`;
          db.prepare(`
            INSERT OR IGNORE INTO notifications (id, user_id, title, message, link_url, created_at)
            VALUES (?, ?, 'Dispute SLA Escalation: Overdue Shop Defense', ?, ?, datetime('now'))
          `).run(
            notifId,
            admin.id,
            `Dispute for request ${candidate.request_id} has exceeded the 7-day SLA without workshop defense.`,
            `/admin/disputes`
          );
        }

        logAudit(null, 'dispute_sla_escalated', 'disputes', candidate.dispute_id, {
          request_id: candidate.request_id,
          escrow_id: candidate.escrow_id,
          days_overdue: 7,
        });

        escalatedCount++;
      });
    }

    return { processed: candidates.length, escalated: escalatedCount };
  } finally {
    isRunning.disputeSla = false;
  }
}

// Sends pre-expiry notifications to customers 7 days before their repair warranty expires
export async function sendWarrantyPreExpiryNotices(options = {}) {
  if (isRunning.warranty) {
    return { processed: 0, notified: 0, skipped: true, reason: 'Already running' };
  }
  isRunning.warranty = true;

  try {
    const candidates = options.windowEnd
      ? db.prepare(`
          SELECT r.id AS request_id, r.customer_id, r.device_brand, r.device_model,
                 datetime(r.completed_at, '+' || COALESCE(q.warranty_months, 3) || ' months') AS warranty_expiry_date
          FROM repair_requests r
          JOIN quotes q ON r.accepted_quote_id = q.id
          WHERE r.status = 'completed'
            AND r.completed_at IS NOT NULL
            AND datetime(r.completed_at, '+' || COALESCE(q.warranty_months, 3) || ' months') >= COALESCE(?, datetime('now'))
            AND datetime(r.completed_at, '+' || COALESCE(q.warranty_months, 3) || ' months') <= ?
        `).all(options.windowStart || null, options.windowEnd)
      : db.prepare(`
          SELECT r.id AS request_id, r.customer_id, r.device_brand, r.device_model,
                 datetime(r.completed_at, '+' || COALESCE(q.warranty_months, 3) || ' months') AS warranty_expiry_date
          FROM repair_requests r
          JOIN quotes q ON r.accepted_quote_id = q.id
          WHERE r.status = 'completed'
            AND r.completed_at IS NOT NULL
            AND datetime(r.completed_at, '+' || COALESCE(q.warranty_months, 3) || ' months') >= datetime('now')
            AND datetime(r.completed_at, '+' || COALESCE(q.warranty_months, 3) || ' months') <= datetime('now', '+7 days')
        `).all();

    let notifiedCount = 0;

    for (const candidate of candidates) {
      const alreadyNotified = db.prepare(`
        SELECT 1 FROM audit_logs
        WHERE action = 'warranty_pre_expiry_notice' AND entity_id = ?
        LIMIT 1
      `).get(candidate.request_id);

      if (alreadyNotified) {
        continue;
      }

      runTransaction(() => {
        const notifId = `notif-warr-${candidate.request_id}`;
        db.prepare(`
          INSERT OR IGNORE INTO notifications (id, user_id, title, message, link_url, created_at)
          VALUES (?, ?, 'Warranty Expiring Soon', ?, ?, datetime('now'))
        `).run(
          notifId,
          candidate.customer_id,
          `Your repair warranty for ${candidate.device_brand || 'device'} ${candidate.device_model || ''} will expire on ${candidate.warranty_expiry_date}. Please test hardware functionality before expiration.`,
          `/requests/${candidate.request_id}`
        );

        logAudit(null, 'warranty_pre_expiry_notice', 'repair_requests', candidate.request_id, {
          warranty_expiry_date: candidate.warranty_expiry_date,
          customer_id: candidate.customer_id,
        });

        notifiedCount++;
      });
    }

    return { processed: candidates.length, notified: notifiedCount };
  } finally {
    isRunning.warranty = false;
  }
}

// Scans and deletes uploads older than 24 hours not referenced in any database table
export async function cleanOrphanUploads(options = {}) {
  if (isRunning.orphanUploads) {
    return { scanned: 0, deleted: 0, kept: 0, skipped: true, reason: 'Already running' };
  }
  isRunning.orphanUploads = true;

  try {
    const targetDir = options.uploadsDir || defaultUploadsDir;
    const maxAgeMs = options.maxAgeMs !== undefined ? options.maxAgeMs : 24 * 60 * 60 * 1000;

    if (!fs.existsSync(targetDir)) {
      return { scanned: 0, deleted: 0, kept: 0 };
    }

    const files = fs.readdirSync(targetDir);
    let deletedCount = 0;
    let keptCount = 0;
    let scannedCount = 0;

    const checkStmt = db.prepare(`
      SELECT 1 FROM repair_requests WHERE photos LIKE ?
      UNION ALL
      SELECT 1 FROM timeline_events WHERE photo_proof LIKE ?
      UNION ALL
      SELECT 1 FROM messages WHERE attachments LIKE ?
      UNION ALL
      SELECT 1 FROM users WHERE avatar LIKE ?
      UNION ALL
      SELECT 1 FROM shops WHERE logo LIKE ? OR banner_image LIKE ?
      LIMIT 1
    `);

    for (const file of files) {
      if (file.startsWith('.') || file === '.gitkeep') {
        continue;
      }

      const filePath = path.join(targetDir, file);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }

      if (!stat.isFile()) {
        continue;
      }

      scannedCount++;
      const ageMs = Date.now() - stat.mtimeMs;

      if (ageMs < maxAgeMs) {
        keptCount++;
        continue;
      }

      const pattern = `%${file}%`;
      const referenced = checkStmt.get(pattern, pattern, pattern, pattern, pattern, pattern);

      if (referenced) {
        keptCount++;
      } else {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
          logAudit(null, 'orphan_upload_deleted', 'uploads', file, {
            filename: file,
            age_hours: Math.round(ageMs / (3600 * 1000)),
          });
        } catch (unlinkErr) {
          console.error(`Failed to delete orphaned upload ${file}:`, unlinkErr);
          keptCount++;
        }
      }
    }

    return { scanned: scannedCount, deleted: deletedCount, kept: keptCount };
  } finally {
    isRunning.orphanUploads = false;
  }
}

// Prunes read notifications older than 30 days and audit logs older than 180 days
export async function pruneRetentionData(options = {}) {
  if (isRunning.retention) {
    return { notificationsPruned: 0, auditLogsPruned: 0, skipped: true, reason: 'Already running' };
  }
  isRunning.retention = true;

  try {
    const batchSize = options.batchSize || 500;
    let totalNotifsPruned = 0;

    while (true) {
      const deleted = runTransaction(() => {
        const query = options.notificationsCutoff
          ? `DELETE FROM notifications
             WHERE id IN (
               SELECT id FROM notifications
               WHERE is_read = 1 AND created_at <= ?
               LIMIT ?
             )`
          : `DELETE FROM notifications
             WHERE id IN (
               SELECT id FROM notifications
               WHERE is_read = 1 AND created_at <= datetime('now', '-30 days')
               LIMIT ?
             )`;
        return options.notificationsCutoff
          ? db.prepare(query).run(options.notificationsCutoff, batchSize).changes
          : db.prepare(query).run(batchSize).changes;
      });

      totalNotifsPruned += deleted;
      if (deleted < batchSize) {
        break;
      }
    }

    let totalAuditLogsPruned = 0;

    while (true) {
      const deleted = runTransaction(() => {
        const query = options.auditLogsCutoff
          ? `DELETE FROM audit_logs
             WHERE id IN (
               SELECT id FROM audit_logs
               WHERE created_at <= ?
               LIMIT ?
             )`
          : `DELETE FROM audit_logs
             WHERE id IN (
               SELECT id FROM audit_logs
               WHERE created_at <= datetime('now', '-180 days')
               LIMIT ?
             )`;
        return options.auditLogsCutoff
          ? db.prepare(query).run(options.auditLogsCutoff, batchSize).changes
          : db.prepare(query).run(batchSize).changes;
      });

      totalAuditLogsPruned += deleted;
      if (deleted < batchSize) {
        break;
      }
    }

    if (totalNotifsPruned > 0 || totalAuditLogsPruned > 0) {
      logAudit(null, 'retention_pruned', 'system', 'retention', {
        notifications_pruned: totalNotifsPruned,
        audit_logs_pruned: totalAuditLogsPruned,
      });
    }

    return {
      notificationsPruned: totalNotifsPruned,
      auditLogsPruned: totalAuditLogsPruned,
    };
  } finally {
    isRunning.retention = false;
  }
}

// Starts recurring background jobs for escrow, SLA, warranty, and storage maintenance
export function startScheduler(intervals = {}) {
  if (schedulerActive) {
    return false;
  }
  schedulerActive = true;

  const escrowInterval = intervals.escrowIntervalMs || 60 * 60 * 1000;
  const disputeInterval = intervals.disputeIntervalMs || 60 * 60 * 1000;
  const warrantyInterval = intervals.warrantyIntervalMs || 6 * 60 * 60 * 1000;
  const orphanInterval = intervals.orphanIntervalMs || 24 * 60 * 60 * 1000;
  const retentionInterval = intervals.retentionIntervalMs || 24 * 60 * 60 * 1000;

  const t1 = setInterval(() => autoReleaseEscrows().catch((err) => console.error('Escrow job failed:', err)), escrowInterval);
  const t2 = setInterval(() => escalateDisputeSlas().catch((err) => console.error('Dispute SLA job failed:', err)), disputeInterval);
  const t3 = setInterval(() => sendWarrantyPreExpiryNotices().catch((err) => console.error('Warranty job failed:', err)), warrantyInterval);
  const t4 = setInterval(() => cleanOrphanUploads().catch((err) => console.error('Orphan cleanup job failed:', err)), orphanInterval);
  const t5 = setInterval(() => pruneRetentionData().catch((err) => console.error('Retention prune job failed:', err)), retentionInterval);

  t1.unref?.();
  t2.unref?.();
  t3.unref?.();
  t4.unref?.();
  t5.unref?.();

  timers.push(t1, t2, t3, t4, t5);
  return true;
}

// Halts scheduler timers and waits for running jobs to finish
export async function stopScheduler() {
  if (!schedulerActive && timers.length === 0) {
    return false;
  }
  schedulerActive = false;
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers = [];

  const maxWait = Date.now() + 2000;
  while (Object.values(isRunning).some(Boolean) && Date.now() < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}
