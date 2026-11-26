import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import authRoutes from '../server/routes/auth.js';
import { signToken, validateJwtSecret } from '../server/middleware/auth.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('Auth & User Account Management', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);

  after(() => {
    closeDatabase();
    const dbPath = process.env.DB_PATH;
    if (dbPath && dbPath.includes('test-fixcraft')) {
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
      try { if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`); } catch {}
      try { if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`); } catch {}
    }
  });

  before(() => {
    initDatabase();
    db.prepare("DELETE FROM users WHERE email LIKE '%@test.local'").run();
  });

  test('POST /api/auth/register rejects malformed emails with 400', async () => {
    const badEmails = ['plainaddress', '@missingusername.com', 'user@.com', 'user@domain..com', ''];
    for (const badEmail of badEmails) {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Bad Email User',
        email: badEmail,
        password: 'Password123',
        role: 'customer'
      });
      assert.equal(res.status, 400, `Expected 400 for bad email: "${badEmail}"`);
    }
  });

  test('POST /api/auth/register rejects weak passwords with 400', async () => {
    const weakPasswords = [
      'short',
      'alllowercase1',
      'ALLUPPERCASE1',
      'NoDigitsHere!',
      'a'.repeat(129),
    ];
    for (const weak of weakPasswords) {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Weak Password User',
        email: `weak-${Date.now()}@test.local`,
        password: weak,
        role: 'customer'
      });
      assert.equal(res.status, 400, `Expected 400 for weak password: "${weak}"`);
    }
  });

  test('POST /api/auth/register rejects non-string input types defensively with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 12345,
      email: { evil: 'object' },
      password: null,
      role: ['customer']
    });
    assert.equal(res.status, 400);
  });

  test('POST /api/auth/register succeeds with valid payload and strong password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test Customer',
      email: 'newcustomer@test.local',
      password: 'SecurePassword123',
      role: 'customer',
      phone: '1234567890'
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'newcustomer@test.local');
    assert.ok(res.body.settings);
  });

  test('POST /api/auth/register returns 409 for duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Duplicate Customer',
      email: 'newcustomer@test.local',
      password: 'SecurePassword123',
      role: 'customer'
    });
    assert.equal(res.status, 409);
  });

  test('POST /api/auth/login validates credentials and returns token', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'newcustomer@test.local',
      password: 'SecurePassword123'
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'newcustomer@test.local');
  });

  test('POST /api/auth/login rejects incorrect password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'newcustomer@test.local',
      password: 'WrongPassword999'
    });
    assert.equal(res.status, 401);
  });

  test('POST /api/auth/change-password enforces complexity on new password', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'newcustomer@test.local',
      password: 'SecurePassword123'
    });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'SecurePassword123', newPassword: 'weak' });
    assert.equal(res.status, 400);
  });

  test('POST /api/auth/change-password revokes old token immediately', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'newcustomer@test.local',
      password: 'SecurePassword123'
    });
    const oldToken = loginRes.body.token;

    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ oldPassword: 'SecurePassword123', newPassword: 'NewSecurePass456' });
    assert.equal(changeRes.status, 200);

    const revokedRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    assert.equal(revokedRes.status, 401);
    assert.match(revokedRes.body.error, /(expired or revoked|invalid)/i);

    const failLogin = await request(app).post('/api/auth/login').send({
      email: 'newcustomer@test.local',
      password: 'SecurePassword123'
    });
    assert.equal(failLogin.status, 401);

    const newLogin = await request(app).post('/api/auth/login').send({
      email: 'newcustomer@test.local',
      password: 'NewSecurePass456'
    });
    assert.equal(newLogin.status, 200);
    const newToken = newLogin.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newToken}`);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.email, 'newcustomer@test.local');
  });

  test('suspended user (is_active = 0) returns 401 on authenticated endpoint', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'newcustomer@test.local',
      password: 'NewSecurePass456'
    });
    const token = loginRes.body.token;

    db.prepare("UPDATE users SET is_active = 0 WHERE email = 'newcustomer@test.local'").run();

    const authRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(authRes.status, 401);
    assert.match(authRes.body.error, /deactivated/i);

    db.prepare("UPDATE users SET is_active = 1 WHERE email = 'newcustomer@test.local'").run();
  });

  test('GET /api/auth/demo-accounts returns 404 in production mode and exactly 5 designated demo accounts in dev', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      const devRes = await request(app).get('/api/auth/demo-accounts');
      assert.equal(devRes.status, 200);
      assert.ok(Array.isArray(devRes.body));
      assert.equal(devRes.body.length, 5);
      
      const roles = devRes.body.map(u => u.role);
      assert.equal(roles.filter(r => r === 'admin').length, 1);
      assert.equal(roles.filter(r => r === 'customer').length, 2);
      assert.equal(roles.filter(r => r === 'shop').length, 2);

      const emails = devRes.body.map(u => u.email);
      assert.deepEqual(emails, [
        'admin@fixcraft.local',
        'alex@example.com',
        'sarah@example.com',
        'apex@fixcraft.local',
        'urban@fixcraft.local',
      ]);

      process.env.NODE_ENV = 'production';
      const prodRes = await request(app).get('/api/auth/demo-accounts');
      assert.equal(prodRes.status, 404);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  test('validateJwtSecret enforces >=32 char secret and rejects default fallback in production', () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';

      delete process.env.JWT_SECRET;
      assert.throws(() => {
        validateJwtSecret();
      }, /JWT_SECRET must be set and be at least 32 characters/);

      process.env.JWT_SECRET = 'too-short';
      assert.throws(() => {
        validateJwtSecret();
      }, /JWT_SECRET must be set and be at least 32 characters/);

      process.env.JWT_SECRET = 'fixcraft_local_jwt_secret_key_2026';
      assert.throws(() => {
        validateJwtSecret();
      }, /cannot be the default fallback key/);

      process.env.JWT_SECRET = 'a_very_secure_and_sufficiently_long_production_key_2026!';
      const validated = validateJwtSecret();
      assert.equal(validated, 'a_very_secure_and_sufficiently_long_production_key_2026!');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) {
        process.env.JWT_SECRET = origSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
    }
  });

  test('PATCH /api/auth/profile updates profile and user_settings', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'newcustomer@test.local',
      password: 'NewSecurePass456'
    });
    const token = loginRes.body.token;

    const updateRes = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Updated Name',
        defaultAddress: '999 Tech Blvd',
        defaultCity: 'San Jose, CA'
      });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.user.name, 'Updated Name');
    assert.equal(updateRes.body.settings.default_address, '999 Tech Blvd');
  });
});
