import express from 'express';
import { sharedController } from '../controllers/sharedController.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireTicketParticipant } from '../middleware/ownership.js';

const router = express.Router();

// Public directory of verified repair shops with optional specialty filter
router.get('/shops', optionalAuth, sharedController.getShopsDirectory);
// Public profile and verified customer reviews for a specific workshop
router.get('/shops/:id', optionalAuth, sharedController.getShopPublicProfile);

// Retrieves full ticket details, timeline, quotes, and escrow status for participants
router.get('/requests/:requestId', authenticateToken, requireTicketParticipant, sharedController.getRequestDetail);
// Retrieves message conversation thread for a repair ticket
router.get('/requests/:requestId/messages', authenticateToken, requireTicketParticipant, sharedController.getTicketMessages);
// Sends a new message and attachments in the ticket conversation
router.post('/requests/:requestId/messages', authenticateToken, requireTicketParticipant, sharedController.sendTicketMessage);

export default router;
