import express from 'express';
import { adminController } from '../controllers/adminController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('admin'));

// Returns aggregate platform statistics and escrow financial metrics
router.get('/metrics', adminController.getMetrics);
// Lists all registered user accounts with activity and token states
router.get('/users', adminController.getUsers);
// Suspends or activates a user account and bumps token version on suspension
router.patch('/users/:id/status', adminController.setUserStatus);
// Lists unverified repair shops awaiting admin accreditation
router.get('/shops/pending', adminController.getPendingShops);
// Updates workshop verification status and notifies the owner
router.patch('/shops/:id/verify', adminController.verifyShop);
// Returns the full audit ledger of escrow transactions
router.get('/escrow', adminController.getEscrowLedger);
// Lists all pending and historical dispute cases
router.get('/disputes', adminController.getDisputes);
// Arbitrates dispute by releasing escrow, refunding, or splitting payout
router.post('/disputes/:id/resolve', adminController.resolveDispute);
// Returns recent administrative security and operation audit logs
router.get('/audit-logs', adminController.getAuditLogs);

export default router;
