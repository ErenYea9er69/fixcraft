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

const STAGE_ORDER = ['quote_accepted', 'in_shop', 'diagnosing', 'in_repair', 'quality_check', 'ready_for_pickup'];

const STAGE_DESCRIPTIONS = {
  in_shop: 'Checked in at workshop diagnostic bench.',
  diagnosing: 'Micro-diagnostics, multimeter probing, and component isolation in progress.',
  in_repair: 'Active component repair, soldering, and replacement parts installation underway.',
  quality_check: 'QA stress testing, thermal benchmarking, and seal verification passed.',
  ready_for_pickup: 'Hardware restoration certified and waiting at counter for collection.',
};

const VALID_PARTS_QUALITY = [
  'OEM Genuine',
  'OEM Equivalent',
  'Aftermarket High-Quality',
  'Refurbished Original',
  'Tier-1 Certified Aftermarket'
];

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

export const shopController = {
  // Returns the profile, specialties, metrics, and certifications for current workshop
  getProfile: (req, res) => {
    try {
      const shop = getStmt('SELECT * FROM shops WHERE user_id = ?').get(req.user.id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop profile not found for this account' });
      }
      res.json(formatShop(shop));
    } catch (err) {
      console.error('Error fetching shop profile:', err);
      res.status(500).json({ error: 'Failed to fetch shop profile' });
    }
  },

  // Updates workshop contact information, operating hours, warranties, and branding
  updateProfile: (req, res) => {
    try {
      const shop = getStmt('SELECT * FROM shops WHERE user_id = ?').get(req.user.id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop profile not found' });
      }

      const {
        name,
        tagline,
        logo,
        bannerImage,
        address,
        city,
        phone,
        specialties,
        description,
        certifications,
        activeTechCount,
        operatingHours,
        warrantyStandard,
      } = req.body;

      getStmt(`
        UPDATE shops
        SET name = ?, tagline = ?, logo = ?, banner_image = ?, address = ?, city = ?,
            phone = ?, specialties = ?, description = ?, certifications = ?,
            active_tech_count = ?, operating_hours = ?, warranty_standard = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name !== undefined ? name : shop.name,
        tagline !== undefined ? tagline : shop.tagline,
        logo !== undefined ? logo : shop.logo,
        bannerImage !== undefined ? bannerImage : shop.banner_image,
        address !== undefined ? address : shop.address,
        city !== undefined ? city : shop.city,
        phone !== undefined ? phone : shop.phone,
        specialties !== undefined ? JSON.stringify(specialties) : shop.specialties,
        description !== undefined ? description : shop.description,
        certifications !== undefined ? JSON.stringify(certifications) : shop.certifications,
        activeTechCount !== undefined ? activeTechCount : shop.active_tech_count,
        operatingHours !== undefined ? operatingHours : shop.operating_hours,
        warrantyStandard !== undefined ? warrantyStandard : shop.warranty_standard,
        shop.id
      );

      const updated = getStmt('SELECT * FROM shops WHERE id = ?').get(shop.id);
      res.json(formatShop(updated));
    } catch (err) {
      console.error('Error updating shop profile:', err);
      res.status(500).json({ error: 'Failed to update shop profile' });
    }
  },

  // Retrieves open customer tickets matching the workshop's repair specialties
  getInboundRequests: (req, res) => {
    try {
      const shop = getStmt('SELECT * FROM shops WHERE user_id = ?').get(req.user.id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop profile not found' });
      }

      const requests = getStmt(`
        SELECT r.* 
        FROM repair_requests r
        WHERE r.status = 'open' 
          AND EXISTS (SELECT 1 FROM json_each(?) WHERE value = r.device_category)
        ORDER BY r.created_at DESC
      `).all(shop.specialties || '[]');

      res.json(requests.map(r => ({
        ...r,
        photos: JSON.parse(r.photos || '[]'),
      })));
    } catch (err) {
      console.error('Error fetching inbound requests:', err);
      res.status(500).json({ error: 'Failed to fetch inbound requests' });
    }
  },

  // Lists all active hardware repair jobs assigned to this workshop's repair bench
  getBenchRepairs: (req, res) => {
    try {
      const shop = getStmt('SELECT id FROM shops WHERE user_id = ?').get(req.user.id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop profile not found' });
      }

      const rows = getStmt(`
        SELECT r.*, q.total_cost, q.estimated_turnaround, q.warranty_months,
               e.status as escrow_status, e.subtotal as escrow_amount
        FROM repair_requests r
        JOIN quotes q ON q.id = r.accepted_quote_id
        LEFT JOIN escrow_ledger e ON e.request_id = r.id
        WHERE q.shop_id = ? AND r.status NOT IN ('open', 'cancelled')
        ORDER BY r.updated_at DESC
      `).all(shop.id);

      res.json(rows.map(r => ({
        ...r,
        photos: JSON.parse(r.photos || '[]'),
        timeline: getStmt('SELECT * FROM timeline_events WHERE request_id = ? ORDER BY created_at ASC').all(r.id),
      })));
    } catch (err) {
      console.error('Error fetching bench repairs:', err);
      res.status(500).json({ error: 'Failed to fetch bench repairs' });
    }
  },

  // Submits an itemized repair quote with turnaround time and warranty terms
  submitQuote: (req, res) => {
    try {
      const shop = getStmt('SELECT * FROM shops WHERE user_id = ?').get(req.user.id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop profile not found for this user' });
      }

      const {
        requestId,
        partsCost,
        laborCost,
        diagnosticFee,
        diagnosticFeeWaived,
        totalCost,
        partsQuality,
        estimatedTurnaround,
        turnaroundDays,
        warrantyMonths,
        warrantyDetails,
        technicianNotes,
      } = req.body;

      if (!requestId || partsCost === undefined || laborCost === undefined || totalCost === undefined) {
        return res.status(400).json({ error: 'Request ID, parts cost, labor cost, and total cost are required' });
      }

      const numParts = Number(partsCost);
      const numLabor = Number(laborCost);
      const numTotal = Number(totalCost);
      const numDiag = diagnosticFee !== undefined ? Number(diagnosticFee) : 0;

      if (isNaN(numParts) || isNaN(numLabor) || isNaN(numTotal) || isNaN(numDiag) ||
          numParts < 0 || numLabor < 0 || numTotal < 0 || numDiag < 0) {
        return res.status(400).json({ error: 'Parts cost, labor cost, total cost, and diagnostic fee must be non-negative numbers' });
      }

      const chosenQuality = partsQuality || 'OEM Genuine';
      if (!VALID_PARTS_QUALITY.includes(chosenQuality)) {
        return res.status(400).json({ error: `Invalid parts quality. Must be one of: ${VALID_PARTS_QUALITY.join(', ')}` });
      }

      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Repair ticket not found' });
      }

      if (request.status !== 'open') {
        return res.status(400).json({ error: 'Cannot submit quotes on a ticket that is no longer open' });
      }

      const existingQuote = getStmt(`
        SELECT id FROM quotes WHERE request_id = ? AND shop_id = ? AND status = 'pending'
      `).get(requestId, shop.id);

      if (existingQuote) {
        return res.status(409).json({ error: 'Your workshop already has an active pending quote for this repair ticket' });
      }

      const quoteId = `q-${Date.now().toString(36)}`;

      runTransaction(() => {
        getStmt(`
          INSERT INTO quotes (
            id, request_id, shop_id, parts_cost, labor_cost, diagnostic_fee,
            diagnostic_fee_waived, total_cost, parts_quality, estimated_turnaround,
            turnaround_days, warranty_months, warranty_details, technician_notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
          quoteId,
          requestId,
          shop.id,
          numParts,
          numLabor,
          numDiag,
          diagnosticFeeWaived ? 1 : 0,
          numTotal,
          chosenQuality,
          estimatedTurnaround || '24 hours',
          turnaroundDays || 1,
          warrantyMonths || 3,
          warrantyDetails || `${warrantyMonths || 3} Months comprehensive warranty.`,
          technicianNotes || ''
        );

        getStmt(`
          INSERT INTO timeline_events (id, request_id, status, title, description, completed)
          VALUES (?, ?, 'open', ?, ?, 1)
        `).run(
          `t-${Date.now()}-quote`,
          requestId,
          `New Quote: ${shop.name}`,
          `Proposed $${numTotal} (${estimatedTurnaround || '24 hours'} turnaround, ${warrantyMonths || 3}M warranty).`
        );

        getStmt(`
          INSERT INTO notifications (id, user_id, title, message, link_url)
          VALUES (?, ?, 'New Quote Received', ?, ?)
        `).run(
          `notif-${Date.now()}-quoterec`,
          request.customer_id,
          `${shop.name} submitted a quote of $${numTotal} for your ${request.deviceBrand} ${request.deviceModel}.`,
          `/requests/${requestId}`
        );

        logAudit(req.user.id, 'quote_submitted', 'quotes', quoteId, {
          request_id: requestId,
          total_cost: numTotal
        });
      });

      const created = getStmt('SELECT * FROM quotes WHERE id = ?').get(quoteId);
      res.status(201).json(created);
    } catch (err) {
      console.error('Error submitting quote:', err);
      res.status(500).json({ error: 'Failed to submit quote' });
    }
  },

  // Withdraws a pending quote before customer acceptance
  withdrawQuote: (req, res) => {
    try {
      const quote = getStmt('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      const shop = getStmt('SELECT id FROM shops WHERE user_id = ?').get(req.user.id);
      if (req.user.role !== 'admin' && (!shop || quote.shop_id !== shop.id)) {
        return res.status(403).json({ error: 'Unauthorized to withdraw this quote' });
      }

      if (quote.status !== 'pending') {
        return res.status(400).json({ error: 'Only pending quotes can be withdrawn' });
      }

      getStmt("UPDATE quotes SET status = 'withdrawn' WHERE id = ?").run(quote.id);

      logAudit(req.user.id, 'quote_withdrawn', 'quotes', quote.id, {
        request_id: quote.request_id,
        shop_id: quote.shop_id
      });

      res.json({ success: true, message: 'Quote withdrawn successfully' });
    } catch (err) {
      console.error('Error withdrawing quote:', err);
      res.status(500).json({ error: 'Failed to withdraw quote' });
    }
  },

  // Advances repair stage through sequential bench workflow and appends timeline event
  advanceRepairStage: (req, res) => {
    try {
      const requestId = req.params.id;
      const { status, technicianNotes, photoProof } = req.body;

      const request = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Repair ticket not found' });
      }

      if (['disputed', 'cancelled', 'completed'].includes(request.status)) {
        return res.status(400).json({ error: `Cannot advance stage while ticket is in '${request.status}' status` });
      }

      const shop = getStmt('SELECT id, name FROM shops WHERE user_id = ?').get(req.user.id);
      if (!shop && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only authorized repair shop technicians can advance bench stages' });
      }

      const acceptedQuote = getStmt('SELECT shop_id FROM quotes WHERE id = ?').get(request.accepted_quote_id);
      if (req.user.role !== 'admin' && (!acceptedQuote || acceptedQuote.shop_id !== shop.id)) {
        return res.status(403).json({ error: 'Access denied: Your workshop is not assigned to this ticket' });
      }

      const currentIndex = STAGE_ORDER.indexOf(request.status);
      if (currentIndex === -1) {
        return res.status(400).json({ error: `Cannot advance repair stage from status '${request.status}'` });
      }

      const targetIndex = STAGE_ORDER.indexOf(status);
      if (targetIndex === -1) {
        return res.status(400).json({ error: `Invalid bench stage. Must be one of: ${STAGE_ORDER.slice(1).join(', ')}` });
      }

      if (targetIndex !== currentIndex + 1) {
        return res.status(400).json({
          error: `Invalid stage progression. Current stage is '${request.status}' and next stage must be '${STAGE_ORDER[currentIndex + 1]}'`
        });
      }

      runTransaction(() => {
        const updateResult = getStmt(`
          UPDATE repair_requests 
          SET status = ?, updated_at = datetime('now') 
          WHERE id = ? AND status = ?
        `).run(status, requestId, request.status);

        if (updateResult.changes === 0) {
          throw new OperationalError(409, 'Repair request status changed concurrently');
        }

        getStmt(`
          INSERT INTO timeline_events (
            id, request_id, status, title, description, technician_notes, photo_proof, completed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          `t-${Date.now()}-${status}`,
          requestId,
          status,
          `Bench Update: ${status.replace(/_/g, ' ').toUpperCase()}`,
          STAGE_DESCRIPTIONS[status] || 'Bench work updated.',
          technicianNotes || null,
          photoProof || null
        );

        getStmt(`
          INSERT INTO notifications (id, user_id, title, message, link_url)
          VALUES (?, ?, 'Repair Stage Updated', ?, ?)
        `).run(
          `notif-${Date.now()}-${status}`,
          request.customer_id,
          `Your ${request.deviceBrand} ${request.deviceModel} is now in stage: ${status.replace(/_/g, ' ')}.`,
          `/requests/${requestId}`
        );

        logAudit(req.user.id, 'stage_advanced', 'repair_requests', requestId, {
          from_status: request.status,
          to_status: status
        });
      });

      const updated = getStmt('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
      res.json(updated);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Error advancing bench stage:', err);
      res.status(500).json({ error: 'Failed to advance bench stage' });
    }
  },

  // Submits the workshop's formal defense statement to a customer dispute
  respondToDispute: (req, res) => {
    try {
      const disputeId = req.params.id;
      const { shopStatement } = req.body;

      if (!shopStatement || !shopStatement.trim()) {
        return res.status(400).json({ error: 'Shop defense statement is required' });
      }

      const dispute = getStmt(`
        SELECT d.*, r.id as request_id, e.shop_id 
        FROM disputes d 
        JOIN escrow_ledger e ON e.id = d.escrow_id 
        JOIN repair_requests r ON r.id = d.request_id 
        WHERE d.id = ?
      `).get(disputeId);

      if (!dispute) {
        return res.status(404).json({ error: 'Dispute record not found' });
      }

      if (dispute.resolution !== 'pending') {
        return res.status(400).json({ error: 'Cannot submit a response to an already resolved dispute' });
      }

      const shop = getStmt('SELECT id FROM shops WHERE user_id = ?').get(req.user.id);
      if (req.user.role !== 'admin' && (!shop || dispute.shop_id !== shop.id)) {
        return res.status(403).json({ error: 'Unauthorized to respond to this dispute' });
      }

      const updateResult = getStmt(`
        UPDATE disputes 
        SET shop_statement = ? 
        WHERE id = ? AND resolution = 'pending'
      `).run(shopStatement.trim(), disputeId);

      if (updateResult.changes === 0) {
        return res.status(409).json({ error: 'Dispute is no longer pending' });
      }

      getStmt(`
        INSERT INTO timeline_events (id, request_id, status, title, description, completed)
        VALUES (?, ?, 'disputed', 'Workshop Defense Statement Submitted', 'Technician provided counter-evidence for operator review.', 1)
      `).run(`t-${Date.now()}-disp-resp`, dispute.request_id);

      logAudit(req.user.id, 'dispute_response_submitted', 'disputes', disputeId, { request_id: dispute.request_id });

      res.json({ success: true, message: 'Defense statement submitted to dispute arbitration desk.' });
    } catch (err) {
      console.error('Error responding to dispute:', err);
      res.status(500).json({ error: 'Failed to submit dispute statement' });
    }
  },

  // Lists all warranty claims filed against this workshop
  getWarrantyClaims: (req, res) => {
    try {
      const shop = getStmt('SELECT id FROM shops WHERE user_id = ?').get(req.user.id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop profile not found' });
      }

      const claims = getStmt(`
        SELECT w.*, r.device_brand, r.device_model, u.name as customer_name
        FROM warranty_claims w
        JOIN repair_requests r ON r.id = w.request_id
        JOIN users u ON u.id = w.customer_id
        WHERE w.shop_id = ?
        ORDER BY w.created_at DESC
      `).all(shop.id);

      res.json(claims);
    } catch (err) {
      console.error('Error fetching warranty claims:', err);
      res.status(500).json({ error: 'Failed to fetch warranty claims' });
    }
  },

  // Updates status and response notes on an existing warranty claim
  updateWarrantyClaim: (req, res) => {
    try {
      const claimId = req.params.id;
      const { status, shopResponse } = req.body;

      const claim = getStmt('SELECT * FROM warranty_claims WHERE id = ?').get(claimId);
      if (!claim) {
        return res.status(404).json({ error: 'Warranty claim not found' });
      }

      const shop = getStmt('SELECT id, name FROM shops WHERE user_id = ?').get(req.user.id);
      if (req.user.role !== 'admin' && (!shop || claim.shop_id !== shop.id)) {
        return res.status(403).json({ error: 'Unauthorized to update this warranty claim' });
      }

      const validStatuses = ['under_review', 'repair_scheduled', 'resolved', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid warranty status. Must be one of: ${validStatuses.join(', ')}` });
      }

      const isFinal = status === 'resolved' || status === 'rejected';

      runTransaction(() => {
        getStmt(`
          UPDATE warranty_claims
          SET status = ?, shop_response = COALESCE(?, shop_response),
              resolved_at = CASE WHEN ? = 1 THEN datetime('now') ELSE resolved_at END
          WHERE id = ?
        `).run(status, shopResponse || null, isFinal ? 1 : 0, claimId);

        getStmt(`
          INSERT INTO notifications (id, user_id, title, message, link_url)
          VALUES (?, ?, 'Warranty Claim Updated', ?, ?)
        `).run(
          `notif-${Date.now()}-wupd`,
          claim.customer_id,
          `Your warranty claim status was updated to: ${status.replace(/_/g, ' ')}.`,
          `/requests/${claim.request_id}`
        );

        logAudit(req.user.id, 'warranty_claim_updated', 'warranty_claims', claimId, {
          shop_id: claim.shop_id,
          from_status: claim.status,
          to_status: status
        });
      });

      const updated = getStmt('SELECT * FROM warranty_claims WHERE id = ?').get(claimId);
      res.json(updated);
    } catch (err) {
      console.error('Error updating warranty claim:', err);
      res.status(500).json({ error: 'Failed to update warranty claim' });
    }
  },
};
