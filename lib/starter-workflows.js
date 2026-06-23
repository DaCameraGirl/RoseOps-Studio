/** Curated starter workflows — seeded on first run and offered in the + picker */
const STARTER_WORKFLOWS = [
  {
    id: "api-pipeline",
    name: "API Pipeline",
    description: "Authenticated HTTP ingest with transformation layer",
    badge: "Production",
    color: "#6f7dfb",
    icon: "API",
    nodes: [
      { type: "trigger", title: "Manual Trigger", channel: "Operations", notes: "Controlled execution entry point", x: 90, y: 180, icon: "IN", color: "#ed4f8f", priority: "Normal", mode: "Auto", config: { triggerType: "Manual" } },
      { type: "http", title: "API Ingest", channel: "Integration", notes: "Configure endpoint and auth credential", x: 480, y: 180, icon: "HTTP", color: "#6f7dfb", priority: "High", mode: "Auto", config: { url: "", method: "GET", credentialId: "", headers: "{}", body: "{}", retries: 3 } },
      { type: "code", title: "Normalize Payload", channel: "Transform", notes: "Maps upstream schema to internal contract", x: 870, y: 180, icon: "</>", color: "#13a68f", priority: "Normal", mode: "Auto", config: { code: "return { ok: true, payload: data.data, receivedAt: new Date().toISOString() };" } },
    ],
    connections: [[0, 1], [1, 2]],
  },
  {
    id: "incident-notify",
    name: "Incident Notify",
    description: "Operational alert dispatch to Discord",
    badge: "Operations",
    color: "#7289da",
    icon: "DC",
    nodes: [
      { type: "trigger", title: "Manual Trigger", channel: "Operations", notes: "On-demand incident broadcast", x: 90, y: 200, icon: "IN", color: "#ed4f8f", priority: "Critical", mode: "Auto", config: { triggerType: "Manual" } },
      { type: "discord", title: "Discord Alert", channel: "Notification", notes: "Requires Discord webhook credential", x: 480, y: 200, icon: "DC", color: "#7289da", priority: "Critical", mode: "Auto", config: { credentialId: "", message: "[INCIDENT] {{timestamp}} — workflow alert triggered. Review execution log.", username: "RoseOps" } },
    ],
    connections: [[0, 1]],
  },
  {
    id: "webhook-discord",
    name: "Webhook → Discord",
    description: "Inbound webhook fires a Discord channel alert",
    badge: "Popular",
    color: "#9b8ec4",
    icon: "WEB",
    nodes: [
      { type: "webhook", title: "Inbound Webhook", channel: "Ingress", notes: "Receives signed HTTP requests", x: 90, y: 200, icon: "WEB", color: "#ed4f8f", priority: "High", mode: "Auto", config: { method: "POST", requireSignature: true } },
      { type: "discord", title: "Discord Relay", channel: "Notification", notes: "Link Discord webhook credential", x: 480, y: 200, icon: "DC", color: "#7289da", priority: "High", mode: "Auto", config: { credentialId: "", message: "Webhook received: {{body}}", username: "RoseOps" } },
    ],
    connections: [[0, 1]],
  },
  {
    id: "repo-compliance",
    name: "Repo Compliance Watch",
    description: "Scheduled GitHub audit with Discord escalation",
    badge: "Compliance",
    color: "#3d444d",
    icon: "GH",
    nodes: [
      { type: "schedule", title: "Hourly Audit", channel: "Scheduler", notes: "Cron-driven compliance check", x: 90, y: 160, icon: "CLOCK", color: "#ed4f8f", priority: "High", mode: "Auto", config: { cron: "0 * * * *", timezone: "UTC" } },
      { type: "github", title: "Repository Status", channel: "GitHub", notes: "Link GitHub token credential", x: 480, y: 160, icon: "GH", color: "#3d444d", priority: "High", mode: "Auto", config: { endpoint: "", credentialId: "", method: "GET", body: "{}" } },
      { type: "discord", title: "Escalation", channel: "Notification", notes: "Discord webhook credential required", x: 870, y: 160, icon: "DC", color: "#7289da", priority: "High", mode: "Auto", config: { credentialId: "", message: "Compliance: {{data.full_name}} — {{data.stargazers_count}} stars", username: "RoseOps" } },
    ],
    connections: [[0, 1], [1, 2]],
  },
  {
    id: "health-monitor",
    name: "Health Monitor",
    description: "Ping an endpoint every 5 min, alert on failure",
    badge: "SRE",
    color: "#a8d8c8",
    icon: "♥",
    nodes: [
      { type: "schedule", title: "Every 5 Min", channel: "Scheduler", notes: "Cron health probe", x: 90, y: 180, icon: "CLOCK", color: "#ed4f8f", priority: "High", mode: "Auto", config: { cron: "*/5 * * * *", timezone: "UTC" } },
      { type: "http", title: "Health Check", channel: "Probe", notes: "Set your health endpoint URL", x: 480, y: 180, icon: "HTTP", color: "#6f7dfb", priority: "High", mode: "Auto", config: { url: "", method: "GET", credentialId: "", headers: "{}", body: "{}", retries: 2 } },
      { type: "discord", title: "Outage Alert", channel: "Notification", notes: "Discord credential for failures", x: 870, y: 180, icon: "DC", color: "#7289da", priority: "Critical", mode: "Auto", config: { credentialId: "", message: "[OUTAGE] Health check failed at {{timestamp}}", username: "RoseOps" } },
    ],
    connections: [[0, 1], [1, 2]],
  },
  {
    id: "ai-assistant",
    name: "AI Assistant",
    description: "Send a prompt to OpenAI, Gemini, DeepSeek, or Grok",
    badge: "AI",
    color: "#7c5cff",
    icon: "AI",
    nodes: [
      { type: "trigger", title: "Manual Trigger", channel: "Operations", notes: "Run when you're ready", x: 90, y: 180, icon: "IN", color: "#ed4f8f", priority: "Normal", mode: "Auto", config: { triggerType: "Manual" } },
      { type: "llm", title: "AI Chat", channel: "LLM", notes: "Add your API key in Secrets vault, then pick it here", x: 480, y: 180, icon: "AI", color: "#7c5cff", priority: "Normal", mode: "Auto", config: { provider: "openai", credentialId: "", model: "gpt-4o-mini", systemPrompt: "You are a helpful assistant.", userPrompt: "Summarize this workflow run: {{message}}", temperature: 0.7 } },
    ],
    connections: [[0, 1]],
  },
  {
    id: "audit-log-sheet",
    name: "Audit Log to Sheets",
    description: "Append execution records to Google Sheets",
    badge: "Audit",
    color: "#34a853",
    icon: "GS",
    nodes: [
      { type: "trigger", title: "Manual Trigger", channel: "Audit", notes: "Controlled log append", x: 90, y: 200, icon: "IN", color: "#ed4f8f", priority: "Normal", mode: "Auto", config: { triggerType: "Manual" } },
      { type: "googleSheets", title: "Append Audit Row", channel: "Sheets", notes: "Service account + spreadsheet ID required", x: 480, y: 200, icon: "GS", color: "#34a853", priority: "Normal", mode: "Auto", config: { credentialId: "", spreadsheetId: "", range: "AuditLog!A:E", rowData: '["{{timestamp}}", "execution", "manual", "success", ""]' } },
    ],
    connections: [[0, 1]],
  },
];

function instantiateNodes(templateNodes) {
  const { v4: uuidv4 } = require("uuid");
  return templateNodes.map((node) => ({
    ...node,
    id: uuidv4(),
    config: node.config ? { ...node.config } : {},
  }));
}

function seedWorkflows(db, triggers, audit) {
  const count = db.prepare("SELECT COUNT(*) as c FROM workflows").get().c;
  if (count > 0) return 0;

  const insert = db.prepare(`
    INSERT INTO workflows (id, name, description, nodes, connections, settings, version)
    VALUES (?, ?, ?, ?, ?, '{}', 1)
  `);
  const { v4: uuidv4 } = require("uuid");
  let seeded = 0;

  for (const starter of STARTER_WORKFLOWS) {
    const id = uuidv4();
    const nodes = instantiateNodes(starter.nodes);
    insert.run(id, starter.name, starter.description, JSON.stringify(nodes), JSON.stringify(starter.connections));
    db.prepare("INSERT INTO workflow_versions (id, workflow_id, version, nodes, connections, settings) VALUES (?, ?, 1, ?, ?, '{}')")
      .run(uuidv4(), id, JSON.stringify(nodes), JSON.stringify(starter.connections));
    triggers.scanWorkflowTriggers(id);
    audit.log("workflow.seeded", "workflow", id, { name: starter.name, starterId: starter.id });
    seeded++;
  }
  return seeded;
}

module.exports = { STARTER_WORKFLOWS, seedWorkflows, instantiateNodes };