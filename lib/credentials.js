const { v4: uuidv4 } = require("uuid");
const { encrypt, decrypt } = require("./crypto");

const CREDENTIAL_TYPES = [
  "api_key",
  "bearer_token",
  "webhook_url",
  "smtp",
  "google_service_account",
  "github_token",
  "discord_webhook",
  "openai_api",
  "google_gemini",
  "deepseek_api",
  "xai_grok",
  "ollama_local",
  "anthropic_api",
  "azure_openai",
];

function createCredentialStore(db, audit) {
  const insertStmt = db.prepare(`
    INSERT INTO credentials (id, name, type, encrypted_payload, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const updateStmt = db.prepare(`
    UPDATE credentials SET name = ?, type = ?, encrypted_payload = ?, tags = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const getStmt = db.prepare("SELECT * FROM credentials WHERE id = ?");
  const listStmt = db.prepare("SELECT id, name, type, tags, created_at, updated_at FROM credentials ORDER BY updated_at DESC");
  const deleteStmt = db.prepare("DELETE FROM credentials WHERE id = ?");

  function seal(data) {
    return JSON.stringify(encrypt(JSON.stringify(data)));
  }

  function unseal(payload) {
    const parsed = JSON.parse(payload);
    return JSON.parse(decrypt(parsed));
  }

  function create({ name, type, data, tags = [] }) {
    if (!CREDENTIAL_TYPES.includes(type)) throw new Error(`Invalid credential type: ${type}`);
    const id = uuidv4();
    insertStmt.run(id, name, type, seal(data), JSON.stringify(tags));
    audit.log("credential.created", "credential", id, { name, type });
    return { id, name, type, tags };
  }

  function update(id, { name, type, data, tags }) {
    const existing = getStmt.get(id);
    if (!existing) throw new Error("Credential not found");
    const nextType = type || existing.type;
    const nextData = data !== undefined ? data : unseal(existing.encrypted_payload);
    updateStmt.run(
      name || existing.name,
      nextType,
      seal(nextData),
      JSON.stringify(tags || JSON.parse(existing.tags || "[]")),
      id
    );
    audit.log("credential.updated", "credential", id, { name: name || existing.name, type: nextType });
    return { id, name: name || existing.name, type: nextType };
  }

  function get(id, includeSecret = false) {
    const row = getStmt.get(id);
    if (!row) return null;
    const result = {
      id: row.id,
      name: row.name,
      type: row.type,
      tags: JSON.parse(row.tags || "[]"),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    if (includeSecret) result.data = unseal(row.encrypted_payload);
    return result;
  }

  function resolve(id) {
    const cred = get(id, true);
    if (!cred) throw new Error(`Credential not found: ${id}`);
    return cred;
  }

  function list() {
    return listStmt.all().map((row) => ({
      ...row,
      tags: JSON.parse(row.tags || "[]"),
    }));
  }

  function remove(id) {
    const existing = getStmt.get(id);
    if (!existing) throw new Error("Credential not found");
    deleteStmt.run(id);
    audit.log("credential.deleted", "credential", id, { name: existing.name });
    return { ok: true };
  }

  return { create, update, get, resolve, list, remove, CREDENTIAL_TYPES };
}

module.exports = { createCredentialStore, CREDENTIAL_TYPES };