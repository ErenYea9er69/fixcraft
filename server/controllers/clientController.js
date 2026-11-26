import db, { runTransaction } from '../db.js';
import { logAudit } from '../utils/auditLogger.js';

export const PLATFORM_FEE_RATE = 0.05;

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

// Hydrates raw database request row with photos, timeline events, quotes, review, and escrow
function formatRequest(row) {
  if (!row) return null;
  const photos = JSON.parse(row.photos || '[]');
  const timeline = getStmt('SELECT * FROM timeline_events WHERE request_id = ? ORDER BY created_at ASC').all(row.id);
  const quotes = getStmt('SELECT * FROM quotes WHERE request_id = ? ORDER BY total_cost ASC').all(row.id);
  const review = getStmt('SELECT * FROM reviews WHERE request_id = ?').get(row.id);
  const escrow = getStmt('SELECT * FROM escrow_ledger WHERE request_id = ?').get(row.id);

  if (review) {
    review.tags = JSON.parse(review.tags || '[]');
  }

  return {
    ...row,
    photos,
    timeline,
    quotes,
    review: review || null,
    escrow: escrow || null,
  };
}

export const clientController = {
  // Returns all repair requests created by the authenticated customer
  getMyRequests: (req, res) => {
    try {
      const rows = getStmt('SELECT * FROM repair_requests WHERE customer_id = ? ORDER BY created_at DESC').all(req.user.id);
      res.json(rows.map(formatRequest));
    } catch (err) {
      console.error('Error fetching client requests:', err);
      res.status(500).json({ error: 'Failed to fetch repair requests' });
    }
  },

  // Creates a new hardware repair ticket and broadcasts to verified workshops
  createRequest: (req, res) => {
    try {
      const {
        deviceCategory,
        deviceBrand,
        deviceModel,
        serialNumber,
        deviceYear,
        issueCategory,
        issueTitle,
        description,
        photos,
        urgency,
        preferredService,
        location,
      } = req.body;

      if (!deviceCategory || !deviceBrand || !deviceModel || !issueTitle || !description) {
        return res.status(400).json({ error: 'Device category, brand, model, title, and description are required' });
      }

      const id = `req-${Date.now().toString(36)}`;
      const photoArray = Array.isArray(photos) ? photos : [];

      runTransaction(() => {
        getStmt(`
          INSERT INTO repair_requests (
            id, customer_id, device_category, device_brand, device_model,
            serial_number, device_year, issue_category, issue_title, description,
            photos, urgency, preferred_service, location, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        `).run(
          id,
          req.user.id,
          deviceCategory,
          deviceBrand,
          deviceModel,
          serialNumber || null,
          deviceYear || '2023',
          issueCategory || 'Hardware Diagnosis',
          issueTitle,
          description,
          JSON.stringify(photoArray),
          urgency || 'standard',
          preferredService || 'dropoff',
          location || 'San Francisco, CA'
        );

        getStmt(`
          INSERT INTO timeline_events (id, request_id, status, title, description, completed)
          VALUES (?, ?, 'open', 'Repair Request Published', 'Ticket broadcasted to verified workshops.', 1)
        `).run(`t-${Date.now()}`, id);

        logAudit(req.user.id, 'request_created', 'repair_requests', id, {
          deviceCategory,
          deviceBrand,
          deviceModel
        });
      });

      const created = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(id);
      res.status(201).json(formatRequest(created));
    } catch (err) {
      console.error('Error creating request:', err);
      res.status(500).json({ error: 'Failed to create repair request' });
    }
  },

  // Cancels an open repair request prior to quote acceptance
  cancelRequest: (req, res) => {
    try {
      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'Repair request not found' });
      }

      if (request.customer_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized to cancel this ticket' });
      }

      if (request.status !== 'open') {
        return res.status(400).json({ error: 'Cannot cancel ticket after a quote has been accepted. Please raise a dispute or contact workshop.' });
      }

      runTransaction(() => {
        const updateResult = getStmt("UPDATE repair_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = 'open'").run(request.id);
        if (updateResult.changes === 0) {
          throw new OperationalError(409, 'Repair ticket is no longer open');
        }

        getStmt(`
          INSERT INTO timeline_events (id, request_id, status, title, description, completed)
          VALUES (?, ?, 'cancelled', 'Request Cancelled', 'Client withdrew ticket.', 1)
        `).run(`t-${Date.now()}`, request.id);

        logAudit(req.user.id, 'request_cancelled', 'repair_requests', request.id, {
          customer_id: request.customer_id
        });
      });

      res.json({ success: true, message: 'Repair ticket cancelled' });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Error cancelling request:', err);
      res.status(500).json({ error: 'Failed to cancel request' });
    }
  },

  // Accepts a workshop quote, declines competing offers, and initializes escrow holding
  acceptQuote: (req, res) => {
    try {
      const quoteId = req.params.id;
      const quote = getStmt('SELECT * FROM quotes WHERE id = ?').get(quoteId);
      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(quote.request_id);
      if (!request) {
        return res.status(404).json({ error: 'Associated repair ticket not found' });
      }

      if (request.customer_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized: You do not own this repair ticket' });
      }

      if (request.status !== 'open' || quote.status !== 'pending') {
        return res.status(409).json({ error: 'This repair ticket is no longer open for quote acceptance' });
      }

      const escrowId = `escrow-${Date.now().toString(36)}`;
      const subtotal = quote.total_cost;
      const platformFee = Math.round(subtotal * PLATFORM_FEE_RATE * 100) / 100;

      runTransaction(() => {
        const updateReqResult = getStmt(`
          UPDATE repair_requests 
          SET status = 'quote_accepted', accepted_quote_id = ?, updated_at = datetime('now') 
          WHERE id = ? AND status = 'open'
        `).run(quoteId, request.id);

        if (updateReqResult.changes === 0) {
          throw new OperationalError(409, 'This repair ticket is no longer open for quote acceptance');
        }

        const updateQuoteResult = getStmt(`
          UPDATE quotes 
          SET status = 'accepted' 
          WHERE id = ? AND status = 'pending' AND request_id = ?
        `).run(quoteId, request.id);

        if (updateQuoteResult.changes === 0) {
          throw new OperationalError(409, 'This quote is no longer eligible for acceptance');
        }

        getStmt(`
          UPDATE quotes 
          SET status = 'declined' 
          WHERE request_id = ? AND id != ? AND status = 'pending'
        `).run(request.id, quoteId);

        getStmt(`
          INSERT INTO escrow_ledger (
            id, request_id, customer_id, shop_id, subtotal, platform_fee,
            total_amount, customer_refund_amount, shop_payout_amount, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'held_in_escrow')
        `).run(escrowId, request.id, req.user.id, quote.shop_id, subtotal, platformFee, subtotal);

        getStmt(`
          INSERT INTO timeline_events (id, request_id, status, title, description, completed)
          VALUES (?, ?, 'quote_accepted', ?, ?, 1)
        `).run(
          `t-${Date.now()}-acc`,
          request.id,
          'Quote Accepted & Escrow Funded',
          `Offer locked at $${quote.total_cost}. $${quote.total_cost} safely placed into escrow hold.`
        );

        const shop = getStmt('SELECT user_id, name FROM shops WHERE id = ?').get(quote.shop_id);
        if (shop) {
          getStmt(`
            INSERT INTO notifications (id, user_id, title, message, link_url)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            `notif-${Date.now()}`,
            shop.user_id,
            'Quote Accepted!',
            `A customer accepted your $${quote.total_cost} quote for ${request.deviceBrand} ${request.deviceModel}. Bench ready!`,
            `/requests/${request.id}`
          );
        }

        logAudit(req.user.id, 'quote_accepted', 'repair_requests', request.id, {
          quote_id: quoteId,
          escrow_id: escrowId,
          subtotal,
          platform_fee: platformFee
        });
      });

      const updatedRequest = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(request.id);
      const updatedEscrow = getStmt('SELECT * FROM escrow_ledger WHERE id = ?').get(escrowId);

      res.json({
        success: true,
        message: `Quote accepted. $${quote.total_cost} placed in escrow protection.`,
        request: formatRequest(updatedRequest),
        escrow: updatedEscrow,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Error accepting quote:', err);
      res.status(500).json({ error: 'Failed to accept quote' });
    }
  },

  // Confirms hardware handover and releases held escrow funds to the workshop
  confirmHandover: (req, res) => {
    try {
      const requestId = req.params.id;
      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Repair ticket not found' });
      }

      if (request.customer_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized to confirm handover for this ticket' });
      }

      if (request.status !== 'ready_for_pickup') {
        return res.status(400).json({ error: `Cannot confirm handover while status is "${request.status}". Hardware must be marked ready for pickup.` });
      }

      const escrow = getStmt('SELECT * FROM escrow_ledger WHERE request_id = ?').get(requestId);
      if (!escrow) {
        return res.status(404).json({ error: 'No active escrow record found' });
      }

      if (escrow.status !== 'held_in_escrow') {
        return res.status(409).json({ error: 'Escrow has already been released or is disputed' });
      }

      const shopPayout = Math.round((escrow.subtotal - escrow.platform_fee) * 100) / 100;

      runTransaction(() => {
        const updateReqResult = getStmt(`
          UPDATE repair_requests 
          SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') 
          WHERE id = ? AND status = 'ready_for_pickup'
        `).run(requestId);

        if (updateReqResult.changes === 0) {
          throw new OperationalError(409, 'Repair ticket is no longer ready for pickup');
        }

        const updateEscrowResult = getStmt(`
          UPDATE escrow_ledger 
          SET status = 'released_to_shop', shop_payout_amount = ?, released_at = datetime('now') 
          WHERE id = ? AND status = 'held_in_escrow'
        `).run(shopPayout, escrow.id);

        if (updateEscrowResult.changes === 0) {
          throw new OperationalError(409, 'Escrow has already been released or is disputed');
        }

        getStmt('UPDATE shops SET completed_repairs_count = completed_repairs_count + 1 WHERE id = ?').run(escrow.shop_id);

        getStmt(`
          INSERT INTO timeline_events (id, request_id, status, title, description, completed)
          VALUES (?, ?, 'completed', 'Repair Completed & Device Collected', ?, 1)
        `).run(
          `t-${Date.now()}-done`,
          requestId,
          `Customer inspected hardware, verified diagnostics, and approved escrow release of $${shopPayout}.`
        );

        const shop = getStmt('SELECT user_id FROM shops WHERE id = ?').get(escrow.shop_id);
        if (shop) {
          getStmt(`
            INSERT INTO notifications (id, user_id, title, message, link_url)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            `notif-${Date.now()}-release`,
            shop.user_id,
            'Escrow Funds Released!',
            `Customer confirmed device handover. $${shopPayout} has been credited to your shop.`,
            `/requests/${requestId}`
          );
        }

        logAudit(req.user.id, 'escrow_released', 'escrow_ledger', escrow.id, {
          request_id: requestId,
          shop_id: escrow.shop_id,
          shop_payout: shopPayout
        });
      });

      const updatedRequest = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      const updatedEscrow = getStmt('SELECT * FROM escrow_ledger WHERE id = ?').get(escrow.id);

      res.json({
        success: true,
        message: 'Handover verified and escrow released to workshop.',
        request: formatRequest(updatedRequest),
        escrow: updatedEscrow,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Error confirming handover:', err);
      res.status(500).json({ error: 'Failed to confirm handover' });
    }
  },

  // Opens a formal dispute and freezes held escrow funds pending administrative review
  openDispute: (req, res) => {
    try {
      const requestId = req.params.id;
      const { reason, customerStatement } = req.body;

      if (!reason || !customerStatement) {
        return res.status(400).json({ error: 'Reason and detailed customer statement are required' });
      }

      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Repair ticket not found' });
      }

      if (request.customer_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized: You do not own this repair ticket' });
      }

      const escrow = getStmt('SELECT * FROM escrow_ledger WHERE request_id = ?').get(requestId);
      if (!escrow || escrow.status !== 'held_in_escrow') {
        return res.status(400).json({ error: 'Dispute can only be filed while escrow funds are actively held' });
      }

      const disputeId = `disp-${Date.now().toString(36)}`;

      runTransaction(() => {
        const updateReqResult = getStmt("UPDATE repair_requests SET status = 'disputed', updated_at = datetime('now') WHERE id = ? AND status NOT IN ('disputed', 'cancelled')").run(requestId);
        if (updateReqResult.changes === 0) {
          throw new OperationalError(409, 'Repair ticket is already disputed or cancelled');
        }

        const updateEscrowResult = getStmt("UPDATE escrow_ledger SET status = 'disputed_frozen' WHERE id = ? AND status = 'held_in_escrow'").run(escrow.id);
        if (updateEscrowResult.changes === 0) {
          throw new OperationalError(409, 'Escrow funds are no longer in held status');
        }

        getStmt(`
          INSERT INTO disputes (
            id, request_id, escrow_id, opened_by_user_id, reason, customer_statement, resolution
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `).run(disputeId, requestId, escrow.id, req.user.id, reason, customerStatement);

        getStmt(`
          INSERT INTO timeline_events (id, request_id, status, title, description, completed)
          VALUES (?, ?, 'disputed', 'Dispute Raised - Escrow Frozen', ?, 1)
        `).run(
          `t-${Date.now()}-disp`,
          requestId,
          `Customer opened a dispute: "${reason}". Escrow payment frozen pending admin arbitration.`
        );

        const admin = getStmt("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
        if (admin) {
          getStmt(`
            INSERT INTO notifications (id, user_id, title, message, link_url)
            VALUES (?, ?, 'New Dispute Raised', 'A repair dispute requires arbitration.', ?)
          `).run(`notif-${Date.now()}-adm`, admin.id, `/admin/disputes/${disputeId}`);
        }

        logAudit(req.user.id, 'dispute_opened', 'disputes', disputeId, {
          request_id: requestId,
          escrow_id: escrow.id,
          reason
        });
      });

      const updatedDispute = getStmt('SELECT * FROM disputes WHERE id = ?').get(disputeId);
      res.status(201).json({
        success: true,
        message: 'Dispute submitted. Escrow funds have been frozen pending operator review.',
        dispute: updatedDispute,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Error opening dispute:', err);
      res.status(500).json({ error: 'Failed to open dispute' });
    }
  },

  // Submits a customer review for a completed repair and recalculates the workshop's rating
  submitReview: (req, res) => {
    try {
      const requestId = req.params.id;
      const { rating, repairSpeedRating, communicationRating, qualityRating, comment, tags } = req.body;

      const numRating = Number(rating);
      if (!numRating || isNaN(numRating) || numRating < 1 || numRating > 5 || !comment || !comment.trim()) {
        return res.status(400).json({ error: 'Rating (integer 1-5) and comment are required' });
      }

      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Repair ticket not found' });
      }

      if (request.customer_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized: You do not own this ticket' });
      }

      if (request.status !== 'completed') {
        return res.status(400).json({ error: 'Reviews can only be submitted for completed repairs' });
      }

      const existingReview = getStmt('SELECT id FROM reviews WHERE request_id = ?').get(requestId);
      if (existingReview) {
        return res.status(409).json({ error: 'A review has already been submitted for this repair ticket' });
      }

      const quote = getStmt('SELECT * FROM quotes WHERE id = ?').get(request.accepted_quote_id);
      if (!quote) {
        return res.status(404).json({ error: 'Accepted quote not found' });
      }

      const reviewId = `rev-${Date.now().toString(36)}`;
      const tagArray = Array.isArray(tags) ? tags : [];

      runTransaction(() => {
        getStmt(`
          INSERT INTO reviews (
            id, request_id, shop_id, customer_id, rating, repair_speed_rating,
            communication_rating, quality_rating, comment, device_repaired, repair_cost, tags, verified_purchase
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          reviewId,
          requestId,
          quote.shop_id,
          req.user.id,
          numRating,
          repairSpeedRating || numRating,
          communicationRating || numRating,
          qualityRating || numRating,
          comment.trim(),
          `${request.deviceBrand} ${request.deviceModel}`,
          quote.total_cost,
          JSON.stringify(tagArray)
        );

        getStmt(`
          UPDATE shops 
          SET rating = ROUND(((rating * review_count) + ?) / (review_count + 1), 2),
              review_count = review_count + 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(numRating, quote.shop_id);

        logAudit(req.user.id, 'review_submitted', 'reviews', reviewId, {
          request_id: requestId,
          shop_id: quote.shop_id,
          rating: numRating
        });
      });

      const createdReview = getStmt('SELECT * FROM reviews WHERE id = ?').get(reviewId);
      createdReview.tags = JSON.parse(createdReview.tags || '[]');

      res.status(201).json(createdReview);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Error submitting review:', err);
      res.status(500).json({ error: 'Failed to submit review' });
    }
  },

  // Submits a post-repair warranty claim verifying active warranty duration
  submitWarrantyClaim: (req, res) => {
    try {
      const { requestId, claimIssue } = req.body;

      if (!requestId || !claimIssue || !claimIssue.trim()) {
        return res.status(400).json({ error: 'Request ID and claim issue description are required' });
      }

      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Original repair ticket not found' });
      }

      if (request.customer_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized: You do not own this ticket' });
      }

      if (request.status !== 'completed' || !request.completed_at) {
        return res.status(400).json({ error: 'Warranty claims can only be filed on completed repairs' });
      }

      const quote = getStmt('SELECT * FROM quotes WHERE id = ?').get(request.accepted_quote_id);
      if (!quote || !quote.shop_id) {
        return res.status(400).json({ error: 'Cannot file warranty claim: Repair ticket does not have an associated workshop quote' });
      }

      const warrantyMonths = quote.warranty_months !== undefined ? quote.warranty_months : 3;

      const validity = getStmt(`
        SELECT datetime(?, '+' || ? || ' months') as expiry_date,
               datetime('now') <= datetime(?, '+' || ? || ' months') as is_valid
      `).get(request.completed_at, warrantyMonths, request.completed_at, warrantyMonths);

      if (!validity || !validity.is_valid) {
        return res.status(400).json({
          error: `Warranty expired on ${validity ? validity.expiry_date : 'earlier date'}. Claims can no longer be filed.`,
        });
      }

      const claimId = `claim-${Date.now().toString(36)}`;
      const shopId = quote.shop_id;

      runTransaction(() => {
        getStmt(`
          INSERT INTO warranty_claims (
            id, request_id, shop_id, customer_id, claim_issue, status, warranty_expiry_date
          ) VALUES (?, ?, ?, ?, ?, 'submitted', ?)
        `).run(claimId, requestId, shopId, req.user.id, claimIssue.trim(), validity.expiry_date);

        const shop = getStmt('SELECT user_id FROM shops WHERE id = ?').get(shopId);
        if (shop) {
          getStmt(`
            INSERT INTO notifications (id, user_id, title, message, link_url)
            VALUES (?, ?, 'New Warranty Claim Filed', ?, ?)
          `).run(
            `notif-${Date.now()}-claim`,
            shop.user_id,
            `Customer filed a warranty claim for ${request.deviceBrand} ${request.deviceModel}.`,
            `/shop/warranty-claims`
          );
        }

        logAudit(req.user.id, 'warranty_claim_submitted', 'warranty_claims', claimId, {
          request_id: requestId,
          shop_id: shopId
        });
      });

      const claim = getStmt('SELECT * FROM warranty_claims WHERE id = ?').get(claimId);
      res.status(201).json({
        success: true,
        message: 'Warranty claim submitted successfully. The workshop has been notified.',
        claim,
      });
    } catch (err) {
      console.error('Error submitting warranty claim:', err);
      res.status(500).json({ error: 'Failed to submit warranty claim' });
    }
  },
};
