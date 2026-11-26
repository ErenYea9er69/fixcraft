import db from '../db.js';

let _stmtInsertAudit = null;

// Returns cached prepared statement for audit log insertion
function getAuditStmt() {
  if (!_stmtInsertAudit) {
    _stmtInsertAudit = db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
  }
  return _stmtInsertAudit;
}

// Records an immutable audit log entry for security and compliance tracking
export function logAudit(userId, action, entityType, entityId, metadata = {}) {
  try {
    const id = `audit-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const metaString = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    getAuditStmt().run(id, userId || null, action, entityType, String(entityId), metaString);
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}

export default logAudit;
