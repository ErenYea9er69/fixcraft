import bcrypt from 'bcryptjs';
import db, { runTransaction } from '../db.js';
import { signToken } from '../middleware/auth.js';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Validates email address format and length constraints
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

// Enforces password strength requiring uppercase, lowercase, digit, and 8-128 chars
export function isValidPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8 || password.length > 128) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  return hasUpper && hasLower && hasDigit;
}

export const authController = {
  // Registers new customer or workshop account with hashed credentials and profile setup
  register: async (req, res) => {
    try {
      const { name, email, password, role, phone, shopName, address, city, specialties } = req.body;

      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Valid email address is required' });
      }

      if (!isValidPassword(password)) {
        return res.status(400).json({
          error: 'Password must be between 8 and 128 characters, and contain at least one uppercase letter, one lowercase letter, and one number',
        });
      }

      if (typeof role !== 'string' || !['customer', 'shop'].includes(role)) {
        return res.status(400).json({ error: 'Role must be customer or shop' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const userId = `user-${Date.now().toString(36)}`;
      const passwordHash = await bcrypt.hash(password, 10);
      const defaultAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80';

      let shopData = null;

      runTransaction(() => {
        // Insert user record with active flag and default token version
        db.prepare(`
          INSERT INTO users (id, name, email, password_hash, role, avatar, phone, is_active, token_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
        `).run(userId, name.trim(), normalizedEmail, passwordHash, role, defaultAvatar, typeof phone === 'string' ? phone.trim() : null);

        // Initialize user preferences
        db.prepare(`
          INSERT INTO user_settings (user_id, default_address, default_city)
          VALUES (?, ?, ?)
        `).run(userId, typeof address === 'string' ? address.trim() : null, typeof city === 'string' ? city.trim() : null);

        // Provision shop profile if role is shop
        if (role === 'shop') {
          const shopId = `shop-${Date.now().toString(36)}`;
          const shopSpecialties = Array.isArray(specialties) && specialties.length > 0 
            ? specialties 
            : ['phone', 'laptop'];

          db.prepare(`
            INSERT INTO shops (
              id, user_id, name, tagline, logo, banner_image, address, city,
              phone, email, verified, specialties, rating, review_count, completed_repairs_count,
              turnaround_avg, warranty_standard, description, certifications, active_tech_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            shopId,
            userId,
            typeof shopName === 'string' && shopName.trim() ? shopName.trim() : `${name.trim()}'s Workshop`,
            'Precision diagnostics & hardware restorations',
            'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=200&h=200&q=80',
            'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&h=400&q=80',
            typeof address === 'string' && address.trim() ? address.trim() : '100 Local Workshop Way',
            typeof city === 'string' && city.trim() ? city.trim() : 'San Francisco, CA',
            typeof phone === 'string' && phone.trim() ? phone.trim() : '(415) 555-0199',
            normalizedEmail,
            0,
            JSON.stringify(shopSpecialties),
            5.0,
            0,
            0,
            '24-48 hours',
            '90 Days Minimum Warranty',
            'Certified repair facility equipped with micro-probing and schematic diagnostic stations.',
            JSON.stringify(['Local Verified Technician']),
            1
          );

          shopData = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);
          shopData.specialties = JSON.parse(shopData.specialties || '[]');
          shopData.certifications = JSON.parse(shopData.certifications || '[]');
        }
      });

      const newUser = db.prepare('SELECT id, name, email, role, avatar, phone, is_active, token_version, created_at FROM users WHERE id = ?').get(userId);
      const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
      const token = signToken(newUser);

      res.status(201).json({
        token,
        user: newUser,
        settings,
        shop: shopData,
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Failed to register account' });
    }
  },

  // Authenticates login credentials and generates JWT token session
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
      if (!user || !user.is_active) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      let shopData = null;
      if (user.role === 'shop') {
        shopData = db.prepare('SELECT * FROM shops WHERE user_id = ?').get(user.id);
        if (shopData) {
          shopData.specialties = JSON.parse(shopData.specialties || '[]');
          shopData.certifications = JSON.parse(shopData.certifications || '[]');
        }
      }

      const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(user.id);
      const cleanUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
        token_version: user.token_version || 1,
        created_at: user.created_at,
      };

      const token = signToken(cleanUser);

      res.json({
        token,
        user: cleanUser,
        settings,
        shop: shopData,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Failed to log in' });
    }
  },

  // Retrieves authenticated user session profile, settings, and shop data
  getMe: (req, res) => {
    try {
      const user = db.prepare('SELECT id, name, email, role, avatar, phone, is_active, token_version, created_at FROM users WHERE id = ?').get(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let shopData = null;
      if (user.role === 'shop') {
        shopData = db.prepare('SELECT * FROM shops WHERE user_id = ?').get(user.id);
        if (shopData) {
          shopData.specialties = JSON.parse(shopData.specialties || '[]');
          shopData.certifications = JSON.parse(shopData.certifications || '[]');
        }
      }

      const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(user.id);

      res.json({
        user,
        settings,
        shop: shopData,
      });
    } catch (err) {
      console.error('Get me error:', err);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  },

  // Updates profile fields and notification preferences for current user
  updateProfile: (req, res) => {
    try {
      const { name, phone, avatar, defaultAddress, defaultCity, themePreference, notifyEmail, notifySms } = req.body;

      runTransaction(() => {
        if (name || phone || avatar) {
          const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
          db.prepare(`
            UPDATE users
            SET name = ?, phone = ?, avatar = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(
            name !== undefined ? name : user.name,
            phone !== undefined ? phone : user.phone,
            avatar !== undefined ? avatar : user.avatar,
            req.user.id
          );
        }

        const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
        if (!settings) {
          db.prepare(`
            INSERT INTO user_settings (user_id, default_address, default_city, theme_preference, notify_email, notify_sms)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            req.user.id,
            defaultAddress || null,
            defaultCity || null,
            themePreference || 'light',
            notifyEmail !== undefined ? (notifyEmail ? 1 : 0) : 1,
            notifySms !== undefined ? (notifySms ? 1 : 0) : 0
          );
        } else {
          db.prepare(`
            UPDATE user_settings
            SET default_address = ?, default_city = ?, theme_preference = ?, notify_email = ?, notify_sms = ?, updated_at = datetime('now')
            WHERE user_id = ?
          `).run(
            defaultAddress !== undefined ? defaultAddress : settings.default_address,
            defaultCity !== undefined ? defaultCity : settings.default_city,
            themePreference !== undefined ? themePreference : settings.theme_preference,
            notifyEmail !== undefined ? (notifyEmail ? 1 : 0) : settings.notify_email,
            notifySms !== undefined ? (notifySms ? 1 : 0) : settings.notify_sms,
            req.user.id
          );
        }
      });

      const updatedUser = db.prepare('SELECT id, name, email, role, avatar, phone, is_active, token_version, created_at FROM users WHERE id = ?').get(req.user.id);
      const updatedSettings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);

      res.json({
        user: updatedUser,
        settings: updatedSettings,
      });
    } catch (err) {
      console.error('Update profile error:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  },

  // Validates current password, updates to new password, and bumps token version for session revocation
  changePassword: async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      if (typeof oldPassword !== 'string' || typeof newPassword !== 'string' || !oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Old password and new password are required' });
      }

      if (!isValidPassword(newPassword)) {
        return res.status(400).json({
          error: 'New password must be between 8 and 128 characters, and contain at least one uppercase letter, one lowercase letter, and one number',
        });
      }

      const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const match = await bcrypt.compare(oldPassword, user.password_hash);
      if (!match) {
        return res.status(400).json({ error: 'Incorrect existing password' });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?").run(newHash, req.user.id);

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Failed to change password' });
    }
  },

  // Returns recent notifications for the authenticated user
  getNotifications: (req, res) => {
    try {
      const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
      res.json(notifs.map(n => ({ ...n, isRead: Boolean(n.is_read) })));
    } catch (err) {
      console.error('Get notifications error:', err);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  },

  // Marks a single notification as read
  markNotificationRead: (req, res) => {
    try {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to mark notification read' });
    }
  },

  // Returns demo account credentials in development mode
  getDemoAccounts: (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not Found' });
      }

      const users = db.prepare(`
        SELECT u.id, u.name, u.email, u.role, u.avatar, s.id as shop_id, s.name as shop_name
        FROM users u
        LEFT JOIN shops s ON s.user_id = u.id
        WHERE u.email IN (
          'admin@fixcraft.local',
          'alex@example.com',
          'sarah@example.com',
          'apex@fixcraft.local',
          'urban@fixcraft.local'
        )
        ORDER BY 
          CASE u.role 
            WHEN 'admin' THEN 1 
            WHEN 'customer' THEN 2 
            WHEN 'shop' THEN 3 
            ELSE 4 
          END, 
          u.id ASC
      `).all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list demo accounts' });
    }
  },
};
