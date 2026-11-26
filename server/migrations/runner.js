// Ordered list of versioned schema migrations
export const MIGRATIONS = [
  {
    version: 1,
    name: '001_constraints_and_foreign_keys',
    // Creates core database tables, foreign keys, and check constraints
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT CHECK(role IN ('customer', 'shop', 'admin')) NOT NULL,
          avatar TEXT,
          phone TEXT,
          is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
          token_version INTEGER DEFAULT 1 CHECK(token_version >= 1),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          notify_email INTEGER DEFAULT 1 CHECK(notify_email IN (0, 1)),
          notify_sms INTEGER DEFAULT 0 CHECK(notify_sms IN (0, 1)),
          theme_preference TEXT CHECK(theme_preference IN ('light', 'dark', 'system')) DEFAULT 'light',
          default_address TEXT,
          default_city TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS shops (
          id TEXT PRIMARY KEY,
          user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          tagline TEXT,
          logo TEXT,
          banner_image TEXT,
          address TEXT NOT NULL,
          city TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL,
          verified INTEGER DEFAULT 0 CHECK(verified IN (0, 1)),
          specialties TEXT NOT NULL CHECK(json_valid(specialties)),
          rating REAL DEFAULT 5.0 CHECK(rating >= 0 AND rating <= 5.0),
          review_count INTEGER DEFAULT 0 CHECK(review_count >= 0),
          completed_repairs_count INTEGER DEFAULT 0 CHECK(completed_repairs_count >= 0),
          turnaround_avg TEXT DEFAULT '24-48 hours',
          warranty_standard TEXT DEFAULT '90 Days Hassle-Free',
          description TEXT,
          certifications TEXT DEFAULT '[]' CHECK(json_valid(certifications)),
          active_tech_count INTEGER DEFAULT 1 CHECK(active_tech_count >= 0),
          operating_hours TEXT DEFAULT 'Mon-Fri: 9am - 6pm',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS repair_requests (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_category TEXT CHECK(device_category IN ('phone', 'laptop', 'appliance', 'audio', 'gaming', 'other')) NOT NULL,
          device_brand TEXT NOT NULL,
          device_model TEXT NOT NULL,
          serial_number TEXT,
          device_year TEXT,
          issue_category TEXT NOT NULL,
          issue_title TEXT NOT NULL,
          description TEXT NOT NULL,
          photos TEXT DEFAULT '[]' CHECK(json_valid(photos)),
          urgency TEXT CHECK(urgency IN ('urgent', 'standard', 'flexible')) NOT NULL DEFAULT 'standard',
          preferred_service TEXT CHECK(preferred_service IN ('dropoff', 'mailin', 'onsite')) NOT NULL DEFAULT 'dropoff',
          location TEXT NOT NULL,
          status TEXT CHECK(status IN (
            'open', 'quote_accepted', 'in_shop', 'diagnosing', 
            'in_repair', 'quality_check', 'ready_for_pickup', 
            'completed', 'disputed', 'cancelled'
          )) DEFAULT 'open',
          accepted_quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL,
          completed_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS timeline_events (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
          status TEXT CHECK(status IN (
            'open', 'quote_accepted', 'in_shop', 'diagnosing', 
            'in_repair', 'quality_check', 'ready_for_pickup', 
            'completed', 'disputed', 'cancelled'
          )) NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          technician_notes TEXT,
          photo_proof TEXT,
          completed INTEGER DEFAULT 1 CHECK(completed IN (0, 1)),
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS quotes (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
          shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          parts_cost REAL NOT NULL CHECK(parts_cost >= 0),
          labor_cost REAL NOT NULL CHECK(labor_cost >= 0),
          diagnostic_fee REAL DEFAULT 0 CHECK(diagnostic_fee >= 0),
          diagnostic_fee_waived INTEGER DEFAULT 1 CHECK(diagnostic_fee_waived IN (0, 1)),
          total_cost REAL NOT NULL CHECK(total_cost >= 0),
          parts_quality TEXT CHECK(parts_quality IN ('OEM Genuine', 'OEM Equivalent', 'Aftermarket High-Quality', 'Refurbished Original', 'Tier-1 Certified Aftermarket')) NOT NULL,
          estimated_turnaround TEXT NOT NULL,
          turnaround_days REAL DEFAULT 1 CHECK(turnaround_days >= 0),
          warranty_months INTEGER DEFAULT 3 CHECK(warranty_months >= 0),
          warranty_details TEXT,
          technician_notes TEXT,
          status TEXT CHECK(status IN ('pending', 'accepted', 'declined', 'withdrawn')) DEFAULT 'pending',
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS escrow_ledger (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL UNIQUE REFERENCES repair_requests(id) ON DELETE RESTRICT,
          customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
          subtotal REAL NOT NULL CHECK(subtotal >= 0),
          platform_fee REAL DEFAULT 0 CHECK(platform_fee >= 0),
          total_amount REAL NOT NULL CHECK(total_amount >= 0),
          customer_refund_amount REAL DEFAULT 0 CHECK(customer_refund_amount >= 0),
          shop_payout_amount REAL DEFAULT 0 CHECK(shop_payout_amount >= 0),
          status TEXT CHECK(status IN ('held_in_escrow', 'released_to_shop', 'refunded_to_customer', 'split_payout', 'disputed_frozen')) DEFAULT 'held_in_escrow',
          created_at TEXT DEFAULT (datetime('now')),
          released_at TEXT
        );

        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL UNIQUE REFERENCES repair_requests(id) ON DELETE CASCADE,
          shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rating INTEGER CHECK(rating BETWEEN 1 AND 5) NOT NULL,
          repair_speed_rating INTEGER CHECK(repair_speed_rating BETWEEN 1 AND 5) DEFAULT 5,
          communication_rating INTEGER CHECK(communication_rating BETWEEN 1 AND 5) DEFAULT 5,
          quality_rating INTEGER CHECK(quality_rating BETWEEN 1 AND 5) DEFAULT 5,
          comment TEXT NOT NULL,
          device_repaired TEXT NOT NULL,
          repair_cost REAL NOT NULL CHECK(repair_cost >= 0),
          tags TEXT DEFAULT '[]' CHECK(json_valid(tags)),
          verified_purchase INTEGER DEFAULT 1 CHECK(verified_purchase IN (0, 1)),
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
          sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          attachments TEXT DEFAULT '[]' CHECK(json_valid(attachments)),
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS disputes (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL UNIQUE REFERENCES repair_requests(id) ON DELETE CASCADE,
          escrow_id TEXT NOT NULL REFERENCES escrow_ledger(id) ON DELETE RESTRICT,
          opened_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          reason TEXT NOT NULL,
          customer_statement TEXT NOT NULL,
          shop_statement TEXT,
          admin_notes TEXT,
          resolution_customer_amount REAL DEFAULT 0 CHECK(resolution_customer_amount >= 0),
          resolution_shop_amount REAL DEFAULT 0 CHECK(resolution_shop_amount >= 0),
          resolution TEXT CHECK(resolution IN ('pending', 'refund_customer', 'release_to_shop', 'split_payout')) DEFAULT 'pending',
          created_at TEXT DEFAULT (datetime('now')),
          resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS warranty_claims (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
          shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
          customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          claim_issue TEXT NOT NULL,
          status TEXT CHECK(status IN ('submitted', 'under_review', 'repair_scheduled', 'resolved', 'rejected')) DEFAULT 'submitted',
          shop_response TEXT,
          warranty_expiry_date TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          link_url TEXT,
          is_read INTEGER DEFAULT 0 CHECK(is_read IN (0, 1)),
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          metadata TEXT DEFAULT '{}' CHECK(json_valid(metadata)),
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      const userCols = db.pragma('table_info(users)').map(c => c.name);
      if (!userCols.includes('token_version')) {
        db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1 CHECK(token_version >= 1)');
      }
    }
  },
  {
    version: 2,
    name: '002_secondary_indexes',
    // Adds secondary indices on frequent join and lookup columns
    up(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_repair_requests_customer ON repair_requests(customer_id);
        CREATE INDEX IF NOT EXISTS idx_repair_requests_status ON repair_requests(status);
        CREATE INDEX IF NOT EXISTS idx_repair_requests_quote ON repair_requests(accepted_quote_id);
        CREATE INDEX IF NOT EXISTS idx_quotes_request ON quotes(request_id);
        CREATE INDEX IF NOT EXISTS idx_quotes_shop ON quotes(shop_id);
        CREATE INDEX IF NOT EXISTS idx_timeline_events_request ON timeline_events(request_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_escrow_customer ON escrow_ledger(customer_id);
        CREATE INDEX IF NOT EXISTS idx_escrow_shop ON escrow_ledger(shop_id);
        CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id);
        CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_disputes_escrow ON disputes(escrow_id);
        CREATE INDEX IF NOT EXISTS idx_warranty_claims_shop ON warranty_claims(shop_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
      `);
    }
  },
  {
    version: 3,
    name: '003_messages_recipient_id',
    // Adds recipient_id column and index to messages table
    up(db) {
      const messageCols = db.pragma('table_info(messages)').map(c => c.name);
      if (!messageCols.includes('recipient_id')) {
        db.exec('ALTER TABLE messages ADD COLUMN recipient_id TEXT REFERENCES users(id) ON DELETE SET NULL');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);');
    }
  }
];

// Returns current database schema version from PRAGMA user_version
export function getMigrationVersion(db) {
  return db.pragma('user_version', { simple: true });
}

// Applies unapplied migrations in sequential order inside a transaction
export function runMigrations(db) {
  const currentVersion = getMigrationVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      db.transaction(() => {
        migration.up(db);
        db.pragma(`user_version = ${migration.version}`);
      })();
    }
  }
  return getMigrationVersion(db);
}
