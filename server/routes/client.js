import express from 'express';
import { clientController } from '../controllers/clientController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireRequestOwnership } from '../middleware/ownership.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('customer', 'admin'));

// Retrieves all repair requests submitted by the authenticated customer
router.get('/requests', clientController.getMyRequests);
// Creates a new hardware repair ticket and broadcasts to verified shops
router.post('/requests', clientController.createRequest);
// Cancels an open repair request before any quote is accepted
router.delete('/requests/:id', requireRequestOwnership, clientController.cancelRequest);
// Accepts a workshop quote, declines competing quotes, and locks funds in escrow
router.post('/quotes/:id/accept', clientController.acceptQuote);
// Confirms hardware pickup and releases escrow funds to the workshop
router.post('/requests/:id/confirm-handover', requireRequestOwnership, clientController.confirmHandover);
// Opens a customer dispute and freezes escrow funds pending admin review
router.post('/requests/:id/dispute', requireRequestOwnership, clientController.openDispute);
// Submits a customer review and rating for a completed repair
router.post('/requests/:id/review', requireRequestOwnership, clientController.submitReview);
router.post('/requests/:id/reviews', requireRequestOwnership, clientController.submitReview);
// Files a warranty claim against a completed repair within the warranty window
router.post('/warranty/claim', clientController.submitWarrantyClaim);
router.post('/warranty-claims', clientController.submitWarrantyClaim);

export default router;
