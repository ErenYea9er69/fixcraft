import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import db, { initDatabase, closeDatabase } from './db.js';
import { checkPostgresHealth, closePostgresPool } from './utils/pgHealth.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/client.js';
import shopRoutes from './routes/shop.js';
import adminRoutes from './routes/admin.js';
import sharedRoutes from './routes/shared.js';
import uploadRoutes from './routes/upload.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '..', 'uploads');
const publicDir = path.resolve(__dirname, '..', 'public');
const distDir = path.resolve(__dirname, '..', 'dist');

// Initialize database schema, constraints, and dev seed data
initDatabase();

const app = express();

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// Security headers with cross-origin resource policy
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Generates or passes through unique correlation ID for request tracing
app.use((req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const id = (typeof incomingId === 'string' && incomingId.trim()) ? incomingId.trim() : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// Enforces CORS whitelist matching allowed front-end origins
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const corsError = new Error(`Origin ${origin} not allowed by CORS`);
    corsError.status = 403;
    return callback(corsError);
  },
  credentials: true,
};
app.use(cors(corsOptions));

const shouldSkipRateLimit = () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT !== 'true';

// General rate limiter: max 100 requests per 15 minutes
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
  skip: shouldSkipRateLimit,
});

// Authentication rate limiter: max 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts, please try again later.',
  },
  skip: shouldSkipRateLimit,
});

app.use('/api', generalApiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serves uploaded static files with nosniff and sandbox headers
app.use('/uploads', express.static(uploadsDir, {
  dotfiles: 'ignore',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  },
}));
app.use(express.static(publicDir));

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.resolve(publicDir, 'favicon.ico'));
});

app.get('/api/client.ts', (req, res) => {
  res.redirect(302, '/services/client.ts');
});

// Mount domain routes
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shared', sharedRoutes);
app.use('/api/upload', uploadRoutes);

// Server status endpoint (or built SPA in production)
if (config.nodeEnv === 'production' && fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
}

app.get('/', (req, res, next) => {
  if (config.nodeEnv === 'production' && fs.existsSync(path.join(distDir, 'index.html'))) {
    return res.sendFile(path.join(distDir, 'index.html'));
  }
  return res.json({
    service: 'FixCraft SQLite API Server',
    status: 'online',
    frontend: 'http://localhost:3000',
    documentation: '/api/health',
  });
});

// Shared health check handler validating SQLite and optional PostgreSQL connectivity
async function healthHandler(req, res) {
  const version = process.env.APP_VERSION || '1.0.0';
  let sqliteStatus = 'disconnected';
  let postgresStatus = 'not_configured';

  try {
    db.prepare('SELECT 1').get();
    sqliteStatus = 'connected';
  } catch (err) {
    return res.status(503).json({
      status: 'degraded',
      version,
      database: 'disconnected',
      postgres: postgresStatus,
    });
  }

  try {
    postgresStatus = await checkPostgresHealth();
  } catch (err) {
    return res.status(503).json({
      status: 'degraded',
      version,
      database: sqliteStatus,
      postgres: 'disconnected',
    });
  }

  return res.status(200).json({
    status: 'ok',
    version,
    uptime: process.uptime(),
    database: sqliteStatus,
    postgres: postgresStatus,
    timestamp: new Date().toISOString(),
  });
}

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Centralized error handler returning JSON errors with correlation IDs
app.use((err, req, res, next) => {
  const requestId = req.id || crypto.randomUUID();
  const timestamp = new Date().toISOString();

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Malformed JSON payload in request body',
      requestId,
      timestamp,
    });
  }

  if (err.status === 403 || (err.message && err.message.toLowerCase().includes('cors'))) {
    return res.status(403).json({
      error: err.message || 'Origin not allowed by CORS',
      requestId,
      timestamp,
    });
  }

  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large: request body exceeds 1mb limit',
      requestId,
      timestamp,
    });
  }

  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({
      error: err.message,
      requestId,
      timestamp,
    });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: err.message,
      requestId,
      timestamp,
    });
  }

  const status = err.status && typeof err.status === 'number' && err.status >= 400 ? err.status : 500;
  if (status >= 500) {
    console.error('Unhandled server error:', err);
  }

  return res.status(status).json({
    error: err.message || 'Internal server error',
    requestId,
    timestamp,
  });
});

let isShuttingDown = false;

// Gracefully halts background tasks, HTTP connections, and closes SQLite
export function gracefulShutdown(server, signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  try {
    stopScheduler();
  } catch (schedErr) {
    console.error('Error stopping scheduler:', schedErr);
  }

  const finishShutdown = (exitCode) => {
    try {
      closeDatabase();
      console.log('Database connection closed.');
    } catch (dbErr) {
      console.error('Error closing database:', dbErr);
    }
    closePostgresPool().catch((pgErr) => {
      console.error('Error closing PostgreSQL pool:', pgErr);
    });
    if (process.env.NODE_ENV !== 'test') {
      process.exit(exitCode);
    }
  };

  if (server && typeof server.close === 'function') {
    server.close((err) => {
      if (err) {
        console.error('Error closing HTTP server:', err);
        finishShutdown(1);
      } else {
        console.log('HTTP server closed successfully.');
        finishShutdown(0);
      }
    });
  } else {
    finishShutdown(0);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const server = app.listen(config.port, () => {
    console.log(`FixCraft SQLite API Server running at http://localhost:${config.port}`);
    console.log(`Uploads serving at http://localhost:${config.port}/uploads`);
    if (process.env.NODE_ENV !== 'test' || process.env.ENABLE_SCHEDULER === 'true') {
      startScheduler();
      console.log('Background lifecycle scheduler started.');
    }
  });

  process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    gracefulShutdown(server, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    gracefulShutdown(server, 'uncaughtException');
  });
}

export default app;
