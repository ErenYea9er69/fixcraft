import db from '../db.js';
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

// Parses JSON columns (specialties, certifications) and casts verified flag
function formatShop(s) {
  if (!s) return null;
  return {
    ...s,
    specialties: JSON.parse(s.specialties || '[]'),
    certifications: JSON.parse(s.certifications || '[]'),
    verified: Boolean(s.verified),
  };
}

export const sharedController = {
  // Returns comprehensive ticket details including timeline, quotes, and escrow for participants
  getRequestDetail: (req, res) => {
    try {
      const request = req.repairRequest;
      const timeline = getStmt('SELECT * FROM timeline_events WHERE request_id = ? ORDER BY created_at ASC').all(request.id);
      let quotes = getStmt('SELECT * FROM quotes WHERE request_id = ? ORDER BY total_cost ASC').all(request.id);
      if (req.user.role === 'shop') {
        const callerShop = getStmt('SELECT id FROM shops WHERE user_id = ?').get(req.user.id);
        quotes = quotes.filter(q => q.shop_id === callerShop?.id || q.id === request.accepted_quote_id);
      }
      const review = getStmt('SELECT * FROM reviews WHERE request_id = ?').get(request.id);
      const escrow = getStmt('SELECT * FROM escrow_ledger WHERE request_id = ?').get(request.id);

      res.json({
        ...request,
        photos: JSON.parse(request.photos || '[]'),
        timeline,
        quotes,
        review: review ? { ...review, tags: JSON.parse(review.tags || '[]') } : null,
        escrow: escrow || null,
      });
    } catch (err) {
      console.error('Error fetching request detail:', err);
      res.status(500).json({ error: 'Failed to fetch request detail' });
    }
  },

  // Returns all messages associated with a repair ticket respecting shop visibility
  getTicketMessages: (req, res) => {
    try {
      const { requestId } = req.params;
      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Repair ticket not found' });
      }

      let messages;
      if (request.status === 'open' && req.user.role === 'shop') {
        messages = getStmt(`
          SELECT m.*, u.name as sender_name, u.role as sender_role, u.avatar as sender_avatar
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.request_id = ? AND (m.sender_id = ? OR m.recipient_id = ?)
          ORDER BY m.created_at ASC
        `).all(requestId, req.user.id, req.user.id);
      } else {
        messages = getStmt(`
          SELECT m.*, u.name as sender_name, u.role as sender_role, u.avatar as sender_avatar
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.request_id = ?
          ORDER BY m.created_at ASC
        `).all(requestId);
      }

      res.json(messages.map(m => ({
        ...m,
        attachments: JSON.parse(m.attachments || '[]'),
      })));
    } catch (err) {
      console.error('Error fetching ticket messages:', err);
      res.status(500).json({ error: 'Failed to fetch ticket conversation' });
    }
  },

  // Sends a message within a ticket thread and dispatches notification to recipient
  sendTicketMessage: (req, res) => {
    try {
      const { requestId } = req.params;
      const { content, attachments, recipientId } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Message content cannot be empty' });
      }

      const request = req.repairRequest || getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Repair ticket not found' });
      }

      let targetRecipientId = null;
      if (req.user.id === request.customer_id) {
        if (request.status === 'open') {
          targetRecipientId = recipientId || null;
        } else if (request.accepted_quote_id) {
          const quote = getStmt('SELECT shop_id FROM quotes WHERE id = ?').get(request.accepted_quote_id);
          if (quote) {
            const shop = getStmt('SELECT user_id FROM shops WHERE id = ?').get(quote.shop_id);
            if (shop) targetRecipientId = shop.user_id;
          }
        }
      } else if (req.user.role === 'shop') {
        targetRecipientId = request.customer_id;
      } else if (req.user.role === 'admin') {
        targetRecipientId = recipientId || request.customer_id;
      }

      const messageId = `msg-${Date.now().toString(36)}`;
      const attachmentArray = Array.isArray(attachments) ? attachments : [];

      getStmt(`
        INSERT INTO messages (id, request_id, sender_id, recipient_id, content, attachments)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(messageId, requestId, req.user.id, targetRecipientId, content.trim(), JSON.stringify(attachmentArray));

      if (targetRecipientId) {
        getStmt(`
          INSERT INTO notifications (id, user_id, title, message, link_url)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          `notif-${Date.now()}-msg`,
          targetRecipientId,
          `New message from ${req.user.name}`,
          content.trim().substring(0, 80),
          `/requests/${requestId}`
        );
      }

      logAudit(req.user.id, 'message_sent', 'messages', messageId, {
        request_id: requestId,
        recipient_id: targetRecipientId
      });

      const created = getStmt(`
        SELECT m.*, u.name as sender_name, u.role as sender_role, u.avatar as sender_avatar
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.id = ?
      `).get(messageId);

      created.attachments = JSON.parse(created.attachments || '[]');
      res.status(201).json(created);
    } catch (err) {
      console.error('Error sending message:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  },

  // Returns public directory of verified workshops with optional category filter
  getShopsDirectory: (req, res) => {
    try {
      const { specialty } = req.query;
      let shops;

      if (specialty && specialty !== 'all') {
        shops = getStmt(`
          SELECT * FROM shops 
          WHERE verified = 1 AND EXISTS (SELECT 1 FROM json_each(specialties) WHERE value = ?)
          ORDER BY rating DESC, review_count DESC
        `).all(specialty);
      } else {
        shops = getStmt(`
          SELECT * FROM shops 
          WHERE verified = 1 
          ORDER BY rating DESC, review_count DESC
        `).all();
      }

      res.json(shops.map(formatShop));
    } catch (err) {
      console.error('Error fetching shops directory:', err);
      res.status(500).json({ error: 'Failed to fetch workshops' });
    }
  },

  // Returns public workshop profile with verified customer reviews and ratings
  getShopPublicProfile: (req, res) => {
    try {
      const shop = getStmt('SELECT * FROM shops WHERE id = ?').get(req.params.id);
      if (!shop) {
        return res.status(404).json({ error: 'Workshop not found' });
      }

      const reviews = getStmt(`
        SELECT r.*, u.name as customer_name, u.avatar as customer_avatar
        FROM reviews r
        JOIN users u ON u.id = r.customer_id
        WHERE r.shop_id = ?
        ORDER BY r.created_at DESC
      `).all(shop.id);

      res.json({
        ...formatShop(shop),
        reviews: reviews.map(r => ({
          ...r,
          tags: JSON.parse(r.tags || '[]'),
        })),
      });
    } catch (err) {
      console.error('Error fetching shop public profile:', err);
      res.status(500).json({ error: 'Failed to fetch shop details' });
    }
  },
};
