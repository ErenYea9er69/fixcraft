import db, { runTransaction } from '../db.js';
import { logAudit } from '../utils/auditLogger.js';

const stmtCache = new Map();

// Helper to retrieve or prepare cached SQLite statements
function getStmt(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

class OperationalError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const adminController = {
  // Returns platform aggregate KPIs including users, shops, repairs, and escrow sums
  getMetrics: (req, res) => {
    try {
      const totalUsers = getStmt('SELECT COUNT(*) as count FROM users').get().count;
      const totalShops = getStmt('SELECT COUNT(*) as count FROM shops').get().count;
      const totalRequests = getStmt('SELECT COUNT(*) as count FROM repair_requests').get().count;
      const activeRepairs = getStmt("SELECT COUNT(*) as count FROM repair_requests WHERE status NOT IN ('open', 'completed', 'cancelled')").get().count;

      const escrowStats = getStmt(`
        SELECT 
          COALESCE(SUM(CASE WHEN status IN ('held_in_escrow', 'disputed_frozen') THEN total_amount ELSE 0 END), 0) as held,
          COALESCE(SUM(CASE WHEN status IN ('released_to_shop', 'split_payout') THEN shop_payout_amount ELSE 0 END), 0) as released,
          COALESCE(SUM(CASE WHEN status IN ('refunded_to_customer', 'split_payout') THEN customer_refund_amount ELSE 0 END), 0) as refunded
        FROM escrow_ledger
      `).get();

      const openDisputes = getStmt("SELECT COUNT(*) as count FROM disputes WHERE resolution = 'pending'").get().count;
      const pendingShops = getStmt('SELECT COUNT(*) as count FROM shops WHERE verified = 0').get().count;

      res.json({
        totalUsers,
        totalShops,
        totalRequests,
        activeRepairs,
        escrowHeldTotal: escrowStats.held,
        escrowReleasedTotal: escrowStats.released,
        escrowRefundedTotal: escrowStats.refunded,
        openDisputesCount: openDisputes,
        pendingShopsCount: pendingShops,
      });
    } catch (err) {
      console.error('Error fetching admin metrics:', err);
      res.status(500).json({ error: 'Failed to fetch platform metrics' });
    }
  },

  // Returns all registered user accounts with activity and roles
  getUsers: (req, res) => {
    try {
      const users = getStmt(`
        SELECT id, name, email, role, phone, is_active, created_at
        FROM users
        ORDER BY created_at DESC
      `).all();
      res.json(users);
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },

  // Activates or suspends a user account and invalidates tokens upon suspension
  setUserStatus: (req, res) => {
    try {
      const targetUserId = req.params.id;
      if (req.user.id === targetUserId) {
        return res.status(400).json({ error: 'Administrators cannot modify their own active status' });
      }

      const { isActive } = req.body;
      const user = getStmt('SELECT id FROM users WHERE id = ?').get(targetUserId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const activeFlag = isActive ? 1 : 0;
      if (!isActive) {
        getStmt("UPDATE users SET is_active = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?").run(activeFlag, targetUserId);
      } else {
        getStmt("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(activeFlag, targetUserId);
      }

      logAudit(req.user.id, isActive ? 'user_activated' : 'user_suspended', 'users', targetUserId, {
        admin_id: req.user.id
      });

      res.json({ success: true, message: `User account has been ${isActive ? 'activated' : 'suspended'}.` });
    } catch (err) {
      console.error('Error setting user status:', err);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  },

  // Lists unverified repair shops awaiting admin accreditation
  getPendingShops: (req, res) => {
    try {
      const shops = getStmt('SELECT * FROM shops WHERE verified = 0 ORDER BY created_at ASC').all();
      res.json(shops.map(s => ({
        ...s,
        specialties: JSON.parse(s.specialties || '[]'),
        certifications: JSON.parse(s.certifications || '[]'),
      })));
    } catch (err) {
      console.error('Error fetching pending shops:', err);
      res.status(500).json({ error: 'Failed to fetch pending shops' });
    }
  },

  // Updates workshop verification status and notifies workshop owner
  verifyShop: (req, res) => {
    try {
      const { verified } = req.body;
      const shop = getStmt('SELECT * FROM shops WHERE id = ?').get(req.params.id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop profile not found' });
      }

      const verifiedFlag = verified ? 1 : 0;
      getStmt("UPDATE shops SET verified = ?, updated_at = datetime('now') WHERE id = ?").run(verifiedFlag, shop.id);

      getStmt(`
        INSERT INTO notifications (id, user_id, title, message, link_url)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        `notif-${Date.now()}-verify`,
        shop.user_id,
        verified ? 'Workshop Verified!' : 'Verification Status Changed',
        verified ? 'Your workshop certification has been verified by the operations desk!' : 'Your verified workshop badge was updated.',
        '/shop/profile'
      );

      logAudit(req.user.id, verified ? 'shop_verified' : 'shop_unverified', 'shops', shop.id, {
        admin_id: req.user.id,
        verified: verifiedFlag
      });

      res.json({ success: true, verified: Boolean(verified) });
    } catch (err) {
      console.error('Error verifying shop:', err);
      res.status(500).json({ error: 'Failed to update shop verification' });
    }
  },

  // Returns all escrow ledger records with customer, shop, and device context
  getEscrowLedger: (req, res) => {
    try {
      const rows = getStmt(`
        SELECT e.*, r.device_brand, r.device_model, r.issue_title,
               s.name as shop_name, u.name as customer_name
        FROM escrow_ledger e
        JOIN repair_requests r ON r.id = e.request_id
        JOIN shops s ON s.id = e.shop_id
        JOIN users u ON u.id = e.customer_id
        ORDER BY e.created_at DESC
      `).all();
      res.json(rows);
    } catch (err) {
      console.error('Error fetching escrow ledger:', err);
      res.status(500).json({ error: 'Failed to fetch escrow ledger' });
    }
  },

  // Returns all disputes with associated ticket details and escrow totals
  getDisputes: (req, res) => {
    try {
      const rows = getStmt(`
        SELECT d.*, r.device_brand, r.device_model, r.issue_title,
               e.total_amount, s.name as shop_name, u.name as customer_name
        FROM disputes d
        JOIN repair_requests r ON r.id = d.request_id
        JOIN escrow_ledger e ON e.id = d.escrow_id
        JOIN shops s ON s.id = e.shop_id
        JOIN users u ON u.id = d.opened_by_user_id
        ORDER BY d.created_at DESC
      `).all();
      res.json(rows);
    } catch (err) {
      console.error('Error fetching disputes:', err);
      res.status(500).json({ error: 'Failed to fetch disputes' });
    }
  },

  // Arbitrates a dispute with refund, release, or custom split and reconciles escrow
  resolveDispute: (req, res) => {
    try {
      const disputeId = req.params.id;
      const { resolution, customerRefundAmount, shopPayoutAmount, adminNotes } = req.body;

      const validResolutions = ['refund_customer', 'release_to_shop', 'split_payout'];
      if (!validResolutions.includes(resolution)) {
        return res.status(400).json({ error: `Invalid resolution. Must be one of: ${validResolutions.join(', ')}` });
      }

      const dispute = getStmt('SELECT * FROM disputes WHERE id = ?').get(disputeId);
      if (!dispute) {
        return res.status(404).json({ error: 'Dispute record not found' });
      }

      if (dispute.resolution !== 'pending') {
        return res.status(409).json({ error: 'This dispute has already been resolved' });
      }

      const escrow = getStmt('SELECT * FROM escrow_ledger WHERE id = ?').get(dispute.escrow_id);
      if (!escrow) {
        return res.status(404).json({ error: 'Associated escrow record not found' });
      }

      const totalCents = Math.round(escrow.total_amount * 100);
      let finalCustomerRefund = 0;
      let finalShopPayout = 0;
      let escrowStatus = resolution;

      if (resolution === 'refund_customer') {
        escrowStatus = 'refunded_to_customer';
        finalCustomerRefund = escrow.total_amount;
        finalShopPayout = 0;
      } else if (resolution === 'release_to_shop') {
        escrowStatus = 'released_to_shop';
        finalCustomerRefund = 0;
        finalShopPayout = Math.round((escrow.subtotal - escrow.platform_fee) * 100) / 100;
      } else if (resolution === 'split_payout') {
        escrowStatus = 'split_payout';
        const customerVal = Number(customerRefundAmount);
        const shopVal = Number(shopPayoutAmount);

        if (isNaN(customerVal) || isNaN(shopVal) || customerVal < 0 || shopVal < 0) {
          return res.status(400).json({ error: 'Customer refund and shop payout amounts must be non-negative numbers' });
        }

        const customerCents = Math.round(customerVal * 100);
        const shopCents = Math.round(shopVal * 100);

        if (customerCents + shopCents !== totalCents) {
          return res.status(400).json({
            error: `Split amounts ($${(customerCents / 100).toFixed(2)} + $${(shopCents / 100).toFixed(2)} = $${((customerCents + shopCents) / 100).toFixed(2)}) must equal total escrow holding ($${(totalCents / 100).toFixed(2)}).`,
          });
        }

        finalCustomerRefund = customerCents / 100;
        finalShopPayout = shopCents / 100;
      }

      runTransaction(() => {
        const updateDisputeResult = getStmt(`
          UPDATE disputes 
          SET resolution = ?, resolution_customer_amount = ?, resolution_shop_amount = ?,
              admin_notes = ?, resolved_at = datetime('now')
          WHERE id = ? AND resolution = 'pending'
        `).run(resolution, finalCustomerRefund, finalShopPayout, adminNotes || 'Arbitration completed by admin.', disputeId);

        if (updateDisputeResult.changes === 0) {
          throw new OperationalError(409, 'This dispute has already been resolved');
        }

        const updateEscrowResult = getStmt(`
          UPDATE escrow_ledger
          SET status = ?, customer_refund_amount = ?, shop_payout_amount = ?, released_at = datetime('now')
          WHERE id = ? AND status = 'disputed_frozen'
        `).run(escrowStatus, finalCustomerRefund, finalShopPayout, escrow.id);

        if (updateEscrowResult.changes === 0) {
          throw new OperationalError(409, 'Escrow record is not in disputed_frozen status');
        }

        const nextStatus = resolution === 'refund_customer' ? 'cancelled' : 'completed';
        getStmt(`
          UPDATE repair_requests
          SET status = ?, completed_at = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(nextStatus, nextStatus === 'completed' ? new Date().toISOString() : null, dispute.request_id);

        if (nextStatus === 'completed') {
          getStmt('UPDATE shops SET completed_repairs_count = completed_repairs_count + 1 WHERE id = ?').run(escrow.shop_id);
        }

        getStmt(`
          INSERT INTO timeline_events (id, request_id, status, title, description, completed)
          VALUES (?, ?, ?, 'Dispute Arbitrated by Platform Operator', ?, 1)
        `).run(
          `t-${Date.now()}-resolved`,
          dispute.request_id,
          nextStatus,
          `Resolution: ${resolution.replace(/_/g, ' ').toUpperCase()}. Refund: $${finalCustomerRefund}, Shop Payout: $${finalShopPayout}.`
        );

        const customerMsg = `Your dispute was resolved (${resolution.replace(/_/g, ' ')}). Refund amount: $${finalCustomerRefund}.`;
        const shopMsg = `Dispute was resolved (${resolution.replace(/_/g, ' ')}). Payout amount: $${finalShopPayout}.`;

        getStmt('INSERT INTO notifications (id, user_id, title, message) VALUES (?, ?, ?, ?)').run(
          `notif-${Date.now()}-cust-disp`,
          escrow.customer_id,
          'Dispute Resolved',
          customerMsg
        );

        const shop = getStmt('SELECT user_id FROM shops WHERE id = ?').get(escrow.shop_id);
        if (shop) {
          getStmt('INSERT INTO notifications (id, user_id, title, message) VALUES (?, ?, ?, ?)').run(
            `notif-${Date.now()}-shop-disp`,
            shop.user_id,
            'Dispute Resolved',
            shopMsg
          );
        }

        logAudit(req.user.id, 'dispute_resolved', 'disputes', disputeId, {
          resolution,
          customer_refund: finalCustomerRefund,
          shop_payout: finalShopPayout,
          escrow_id: escrow.id
        });
      });

      const updatedDispute = getStmt('SELECT * FROM disputes WHERE id = ?').get(disputeId);
      const updatedEscrow = getStmt('SELECT * FROM escrow_ledger WHERE id = ?').get(escrow.id);

      res.json({
        success: true,
        message: 'Dispute arbitrated and escrow ledger reconciled.',
        dispute: updatedDispute,
        escrow: updatedEscrow,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Error resolving dispute:', err);
      res.status(500).json({ error: 'Failed to resolve dispute' });
    }
  },

  // Returns the latest 100 audit log records for security and compliance review
  getAuditLogs: (req, res) => {
    try {
      const logs = getStmt('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
      res.json(logs);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  },
};
