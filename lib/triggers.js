const crypto = require("crypto");
const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");

function createTriggerManager({ db, execute, audit }) {
  const activeSchedules = new Map();

  function registerSchedule(workflowId, nodeId, cronExpr) {
    unregisterSchedule(workflowId);
    if (!cron.validate(cronExpr)) {
      audit.log("schedule.invalid", "workflow", workflowId, { cronExpr, nodeId });
      return;
    }
    const task = cron.schedule(cronExpr, () => {
      execute(workflowId, "schedule", { cron: cronExpr, nodeId, timestamp: new Date().toISOString() })
        .catch((err) => audit.log("schedule.error", "workflow", workflowId, { error: err.message }));
    });
    activeSchedules.set(workflowId, task);
    db.prepare("DELETE FROM schedules WHERE workflow_id = ?").run(workflowId);
    db.prepare("INSERT INTO schedules (id, workflow_id, cron_expr, node_id, active) VALUES (?, ?, ?, ?, 1)")
      .run(uuidv4(), workflowId, cronExpr, nodeId);
    audit.log("schedule.registered", "workflow", workflowId, { cronExpr, nodeId });
  }

  function unregisterSchedule(workflowId) {
    if (activeSchedules.has(workflowId)) {
      activeSchedules.get(workflowId).stop();
      activeSchedules.delete(workflowId);
    }
    db.prepare("DELETE FROM schedules WHERE workflow_id = ?").run(workflowId);
  }

  function registerWebhook(workflowId, nodeId, method) {
    unregisterWebhook(workflowId);
    const webhookId = uuidv4();
    const whPath = `wh_${workflowId.replace(/-/g, "").slice(0, 12)}`;
    const secret = crypto.randomBytes(32).toString("hex");
    db.prepare("DELETE FROM webhooks WHERE workflow_id = ?").run(workflowId);
    db.prepare("INSERT INTO webhooks (id, workflow_id, path, method, node_id, secret) VALUES (?, ?, ?, ?, ?, ?)")
      .run(webhookId, workflowId, whPath, method || "POST", nodeId, secret);
    audit.log("webhook.registered", "workflow", workflowId, { path: whPath, method });
    return { path: whPath, secret };
  }

  function unregisterWebhook(workflowId) {
    db.prepare("DELETE FROM webhooks WHERE workflow_id = ?").run(workflowId);
  }

  function verifyWebhookSignature(req, secret) {
    const signature = req.headers["x-roseops-signature"] || req.headers["x-hub-signature-256"];
    if (!signature || !secret) return false;
    const raw = JSON.stringify(req.body || {});
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const provided = String(signature).replace(/^sha256=/, "");
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    } catch {
      return false;
    }
  }

  function scanWorkflowTriggers(workflowId) {
    const workflow = db.prepare("SELECT * FROM workflows WHERE id = ?").get(workflowId);
    if (!workflow) return;
    const nodes = JSON.parse(workflow.nodes);
    const settings = JSON.parse(workflow.settings || "{}");
    unregisterSchedule(workflowId);
    unregisterWebhook(workflowId);
    for (const node of nodes) {
      if (node.type === "schedule" && settings.active !== false) {
        registerSchedule(workflowId, node.id, node.config?.cron || "0 * * * *");
      }
      if (node.type === "webhook") {
        registerWebhook(workflowId, node.id, node.config?.method || "POST");
      }
    }
  }

  function restoreAll() {
    const workflows = db.prepare("SELECT id FROM workflows").all();
    for (const wf of workflows) scanWorkflowTriggers(wf.id);
  }

  return {
    registerSchedule,
    unregisterSchedule,
    registerWebhook,
    unregisterWebhook,
    verifyWebhookSignature,
    scanWorkflowTriggers,
    restoreAll,
  };
}

module.exports = { createTriggerManager };