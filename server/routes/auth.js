import express from 'express';
import { authController } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Registers a new customer or workshop account with hashed password
router.post('/register', authController.register);
// Authenticates credentials and returns a signed 30-day JWT token
router.post('/login', authController.login);
// Returns the authenticated user's current session profile and settings
router.get('/me', authenticateToken, authController.getMe);
// Updates user profile info, contact details, and preferences
router.patch('/profile', authenticateToken, authController.updateProfile);
// Validates old password, sets new password, and revokes prior tokens
router.post('/change-password', authenticateToken, authController.changePassword);
// Retrieves the 50 most recent notifications for the authenticated user
router.get('/notifications', authenticateToken, authController.getNotifications);
// Marks a specific notification as read
router.patch('/notifications/:id/read', authenticateToken, authController.markNotificationRead);
// Returns pre-seeded demo accounts in development mode
router.get('/demo-accounts', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not Found' });
  }
  return authController.getDemoAccounts(req, res, next);
});

export default router;
