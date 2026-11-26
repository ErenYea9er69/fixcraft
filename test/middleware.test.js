import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireRole } from '../server/middleware/rbac.js';
import { requireRequestOwnership, requireTicketParticipant } from '../server/middleware/ownership.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('RBAC & Ownership Guards', () => {
  before(() => {
    initDatabase();
  });

  after(() => {
    closeDatabase();
    const dbPath = process.env.DB_PATH;
    if (dbPath && dbPath.includes('test-fixcraft')) {
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
      try { if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`); } catch {}
      try { if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`); } catch {}
    }
  });

  test('requireRole rejects unauthorized roles with 403', () => {
    let statusSent = 0;
    let jsonSent = null;
    const req = { user: { role: 'customer' } };
    const res = { status: (code) => { statusSent = code; return { json: (d) => { jsonSent = d; } }; } };
    const next = () => { statusSent = 200; };

    requireRole('admin')(req, res, next);
    assert.equal(statusSent, 403, 'Should reject customer from admin route');
    assert.ok(jsonSent.error);

    requireRole('customer', 'admin')(req, res, next);
    assert.equal(statusSent, 200, 'Should allow customer when listed');
  });

  test('requireTicketParticipant blocks outsiders from ticket thread', () => {
    let statusSent = 0;
    const req = {
      params: { requestId: 'req-2' },
      user: { id: 'outsider-user', role: 'customer' }
    };
    const res = { status: (code) => { statusSent = code; return { json: () => {} }; } };
    const next = () => { statusSent = 200; };

    requireTicketParticipant(req, res, next);
    assert.equal(statusSent, 403, 'Outsider must be blocked from ticket');
  });

  test('requireTicketParticipant allows ticket customer and assigned shop', () => {
    let customerAllowed = false;
    let shopAllowed = false;

    // Customer
    const reqCust = { params: { requestId: 'req-2' }, user: { id: 'user-alex', role: 'customer' } };
    const res = { status: () => ({ json: () => {} }) };
    requireTicketParticipant(reqCust, res, () => { customerAllowed = true; });
    assert.ok(customerAllowed, 'Customer should be allowed');

    // Assigned shop (shop-1 belongs to user-apex)
    const reqShop = { params: { requestId: 'req-2' }, user: { id: 'user-apex', role: 'shop' } };
    requireTicketParticipant(reqShop, res, () => { shopAllowed = true; });
    assert.ok(shopAllowed, 'Assigned workshop technician should be allowed');
  });
});

