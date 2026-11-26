import jwt from 'jsonwebtoken';
import db from '../db.js';

const DEFAULT_FALLBACK_SECRET = 'fixcraft_local_jwt_secret_key_2026';

// Validates that JWT secret is secure in production
export function validateJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('FATAL: In production, JWT_SECRET must be set and be at least 32 characters long.');
    }
    if (secret === DEFAULT_FALLBACK_SECRET) {
      throw new Error('FATAL: In production, JWT_SECRET cannot be the default fallback key.');
    }
  }
  return secret || DEFAULT_FALLBACK_SECRET;
}

// Generates a 30-day signed JWT containing user credentials and token version
export function signToken(user) {
  const secret = validateJwtSecret();
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
      token_version: user.token_version || 1,
    },
    secret,
    { expiresIn: '30d' }
  );
}

// Middleware verifying bearer token, active user status, and token version freshness
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const secret = validateJwtSecret();
  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    try {
      const user = db.prepare('SELECT id, is_active, token_version FROM users WHERE id = ?').get(decoded.id);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      if (user.is_active === 0 || !user.is_active) {
        return res.status(401).json({ error: 'Account deactivated' });
      }
      const tokenVersion = decoded.token_version || 1;
      if (tokenVersion !== user.token_version) {
        return res.status(401).json({ error: 'Token expired or revoked' });
      }

      req.user = decoded;
      next();
    } catch (dbErr) {
      console.error('Error verifying user in authenticateToken:', dbErr);
      return res.status(500).json({ error: 'Failed to verify session' });
    }
  });
}

// Middleware populating req.user if a valid token is provided without rejecting guests
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  const secret = validateJwtSecret();
  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      req.user = null;
      return next();
    }
    try {
      const user = db.prepare('SELECT id, is_active, token_version FROM users WHERE id = ?').get(decoded.id);
      if (!user || !user.is_active || (decoded.token_version || 1) !== user.token_version) {
        req.user = null;
      } else {
        req.user = decoded;
      }
      next();
    } catch {
      req.user = null;
      next();
    }
  });
}
