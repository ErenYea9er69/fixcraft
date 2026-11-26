import express from 'express';
import { shopController } from '../controllers/shopController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireQuoteOwnership } from '../middleware/ownership.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('shop', 'admin'));

// Retrieves the authenticated workshop's profile, ratings, and stats
router.get('/profile', shopController.getProfile);
// Updates workshop contact information, warranty terms, and specialties
router.patch('/profile', shopController.updateProfile);
// Retrieves open repair tickets matching the workshop's specialties
router.get('/inbound-requests', shopController.getInboundRequests);
// Lists active repairs assigned to this workshop's repair bench
router.get('/bench-repairs', shopController.getBenchRepairs);
// Submits a binding itemized repair quote with turnaround and warranty terms
router.post('/quotes', shopController.submitQuote);
// Withdraws a pending quote before customer acceptance
router.delete('/quotes/:id', requireQuoteOwnership, shopController.withdrawQuote);
// Advances the repair bench stage (e.g. diagnosing -> in_repair -> ready_for_pickup)
router.patch('/requests/:id/advance-stage', shopController.advanceRepairStage);
// Submits the workshop's formal defense statement to a customer dispute
router.post('/disputes/:id/respond', shopController.respondToDispute);
// Lists warranty claims lodged against this workshop
router.get('/warranty-claims', shopController.getWarrantyClaims);
// Updates status or technician notes on a warranty claim
router.patch('/warranty-claims/:id', shopController.updateWarrantyClaim);

export default router;
