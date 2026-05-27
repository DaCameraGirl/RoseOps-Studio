const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const axios = require("axios");
const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

// ===== DATABASE =====
const db = new Database(path.join(__dirname, "roseops.db"));
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    path TEXT UNIQUE NOT NULL,
    method TEXT NOT NULL DEFAULT 'POST',
    node_id TEXT NOT NULL,
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
`);

// ===== SSE CLIENTS =====
const sseClients = new Set();

function sendSSE(data) {
  for (const client of sseClients) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// ===== NODE TYPE REGISTRY =====
const nodeTypes = {
  trigger: {
    name: "Trigger",
    color: "#ed4f8f",
    icon: "IN",
    defaults: { channel: "Manual", priority: "Normal", mode: "Auto" },
    config: [
      { key: "triggerType", label: "Trigger Type", type: "select", options: ["Manual", "Webhook", "Schedule"], default: "Manual" },
    ],
    async execute(node, input) {
      return { triggered: true, timestamp: new Date().toISOString(), ...input };
    }
  },
  http: {
    name: "HTTP Request",
    color: "#6f7dfb",
    icon: "HTTP",
    defaults: { channel: "API", priority: "Normal", mode: "Auto" },
    config: [
      { key: "url", label: "URL", type: "string", default: "https://api.example.com/data" },
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
      { key: "headers", label: "Headers (JSON)", type: "code", default: "{}" },
      { key: "body", label: "Body (JSON)", type: "code", default: "{}" },
    ],
    async execute(node, input) {
      const config = node.config || {};
      const url = config.url || "https://api.example.com/data";
      const method = (config.method || "GET").toLowerCase();
      let headers = {};
      let body = {};
      try { headers = JSON.parse(config.headers || "{}"); } catch {}
      if (["post", "put", "patch"].includes(method)) {
        try { body = JSON.parse(config.body || "{}"); } catch {}
        if (input && Object.keys(input).length) body = { ...body, ...input };
      }
      const res = await axios({ method, url, headers, data: body, timeout: 30000 });
      return { status: res.status, headers: res.headers, data: res.data };
    }
  },
  code: {
    name: "Code",
    color: "#13a68f",
    icon: "</>",
    defaults: { channel: "JS", priority: "Normal", mode: "Auto" },
    config: [
      { key: "code", label: "JavaScript Code", type: "code", default: "// input is available as `data`\nreturn { result: data };", language: "javascript" },
    ],
    async execute(node, input) {
      const code = node.config?.code || "return {};";
      const sandbox = { data: input || {}, console: { log: (...args) => args }, JSON, Math, Date, Array, Object, String, Number, Boolean };
      const context = vm.createContext(sandbox);
      const script = new vm.Script(`(function() { ${code} })()`);
      const result = script.runInContext(context, { timeout: 5000 });
      return result;
    }
  },
  delay: {
    name: "Delay",
    color: "#f3ae3d",
    icon: "WAIT",
    defaults: { channel: "Timer", priority: "Low", mode: "Auto" },
    config: [
      { key: "duration", label: "Duration (ms)", type: "number", default: 1000 },
    ],
    async execute(node, input) {
      const ms = parseInt(node.config?.duration || 1000);
      await new Promise(r => setTimeout(r, Math.min(ms, 30000)));
      return { ...input, delayed: ms };
    }
  },
  filter: {
    name: "Filter",
    color: "#2f2634",
    icon: "IF",
    defaults: { channel: "Logic", priority: "Normal", mode: "Auto" },
    config: [
      { key: "condition", label: "Condition (JS expression)", type: "code", default: "return data !== null && data !== undefined;" },
    ],
    async execute(node, input) {
      if (!input) return { passed: false };
      const code = node.config?.condition || "return true;";
      const sandbox = { data: input, console: { log: (...args) => args }, JSON, Math, Date, Array, Object, String, Number, Boolean };
      const context = vm.createContext(sandbox);
      const script = new vm.Script(`(function() { ${code} })()`);
      const passed = !!script.runInContext(context, { timeout: 2000 });
      return { ...input, passed };
    }
  },
  webhook: {
    name: "Webhook",
    color: "#ed4f8f",
    icon: "WEB",
    defaults: { channel: "Webhook", priority: "Normal", mode: "Auto" },
    config: [
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "POST" },
    ],
    async execute(node, input) {
      return { received: true, method: input?.method || "POST", headers: input?.headers || {}, body: input?.body || {}, query: input?.query || {}, timestamp: new Date().toISOString() };
    }
  },
  schedule: {
    name: "Schedule",
    color: "#ed4f8f",
    icon: "CLOCK",
    defaults: { channel: "Cron", priority: "Normal", mode: "Auto" },
    config: [
      { key: "cron", label: "Cron Expression", type: "string", default: "*/5 * * * *" },
      { key: "timezone", label: "Timezone", type: "string", default: "UTC" },
    ],
    async execute(node, input) {
      return { scheduled: true, cron: node.config?.cron || "*/5 * * * *", timestamp: new Date().toISOString(), ...input };
    }
  },
  email: {
    name: "Send Email",
    color: "#c47bf0",
    icon: "@",
    defaults: { channel: "Email", priority: "Normal", mode: "Manual" },
    config: [
      { key: "to", label: "To", type: "string", default: "user@example.com" },
      { key: "subject", label: "Subject", type: "string", default: "Hello from RoseOps" },
      { key: "body", label: "Body", type: "code", default: "Workflow executed successfully!" },
    ],
    async execute(node, input) {
      const config = node.config || {};
      const emailContent = `To: ${config.to || "unknown"}\nSubject: ${config.subject || "RoseOps"}\n\n${config.body || ""}`;
      console.log("[Email] Would send:", emailContent);
      return { sent: true, to: config.to || "unknown", subject: config.subject || "RoseOps", note: "Email logged (no SMTP configured)" };
    }
  },
};

// ===== WORKFLOW EXECUTION ENGINE =====
async function executeWorkflow(workflowId, trigger = "manual", triggerData = {}) {
  const workflow = db.prepare("SELECT * FROM workflows WHERE id = ?").get(workflowId);
  if (!workflow) throw new Error("Workflow not found");

  const nodes = JSON.parse(workflow.nodes);
  const connections = JSON.parse(workflow.connections);
  const executionId = uuidv4();

  db.prepare("INSERT INTO executions (id, workflow_id, status, trigger, trigger_data, started_at) VALUES (?, ?, 'running', ?, ?, datetime('now'))")
    .run(executionId, workflowId, trigger, JSON.stringify(triggerData));

  sendSSE({ type: "execution_start", executionId, workflowId, trigger });

  const nodeResults = {};
  const visited = new Set();
  let hasError = false;
  let errorMsg = null;

  async function executeNode(index, inputData) {
    if (visited.has(index) || !nodes[index]) return;
    visited.add(index);
    const node = nodes[index];
    const nodeType = nodeTypes[node.type];
    if (!nodeType) {
      nodeResults[node.id] = { error: `Unknown node type: ${node.type}` };
      return;
    }

    sendSSE({ type: "node_start", executionId, nodeId: node.id, nodeName: node.title });

    try {
      const output = await nodeType.execute(node, inputData);
      nodeResults[node.id] = { output, status: "success" };
      sendSSE({ type: "node_end", executionId, nodeId: node.id, nodeName: node.title, output });
    } catch (err) {
      nodeResults[node.id] = { error: err.message, status: "error" };
      hasError = true;
      errorMsg = err.message;
      sendSSE({ type: "node_error", executionId, nodeId: node.id, nodeName: node.title, error: err.message });
    }

    const downstream = connections.filter(([from]) => from === index);
    for (const [, to] of downstream) {
      if (!hasError) await executeNode(to, nodeResults[node.id]?.output || {});
    }
  }

  const startIndices = connections.length === 0
    ? [0]
    : nodes.map((_, i) => i).filter(i => !connections.some(([, to]) => to === i));
  const startInput = trigger.type === "webhook" ? triggerData : {};

  for (const idx of startIndices) {
    if (!hasError) await executeNode(idx, startInput);
  }

  const status = hasError ? "error" : "success";
  db.prepare("UPDATE executions SET status = ?, node_results = ?, error = ?, finished_at = datetime('now') WHERE id = ?")
    .run(status, JSON.stringify(nodeResults), errorMsg, executionId);

  sendSSE({ type: "execution_end", executionId, status, nodeResults, error: errorMsg });

  return { executionId, status, nodeResults, error: errorMsg };
}

// ===== TRIGGER MANAGER =====
const activeSchedules = new Map();
const activeWebhooks = new Map();

function registerSchedule(workflowId, nodeId, cronExpr) {
  unregisterSchedule(workflowId);
  if (cron.validate(cronExpr)) {
    const task = cron.schedule(cronExpr, () => {
      console.log(`[Schedule] Triggering workflow ${workflowId}`);
      executeWorkflow(workflowId, "schedule", { cron: cronExpr, nodeId, timestamp: new Date().toISOString() });
    });
    activeSchedules.set(workflowId, task);
    console.log(`[Schedule] Registered ${cronExpr} for workflow ${workflowId}`);
  }
}

function unregisterSchedule(workflowId) {
  if (activeSchedules.has(workflowId)) {
    activeSchedules.get(workflowId).stop();
    activeSchedules.delete(workflowId);
  }
}

function registerWebhook(workflowId, nodeId, method) {
  unregisterWebhook(workflowId);
  const webhookId = uuidv4();
  const whPath = `wh_${workflowId.slice(0, 8)}`;
  db.prepare("DELETE FROM webhooks WHERE workflow_id = ?").run(workflowId);
  db.prepare("INSERT INTO webhooks (id, workflow_id, path, method, node_id) VALUES (?, ?, ?, ?, ?)")
    .run(webhookId, workflowId, whPath, method || "POST", nodeId);
  activeWebhooks.set(workflowId, whPath);
  console.log(`[Webhook] Registered /webhook/${whPath} for workflow ${workflowId}`);
  return whPath;
}

function unregisterWebhook(workflowId) {
  db.prepare("DELETE FROM webhooks WHERE workflow_id = ?").run(workflowId);
  activeWebhooks.delete(workflowId);
}

function scanWorkflowTriggers(workflowId) {
  const workflow = db.prepare("SELECT * FROM workflows WHERE id = ?").get(workflowId);
  if (!workflow) return;
  const nodes = JSON.parse(workflow.nodes);
  const settings = JSON.parse(workflow.settings || "{}");
  for (const node of nodes) {
    if (node.type === "schedule" && settings.active !== false) {
      const cronExpr = node.config?.cron || "*/5 * * * *";
      registerSchedule(workflowId, node.id, cronExpr);
    }
    if (node.type === "webhook") {
      registerWebhook(workflowId, node.id, node.config?.method || "POST");
    }
  }
}

// ===== API ROUTES =====

// SSE endpoint
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// Workflows
app.get("/api/workflows", (req, res) => {
  const workflows = db.prepare("SELECT id, name, description, created_at, updated_at FROM workflows ORDER BY updated_at DESC").all();
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
  db.prepare("INSERT INTO workflows (id, name, description, nodes, connections, settings) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, name || "Untitled", description || "", JSON.stringify(nodes || []), JSON.stringify(connections || []), JSON.stringify(settings || {}));
  scanWorkflowTriggers(id);
  res.json({ id });
});

app.put("/api/workflows/:id", (req, res) => {
  const { name, description, nodes, connections, settings } = req.body;
  db.prepare("UPDATE workflows SET name = COALESCE(?, name), description = COALESCE(?, description), nodes = COALESCE(?, nodes), connections = COALESCE(?, connections), settings = COALESCE(?, settings), updated_at = datetime('now') WHERE id = ?")
    .run(name || null, description ?? null, nodes ? JSON.stringify(nodes) : null, connections ? JSON.stringify(connections) : null, settings ? JSON.stringify(settings) : null, req.params.id);

  if (nodes || settings) scanWorkflowTriggers(req.params.id);
  res.json({ ok: true });
});

app.delete("/api/workflows/:id", (req, res) => {
  unregisterSchedule(req.params.id);
  unregisterWebhook(req.params.id);
  db.prepare("DELETE FROM executions WHERE workflow_id = ?").run(req.params.id);
  db.prepare("DELETE FROM webhooks WHERE workflow_id = ?").run(req.params.id);
  db.prepare("DELETE FROM schedules WHERE workflow_id = ?").run(req.params.id);
  db.prepare("DELETE FROM workflows WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Execute
app.post("/api/workflows/:id/execute", async (req, res) => {
  try {
    const result = await executeWorkflow(req.params.id, "manual", req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Executions
app.get("/api/workflows/:id/executions", (req, res) => {
  const execs = db.prepare("SELECT * FROM executions WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 20").all(req.params.id);
  res.json(execs.map(e => ({ ...e, node_results: JSON.parse(e.node_results || "{}"), trigger_data: JSON.parse(e.trigger_data || "{}") })));
});

app.get("/api/executions/:id", (req, res) => {
  const exec = db.prepare("SELECT * FROM executions WHERE id = ?").get(req.params.id);
  if (!exec) return res.status(404).json({ error: "Not found" });
  exec.node_results = JSON.parse(exec.node_results || "{}");
  exec.trigger_data = JSON.parse(exec.trigger_data || "{}");
  res.json(exec);
});

// Webhook trigger
app.all("/webhook/:path", async (req, res) => {
  const webhook = db.prepare("SELECT * FROM webhooks WHERE path = ?").get(req.params.path);
  if (!webhook) return res.status(404).json({ error: "Webhook not found" });
  const triggerData = { method: req.method, headers: req.headers, body: req.body, query: req.query, path: req.params.path };
  res.json({ received: true, message: "Workflow triggered" });
  executeWorkflow(webhook.workflow_id, "webhook", triggerData).catch(err => console.error("[Webhook] Execution error:", err));
});

// Node types
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

app.get("/api/webhooks/:workflowId", (req, res) => {
  const wh = db.prepare("SELECT * FROM webhooks WHERE workflow_id = ?").get(req.params.workflowId);
  res.json(wh ? { ...wh, url: `/webhook/${wh.path}` } : null);
});

// ===== INIT =====
const PORT = process.env.PORT || 3099;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  RoseOps Studio v2 running at http://localhost:${PORT}\n`);

  // Re-register triggers for all saved workflows
  const workflows = db.prepare("SELECT id FROM workflows").all();
  for (const wf of workflows) scanWorkflowTriggers(wf.id);
});
