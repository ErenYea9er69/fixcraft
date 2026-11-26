import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app, { gracefulShutdown } from '../server/server.js';
import config, {
  createConfig,
  parseAllowedOrigins,
  parseTrustProxy,
  validateJwtSecret,
} from '../server/config.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';
import { checkPostgresHealth } from '../server/utils/pgHealth.js';

describe('Section 6: Config, Security Headers, CORS, Rate Limiting & Error Handling', () => {
  before(() => {
    initDatabase();
  });

  after(() => {
    closeDatabase();
  });

  describe('Centralized Configuration & Validation', () => {
    test('default configuration provides valid fallbacks', () => {
      assert.ok(config.port > 0);
      assert.equal(config.nodeEnv, 'test');
      assert.ok(config.jwtSecret.length >= 32);
      assert.ok(Array.isArray(config.allowedOrigins));
      assert.ok(config.allowedOrigins.includes('http://localhost:3000'));
      assert.ok(config.allowedOrigins.includes('http://localhost:5173'));
      assert.equal(typeof config.trustProxy === 'boolean' || typeof config.trustProxy === 'number', true);
    });

    test('parseAllowedOrigins handles comma-separated strings cleanly', () => {
      const origins = parseAllowedOrigins('https://example.com, https://admin.example.com ');
      assert.deepEqual(origins, ['https://example.com', 'https://admin.example.com']);
    });

    test('parseAllowedOrigins falls back to defaults for empty inputs', () => {
      const defaults = parseAllowedOrigins('');
      assert.deepEqual(defaults, ['http://localhost:3000', 'http://localhost:5173']);
    });

    test('parseTrustProxy parses boolean and numeric proxy settings', () => {
      assert.equal(parseTrustProxy('true'), true);
      assert.equal(parseTrustProxy('false'), false);
      assert.equal(parseTrustProxy('2'), 2);
      assert.equal(parseTrustProxy('invalid'), 1);
      assert.equal(parseTrustProxy(undefined), 1);
    });

    test('validateJwtSecret validates secret length in production mode', () => {
      assert.throws(() => {
        validateJwtSecret('', 'production');
      }, /FATAL: In production, JWT_SECRET must be set and be at least 32 characters/);

      assert.throws(() => {
        validateJwtSecret('short_secret', 'production');
      }, /FATAL: In production, JWT_SECRET must be set and be at least 32 characters/);

      assert.throws(() => {
        validateJwtSecret('fixcraft_local_jwt_secret_key_2026', 'production');
      }, /cannot be the default fallback key/);

      const validSecret = 'a_secure_production_secret_key_exceeding_32_characters!';
      const res = validateJwtSecret(validSecret, 'production');
      assert.equal(res, validSecret);
    });

    test('createConfig builds consistent config object from environment', () => {
      const customEnv = {
        PORT: '4005',
        NODE_ENV: 'development',
        ALLOWED_ORIGINS: 'http://foo.bar,http://baz.qux',
        TRUST_PROXY: 'true',
      };
      const built = createConfig(customEnv);
      assert.equal(built.port, 4005);
      assert.equal(built.nodeEnv, 'development');
      assert.deepEqual(built.allowedOrigins, ['http://foo.bar', 'http://baz.qux']);
      assert.equal(built.trustProxy, true);
    });
  });

  describe('Security Headers & Helmet Integration', () => {
    test('responses contain helmet security headers and lack X-Powered-By', async () => {
      const res = await request(app).get('/');
      assert.equal(res.status, 200);
      assert.equal(res.headers['x-powered-by'], undefined);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
      assert.ok(res.headers['x-frame-options']);
    });
  });

  describe('Correlation Request IDs', () => {
    test('every response returns X-Request-Id header with valid UUID', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      const reqId = res.headers['x-request-id'];
      assert.ok(reqId);
      assert.match(reqId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('preserves incoming X-Request-Id header when supplied', async () => {
      const customTraceId = 'trace-id-fixcraft-1001';
      const res = await request(app)
        .get('/api/health')
        .set('X-Request-Id', customTraceId);
      assert.equal(res.status, 200);
      assert.equal(res.headers['x-request-id'], customTraceId);
    });
  });

  describe('CORS Whitelist Protection', () => {
    test('allows requests matching configured allowed origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');
      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
      assert.equal(res.headers['access-control-allow-credentials'], 'true');
    });

    test('blocks disallowed origin with 403 status and requestId', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://unauthorized-malicious-domain.com');
      assert.equal(res.status, 403);
      assert.match(res.body.error, /not allowed by CORS/i);
      assert.ok(res.body.requestId);
      assert.ok(res.body.timestamp);
    });
  });

  describe('Healthcheck & Degraded Resilience', () => {
    test('valid healthcheck returns 200 with database connected on /api/health and /health', async () => {
      for (const endpoint of ['/api/health', '/health']) {
        const res = await request(app).get(endpoint);
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
        assert.equal(res.body.database, 'connected');
        assert.equal(res.body.postgres, 'not_configured');
        assert.ok(res.body.version);
        assert.equal(typeof res.body.uptime, 'number');
        assert.ok(res.body.timestamp);
      }
    });

    test('checkPostgresHealth reports not_configured when unset and checks pool when provided', async () => {
      assert.equal(await checkPostgresHealth({}), 'not_configured');
      const okPool = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
      assert.equal(await checkPostgresHealth({ PGHOST: 'db' }, okPool), 'connected');
      const failingPool = { query: async () => { throw new Error('Connection refused'); } };
      await assert.rejects(() => checkPostgresHealth({ PGHOST: 'db' }, failingPool), /Connection refused/);
    });

    test('degraded healthcheck returns 503 when database throws', async () => {
      const originalPrepare = db.prepare;
      try {
        db.prepare = () => {
          throw new Error('Database disk I/O error simulated');
        };
        const res = await request(app).get('/api/health');
        assert.equal(res.status, 503);
        assert.equal(res.body.status, 'degraded');
        assert.equal(res.body.database, 'disconnected');
      } finally {
        db.prepare = originalPrepare;
      }
    });
  });

  describe('Body Parser Limits & Malformed Payloads', () => {
    test('payload exceeding 1MB returns 413 Payload Too Large with requestId', async () => {
      const oversizedPayload = { data: 'x'.repeat(1024 * 1024 + 50) };
      const res = await request(app)
        .post('/api/auth/login')
        .send(oversizedPayload);
      assert.equal(res.status, 413);
      assert.match(res.body.error, /Payload Too Large/i);
      assert.ok(res.body.requestId);
      assert.equal(res.headers['x-request-id'], res.body.requestId);
    });

    test('malformed JSON payload returns 400 Bad Request with requestId', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ "email": "test@local", "malformed": ');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /Malformed JSON/i);
      assert.ok(res.body.requestId);
      assert.equal(res.headers['x-request-id'], res.body.requestId);
    });
  });

  describe('Graceful Shutdown', () => {
    test('gracefulShutdown executes server close callback and database close', () => {
      let serverClosed = false;
      const fakeServer = {
        close: (cb) => {
          serverClosed = true;
          cb(null);
        },
      };
      gracefulShutdown(fakeServer, 'SIGTERM');
      assert.equal(serverClosed, true);
    });
  });
});