import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrations/runner.js';
import { seedDevDatabase } from './seeds/devSeed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', 'fixcraft.db');
const db = new Database(DB_PATH);

// Configure WAL mode and SQLite performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');
db.pragma('temp_store = MEMORY');

// Executes database operations within an atomic SQLite transaction
export function runTransaction(fn) {
  return db.transaction(fn)();
}

// Safely closes the database connection on server shutdown
export function closeDatabase() {
  if (db && db.open) {
    db.close();
  }
}

// Runs pending schema migrations and seeds development data if empty
export function initDatabase() {
  runMigrations(db);

  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    seedDevDatabase(db);
  }
}

export default db;
