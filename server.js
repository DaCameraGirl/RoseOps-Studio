const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const { config, ensureProductionKeys } = require("./lib/config");
const { createAuditLogger } = require("./lib/audit");
const { createCredentialStore } = require("./lib/credentials");
const { createNodeRegistry } = require("./lib/nodes");
const { createExecutionEngine } = require("./lib/execution");
const { createTriggerManager } = require("./lib/triggers");
const { validateWorkflow } = require("./lib/validate");
const { STARTER_WORKFLOWS, seedWorkflows } = require("./lib/starter-workflows");

ensureProductionKeys();

const dbPath = config.dbPath || path.join(__dirname, "roseops.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    nodes TEXT NOT NULL DEFAULT '[]',
    connections TEXT NOT NULL DEFAULT '[]',
    settings TEXT DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflow_versions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    nodes TEXT NOT NULL,
    connections TEXT NOT NULL,
    settings TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    trigger TEXT DEFAULT 'manual',
    trigger_data TEXT DEFAULT '{}',
    node_results TEXT DEFAULT '{}',
    error TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS execution_events (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    node_id TEXT,
    event_type TEXT NOT NULL,
    payload TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    path TEXT UNIQUE NOT NULL,
    method TEXT NOT NULL DEFAULT 'POST',
    node_id TEXT NOT NULL,
    secret TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    cron_expr TEXT NOT NULL,
    node_id TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    encrypted_payload TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    actor TEXT DEFAULT 'system',
    details TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

function migrate() {
  const cols = db.prepare("PRAGMA table_info(workflows)").all().map((c) => c.name);
  if (!cols.includes("version")) db.exec("ALTER TABLE workflows ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
  const whCols = db.prepare("PRAGMA table_info(webhooks)").all().map((c) => c.name);
  if (!whCols.includes("secret")) db.exec("ALTER TABLE webhooks ADD COLUMN secret TEXT");
}
migrate();

const audit = createAuditLogger(db);
const credentials = createCredentialStore(db, audit);
const nodeTypes = createNodeRegistry(credentials);
const sseClients = new Set();

function sendSSE(data) {
  for (const client of sseClients) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

const engine = createExecutionEngine({ db, nodeTypes, audit, sendSSE });
const triggers = createTriggerManager({
  db,
  execute: (id, trigger, data) => engine.enqueue(id, trigger, data),
  audit,
});

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "10mb" }));

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

function requireApiKey(req, res, next) {
  if (!config.apiKey) return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.headers["x-api-key"];
  if (token !== config.apiKey) return res.status(401).json({ error: "Unauthorized — valid API key required" });
  next();
}

app.use("/api", requireApiKey);
app.use(express.static(__dirname));

function snapshotVersion(workflowId, nodes, connections, settings, version) {
  db.prepare("INSERT INTO workflow_versions (id, workflow_id, version, nodes, connections, settings) VALUES (?, ?, ?, ?, ?, ?)")
    .run(uuidv4(), workflowId, version, JSON.stringify(nodes), JSON.stringify(connections), JSON.stringify(settings || {}));
}

// ===== Health =====
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    version: "3.0.0-enterprise",
    uptime: process.uptime(),
    activeExecutions: engine.isRunning ? undefined : undefined,
  });
});

app.get("/api/ready", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

// ===== SSE =====
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ===== Credentials =====
app.get("/api/credentials", (req, res) => {
  res.json(credentials.list());
});

app.post("/api/credentials", (req, res) => {
  try {
    const result = credentials.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/credentials/:id", (req, res) => {
  const cred = credentials.get(req.params.id, false);
  if (!cred) return res.status(404).json({ error: "Not found" });
  res.json(cred);
});

app.put("/api/credentials/:id", (req, res) => {
  try {
    res.json(credentials.update(req.params.id, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/credentials/:id", (req, res) => {
  try {
    res.json(credentials.remove(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get("/api/credential-types", (req, res) => {
  res.json(credentials.CREDENTIAL_TYPES);
});

// ===== Workflows =====
app.get("/api/workflows", (req, res) => {
  const workflows = db.prepare("SELECT id, name, description, version, created_at, updated_at FROM workflows ORDER BY updated_at DESC").all();
  res.json(workflows);
});

app.get("/api/workflows/:id", (req, res) => {
  const wf = db.prepare("SELECT * FROM workflows WHERE id = ?").get(req.params.id);
  if (!wf) return res.status(404).json({ error: "Not found" });
  wf.nodes = JSON.parse(wf.nodes);
  wf.connections = JSON.parse(wf.connections);
  wf.settings = JSON.parse(wf.settings || "{}");
  res.json(wf);
});

app.post("/api/workflows", (req, res) => {
  const id = uuidv4();
  const { name, description, nodes, connections, settings } = req.body;
  const validation = validateWorkflow(nodes || [], connections || [], nodeTypes);
  if (!validation.valid) return res.status(400).json({ error: "Validation failed", details: validation.errors });

  db.prepare("INSERT INTO workflows (id, name, description, nodes, connections, settings, version) VALUES (?, ?, ?, ?, ?, ?, 1)")
    .run(id, name || "Untitled", description || "", JSON.stringify(nodes || []), JSON.stringify(connections || []), JSON.stringify(settings || {}));
  snapshotVersion(id, nodes || [], connections || [], settings || {}, 1);
  triggers.scanWorkflowTriggers(id);
  audit.log("workflow.created", "workflow", id, { name });
  res.status(201).json({ id, warnings: validation.warnings });
});

app.put("/api/workflows/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM workflows WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const nodes = req.body.nodes !== undefined ? req.body.nodes : JSON.parse(existing.nodes);
  const connections = req.body.connections !== undefined ? req.body.connections : JSON.parse(existing.connections);
  const settings = req.body.settings !== undefined ? req.body.settings : JSON.parse(existing.settings || "{}");

  const validation = validateWorkflow(nodes, connections, nodeTypes);
  if (!validation.valid) return res.status(400).json({ error: "Validation failed", details: validation.errors });

  const nextVersion = (existing.version || 1) + 1;
  db.prepare(`UPDATE workflows SET
    name = COALESCE(?, name),
    description = COALESCE(?, description),
    nodes = ?,
    connections = ?,
    settings = ?,
    version = ?,
    updated_at = datetime('now')
    WHERE id = ?`)
    .run(req.body.name || null, req.body.description ?? null, JSON.stringify(nodes), JSON.stringify(connections), JSON.stringify(settings), nextVersion, req.params.id);

  snapshotVersion(req.params.id, nodes, connections, settings, nextVersion);
  triggers.scanWorkflowTriggers(req.params.id);
  audit.log("workflow.updated", "workflow", req.params.id, { version: nextVersion });
  res.json({ ok: true, version: nextVersion, warnings: validation.warnings });
});

app.get("/api/workflows/:id/versions", (req, res) => {
  const versions = db.prepare("SELECT id, version, created_at FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC").all(req.params.id);
  res.json(versions);
});

app.delete("/api/workflows/:id", (req, res) => {
  triggers.unregisterSchedule(req.params.id);
  triggers.unregisterWebhook(req.params.id);
  db.prepare("DELETE FROM execution_events WHERE execution_id IN (SELECT id FROM executions WHERE workflow_id = ?)").run(req.params.id);
  db.prepare("DELETE FROM executions WHERE workflow_id = ?").run(req.params.id);
  db.prepare("DELETE FROM workflow_versions WHERE workflow_id = ?").run(req.params.id);
  db.prepare("DELETE FROM webhooks WHERE workflow_id = ?").run(req.params.id);
  db.prepare("DELETE FROM schedules WHERE workflow_id = ?").run(req.params.id);
  db.prepare("DELETE FROM workflows WHERE id = ?").run(req.params.id);
  audit.log("workflow.deleted", "workflow", req.params.id);
  res.json({ ok: true });
});

app.post("/api/workflows/:id/validate", (req, res) => {
  const wf = db.prepare("SELECT * FROM workflows WHERE id = ?").get(req.params.id);
  if (!wf) return res.status(404).json({ error: "Not found" });
  const result = validateWorkflow(JSON.parse(wf.nodes), JSON.parse(wf.connections), nodeTypes);
  res.json(result);
});

app.post("/api/workflows/:id/execute", async (req, res) => {
  try {
    const result = await engine.enqueue(req.params.id, "manual", req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Executions =====
app.get("/api/workflows/:id/executions", (req, res) => {
  const execs = db.prepare("SELECT * FROM executions WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 50").all(req.params.id);
  res.json(execs.map((e) => ({ ...e, node_results: JSON.parse(e.node_results || "{}"), trigger_data: JSON.parse(e.trigger_data || "{}") })));
});

app.get("/api/executions/:id", (req, res) => {
  const exec = db.prepare("SELECT * FROM executions WHERE id = ?").get(req.params.id);
  if (!exec) return res.status(404).json({ error: "Not found" });
  exec.node_results = JSON.parse(exec.node_results || "{}");
  exec.trigger_data = JSON.parse(exec.trigger_data || "{}");
  exec.events = db.prepare("SELECT * FROM execution_events WHERE execution_id = ? ORDER BY created_at ASC").all(req.params.id);
  res.json(exec);
});

// ===== Audit =====
app.get("/api/audit", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
  const logs = db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?").all(limit);
  res.json(logs.map((l) => ({ ...l, details: JSON.parse(l.details || "{}") })));
});

// ===== Webhooks =====
app.all("/webhook/:path", async (req, res) => {
  const webhook = db.prepare("SELECT * FROM webhooks WHERE path = ?").get(req.params.path);
  if (!webhook) return res.status(404).json({ error: "Webhook not found" });
  if (req.method !== webhook.method && webhook.method !== "ALL") {
    return res.status(405).json({ error: `Method ${req.method} not allowed — expected ${webhook.method}` });
  }

  const wf = db.prepare("SELECT nodes FROM workflows WHERE id = ?").get(webhook.workflow_id);
  const nodes = wf ? JSON.parse(wf.nodes) : [];
  const whNode = nodes.find((n) => n.id === webhook.node_id);
  if (whNode?.config?.requireSignature !== false && !triggers.verifyWebhookSignature(req, webhook.secret)) {
    audit.log("webhook.rejected", "webhook", webhook.id, { reason: "invalid_signature", path: req.params.path });
    return res.status(401).json({ error: "Invalid webhook signature — send X-RoseOps-Signature: sha256=<hmac>" });
  }

  const triggerData = { method: req.method, headers: req.headers, body: req.body, query: req.query, path: req.params.path };
  res.status(202).json({ accepted: true, message: "Workflow execution queued" });
  audit.log("webhook.received", "webhook", webhook.id, { workflowId: webhook.workflow_id });
  engine.enqueue(webhook.workflow_id, "webhook", triggerData).catch((err) => {
    audit.log("webhook.execution_failed", "webhook", webhook.id, { error: err.message });
  });
});

app.get("/api/webhooks/:workflowId", (req, res) => {
  const wh = db.prepare("SELECT id, workflow_id, path, method, node_id, created_at FROM webhooks WHERE workflow_id = ?").get(req.params.workflowId);
  res.json(wh ? { ...wh, url: `/webhook/${wh.path}` } : null);
});

app.post("/api/webhooks/:workflowId/rotate-secret", (req, res) => {
  const wh = db.prepare("SELECT * FROM webhooks WHERE workflow_id = ?").get(req.params.workflowId);
  if (!wh) return res.status(404).json({ error: "Webhook not found" });
  const crypto = require("crypto");
  const secret = crypto.randomBytes(32).toString("hex");
  db.prepare("UPDATE webhooks SET secret = ? WHERE id = ?").run(secret, wh.id);
  audit.log("webhook.secret_rotated", "webhook", wh.id, { workflowId: req.params.workflowId });
  res.json({ secret, url: `/webhook/${wh.path}` });
});

// ===== Starter workflows =====
app.get("/api/starter-workflows", (req, res) => {
  res.json(STARTER_WORKFLOWS);
});

app.post("/api/workflows/seed", (req, res) => {
  const seeded = seedWorkflows(db, triggers, audit);
  res.json({ seeded, message: seeded ? `Created ${seeded} starter workflows` : "Workflows already exist" });
});

// ===== Node types =====
app.get("/api/node-types", (req, res) => {
  res.json(Object.entries(nodeTypes).map(([type, def]) => ({
    type,
    name: def.name,
    color: def.color,
    icon: def.icon,
    defaults: def.defaults,
    config: def.config,
  })));
});

app.listen(config.port, config.host, () => {
  const seeded = seedWorkflows(db, triggers, audit);
  triggers.restoreAll();
  console.log(`\n  RoseOps Studio Enterprise v3 — http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}\n`);
  if (seeded) console.log(`  Seeded ${seeded} starter workflows — pick one in the sidebar\n`);
  if (config.apiKey) console.log("  API authentication: enabled");
  console.log("  Credentials vault: AES-256-GCM encrypted\n");
});