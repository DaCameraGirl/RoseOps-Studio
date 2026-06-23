const { v4: uuidv4 } = require("uuid");

function createAuditLogger(db) {
  const insert = db.prepare(`
    INSERT INTO audit_log (id, action, resource_type, resource_id, actor, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  function log(action, resourceType, resourceId, details = {}, actor = "system") {
    insert.run(uuidv4(), action, resourceType, resourceId || null, actor, JSON.stringify(details));
  }

  return { log };
}

module.exports = { createAuditLogger };