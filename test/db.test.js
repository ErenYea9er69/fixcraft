import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import db, { initDatabase, runTransaction, closeDatabase } from '../server/db.js';
import { getMigrationVersion } from '../server/migrations/runner.js';
import { seedDevDatabase } from '../server/seeds/devSeed.js';

describe('Database Schema & Integrity', () => {
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

  test('enforces foreign keys and creates all 13 core tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    const required = [
      'users', 'user_settings', 'shops', 'repair_requests',
      'timeline_events', 'quotes', 'escrow_ledger', 'reviews',
      'messages', 'disputes', 'warranty_claims', 'notifications', 'audit_logs'
    ];
    for (const table of required) {
      assert.ok(tables.includes(table), `Table ${table} should exist`);
    }
  });

  test('runTransaction commits valid operations and rolls back errors', () => {
    assert.throws(() => {
      runTransaction(() => {
        db.prepare("INSERT INTO notifications (id, user_id, title, message) VALUES ('test-notif', 'user-admin', 'T', 'M')").run();
        throw new Error('Simulated rollback');
      });
    });
    const found = db.prepare("SELECT * FROM notifications WHERE id = 'test-notif'").get();
    assert.equal(found, undefined, 'Rolled back record should not persist');
  });

  test('timestamps are stored as valid ISO strings, not relative text', () => {
    const user = db.prepare("SELECT created_at FROM users WHERE id = 'user-admin'").get();
    assert.ok(user, 'Admin user should be seeded');
    assert.ok(!isNaN(Date.parse(user.created_at)), `Timestamp ${user.created_at} must parse as valid ISO date`);
  });

  test('migration runner sets user_version to at least 2', () => {
    const version = getMigrationVersion(db);
    assert.ok(version >= 2, `user_version should be >= 2, got ${version}`);
  });

  test('tunes performance and safety pragmas on connection', () => {
    const busyTimeout = db.pragma('busy_timeout', { simple: true });
    assert.equal(busyTimeout, 5000);
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    assert.equal(foreignKeys, 1);
    const synchronous = db.pragma('synchronous', { simple: true });
    assert.equal(synchronous, 1);
    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.equal(journalMode.toLowerCase(), 'wal');
    const cacheSize = db.pragma('cache_size', { simple: true });
    assert.equal(cacheSize, -64000);
    const tempStore = db.pragma('temp_store', { simple: true });
    assert.equal(tempStore, 2); // 2 == MEMORY
  });

  test('rejects negative financial amounts via CHECK constraints', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO quotes (
          id, request_id, shop_id, parts_cost, labor_cost, total_cost,
          parts_quality, estimated_turnaround, status
        ) VALUES ('q-bad-neg', 'req-1', 'shop-1', -50, 10, -40, 'OEM Genuine', '1 day', 'pending')
      `).run();
    }, /CHECK constraint failed/);
  });

  test('rejects invalid timeline event statuses via CHECK constraints', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO timeline_events (id, request_id, status, title, description, completed)
        VALUES ('t-bad-status', 'req-1', 'invalid_bogus_status', 'Bad Title', 'Bad Desc', 1)
      `).run();
    }, /CHECK constraint failed/);
  });

  test('rejects invalid rating values and invalid JSON via CHECK constraints', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO reviews (
          id, request_id, shop_id, customer_id, rating, comment, device_repaired, repair_cost
        ) VALUES ('rev-bad-rating', 'req-1', 'shop-1', 'user-alex', 6, 'Over 5', 'iPhone', 100)
      `).run();
    }, /CHECK constraint failed/);

    assert.throws(() => {
      db.prepare(`
        INSERT INTO shops (
          id, user_id, name, address, city, phone, email, specialties
        ) VALUES ('shop-bad-json', 'user-alex', 'Bad Shop', '123 St', 'SF', '555', 'bad@shop.com', 'invalid-json{')
      `).run();
    }, /CHECK constraint failed/);
  });

  test('protects escrow records with ON DELETE RESTRICT on request deletion', () => {
    assert.throws(() => {
      db.prepare("DELETE FROM repair_requests WHERE id = 'req-2'").run();
    }, /(FOREIGN KEY constraint failed|constraint failed)/i);
  });

  test('nullifies accepted_quote_id on quote deletion via ON DELETE SET NULL', () => {
    const testReqId = `req-quote-del-${Date.now()}`;
    const testQuoteId = `q-to-del-${Date.now()}`;

    db.prepare(`
      INSERT INTO repair_requests (id, customer_id, device_category, device_brand, device_model, issue_category, issue_title, description, location)
      VALUES (?, 'user-alex', 'phone', 'Apple', 'iPhone', 'Screen', 'Title', 'Desc', 'SF')
    `).run(testReqId);

    db.prepare(`
      INSERT INTO quotes (id, request_id, shop_id, parts_cost, labor_cost, total_cost, parts_quality, estimated_turnaround)
      VALUES (?, ?, 'shop-1', 10, 10, 20, 'OEM Genuine', '1d')
    `).run(testQuoteId, testReqId);

    db.prepare("UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?").run(testQuoteId, testReqId);

    // Delete the quote
    db.prepare("DELETE FROM quotes WHERE id = ?").run(testQuoteId);

    const updatedReq = db.prepare("SELECT accepted_quote_id FROM repair_requests WHERE id = ?").get(testReqId);
    assert.equal(updatedReq.accepted_quote_id, null, 'accepted_quote_id should be SET NULL when quote is deleted');
  });

  test('refuses to execute devSeed in production environment', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      assert.throws(() => {
        seedDevDatabase(db);
      }, /Refusing to execute devSeed in production/i);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  test('creates all 14 comprehensive secondary indexes', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(i => i.name);
    const requiredIndexes = [
      'idx_repair_requests_customer',
      'idx_repair_requests_status',
      'idx_repair_requests_quote',
      'idx_quotes_request',
      'idx_quotes_shop',
      'idx_timeline_events_request',
      'idx_escrow_customer',
      'idx_escrow_shop',
      'idx_reviews_shop',
      'idx_messages_request',
      'idx_disputes_escrow',
      'idx_warranty_claims_shop',
      'idx_notifications_user',
      'idx_audit_logs_entity',
    ];
    for (const idx of requiredIndexes) {
      assert.ok(indexes.includes(idx), `Index ${idx} must exist`);
    }
  });
});
