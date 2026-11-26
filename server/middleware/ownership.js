import db from '../db.js';

// Verifies the user is an admin or the customer owning the repair request
export function requireRequestOwnership(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const requestId = req.params.requestId || req.params.id;
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID parameter is missing' });
    }

    const request = db.prepare('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Repair request not found' });
    }

    if (req.user.role === 'admin' || request.customer_id === req.user.id) {
      req.repairRequest = request;
      return next();
    }

    return res.status(403).json({ error: 'Forbidden: You do not own this repair ticket' });
  } catch (err) {
    console.error('Error in requireRequestOwnership:', err);
    return res.status(500).json({ error: 'Failed to verify request ownership' });
  }
}

// Verifies the user is an admin or the workshop that authored the quote
export function requireQuoteOwnership(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const quoteId = req.params.quoteId || req.params.id;
    if (!quoteId) {
      return res.status(400).json({ error: 'Quote ID parameter is missing' });
    }

    const quote = db.prepare('SELECT q.*, s.user_id as shop_user_id FROM quotes q JOIN shops s ON s.id = q.shop_id WHERE q.id = ?').get(quoteId);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (req.user.role === 'admin' || quote.shop_user_id === req.user.id) {
      req.quote = quote;
      return next();
    }

    return res.status(403).json({ error: 'Forbidden: You do not own this quote' });
  } catch (err) {
    console.error('Error in requireQuoteOwnership:', err);
    return res.status(500).json({ error: 'Failed to verify quote ownership' });
  }
}

// Verifies user is an authorized participant (admin, ticket customer, or assigned/bidding workshop)
export function requireTicketParticipant(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const requestId = req.params.requestId || req.params.id;
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID parameter is missing' });
    }

    const request = db.prepare('SELECT * FROM repair_requests WHERE id = ?').get(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Repair request not found' });
    }

    // 1. Admin always allowed
    if (req.user.role === 'admin') {
      req.repairRequest = request;
      return next();
    }

    // 2. Ticket owner (Customer) allowed
    if (request.customer_id === req.user.id) {
      req.repairRequest = request;
      return next();
    }

    // 3. Assigned Shop, Bidding Shop, or Verified Workshop on open ticket
    if (req.user.role === 'shop') {
      const shop = db.prepare('SELECT id, verified FROM shops WHERE user_id = ?').get(req.user.id);
      if (shop) {
        // Verified shops can view open tickets to formulate quotes
        if (request.status === 'open' && Boolean(shop.verified)) {
          req.repairRequest = request;
          req.shop = shop;
          return next();
        }

        if (request.accepted_quote_id) {
          const acceptedQuote = db.prepare('SELECT shop_id FROM quotes WHERE id = ?').get(request.accepted_quote_id);
          if (acceptedQuote && acceptedQuote.shop_id === shop.id) {
            req.repairRequest = request;
            req.shop = shop;
            return next();
          }
        } else {
          const hasQuote = db.prepare('SELECT id FROM quotes WHERE request_id = ? AND shop_id = ?').get(requestId, shop.id);
          if (hasQuote) {
            req.repairRequest = request;
            req.shop = shop;
            return next();
          }
        }
      }
    }

    return res.status(403).json({ error: 'Access denied: You are not a participant in this repair ticket' });
  } catch (err) {
    console.error('Error in requireTicketParticipant:', err);
    return res.status(500).json({ error: 'Failed to verify ticket participant access' });
  }
}
