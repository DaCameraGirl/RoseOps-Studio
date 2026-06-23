const IS_GITHUB_PAGES = /github\.io$/i.test(window.location.hostname);
const API = IS_GITHUB_PAGES
  ? (sessionStorage.getItem("roseops_api_url") || "")
  : `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ":3099"}`;
const NODE_WIDTH = 340;
const NODE_MID_Y = 81;
let connected = false;
let apiKey = sessionStorage.getItem("roseops_api_key") || "";
let credentialList = [];
let workflowVersion = 1;

function apiHeaders(extra = {}) {
  const h = { ...extra };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

async function apiFetch(path, opts = {}) {
  if (!API) throw new Error("Enterprise engine URL not configured");
  const res = await fetch(`${API}${path}`, { ...opts, headers: apiHeaders(opts.headers || {}) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.details?.join?.(" ") || err.error || res.statusText;
    throw new Error(msg);
  }
  return res;
}

let blockTypes = [
  { type: "trigger", name: "Trigger", icon: "\u2726", color: "#e8739a", config: [{ key: "triggerType", label: "Type", type: "select", options: ["Manual", "Webhook", "Schedule"], default: "Manual" }], defaults: { channel: "Manual", priority: "Normal", mode: "Auto" } },
  { type: "http", name: "HTTP Request", icon: "HTTP", color: "#b8a9d4", config: [{ key: "url", label: "URL", type: "string", default: "https://api.example.com" }, { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" }, { key: "headers", label: "Headers", type: "code", default: "{}" }, { key: "body", label: "Body", type: "code", default: "{}" }], defaults: { channel: "API", priority: "Normal", mode: "Auto" } },
  { type: "code", name: "Code", icon: "</>", color: "#a8d8c8", config: [{ key: "code", label: "JavaScript", type: "code", default: "return { result: data };" }], defaults: { channel: "JS", priority: "Normal", mode: "Auto" } },
  { type: "delay", name: "Delay", icon: "WAIT", color: "#e8c87a", config: [{ key: "duration", label: "ms", type: "number", default: 1000 }], defaults: { channel: "Timer", priority: "Low", mode: "Auto" } },
  { type: "filter", name: "Filter", icon: "IF", color: "#c24b73", config: [{ key: "condition", label: "Condition", type: "code", default: "return data !== null;" }], defaults: { channel: "Logic", priority: "Normal", mode: "Auto" } },
  { type: "webhook", name: "Webhook", icon: "WEB", color: "#9b8ec4", config: [{ key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "POST" }], defaults: { channel: "Webhook", priority: "Normal", mode: "Auto" } },
  { type: "schedule", name: "Schedule", icon: "CLOCK", color: "#e8739a", config: [{ key: "cron", label: "Cron", type: "string", default: "*/5 * * * *" }], defaults: { channel: "Cron", priority: "Normal", mode: "Auto" } },
  { type: "email", name: "Send Email", icon: "@", color: "#b8a9d4", config: [{ key: "to", label: "To", type: "string", default: "user@example.com" }, { key: "subject", label: "Subject", type: "string", default: "Hello" }, { key: "body", label: "Body", type: "code", default: "Workflow ran!" }], defaults: { channel: "Email", priority: "Normal", mode: "Manual" } },
  { type: "function", name: "Function", icon: "ƒ", color: "#d4b8e8", config: [{ key: "functionCode", label: "Function Code", type: "code", default: "return items;" }], defaults: { channel: "Function", priority: "Normal", mode: "Auto" } },
  { type: "set", name: "Set", icon: "≡", color: "#f8b8d8", config: [ 
    { key: "keepOnlySet", label: "Keep Only Set", type: "boolean", default: true },
    { key: "values", label: "Values", type: "json", default: "[]" } 
  ], defaults: { channel: "Set", priority: "Normal", mode: "Auto" } },
  { type: "if", name: "IF", icon: "✶", color: "#f5a8b8", config: [{ key: "conditions", label: "Conditions", type: "json", default: "[]" }], defaults: { channel: "Logic", priority: "Normal", mode: "Auto" } },
  { type: "splitInBatches", name: "SplitInBatches", icon: "÷", color: "#a8d8b8", config: [{ key: "batchSize", label: "Batch Size", type: "number", default: 50 }], defaults: { channel: "Split", priority: "Normal", mode: "Auto" } },
  { type: "merge", name: "Merge", icon: "⊕", color: "#d8b8e8", config: [{ key: "mode", label: "Mode", type: "select", options: ["Append", "Merge By Key"], default: "Append" }], defaults: { channel: "Merge", priority: "Normal", mode: "Auto" } },
  { type: "discord", name: "Discord", icon: "DC", color: "#7289da", config: [{ key: "webhookUrl", label: "Webhook URL", type: "string", default: "" }, { key: "message", label: "Message", type: "code", default: "Hello from RoseOps! ✨" }, { key: "username", label: "Bot Name", type: "string", default: "RoseOps" }], defaults: { channel: "Discord", priority: "Normal", mode: "Auto" } },
  { type: "github", name: "GitHub", icon: "GH", color: "#3d444d", config: [{ key: "endpoint", label: "API Endpoint", type: "string", default: "https://api.github.com/repos/owner/repo" }, { key: "token", label: "Token (optional)", type: "string", default: "" }, { key: "method", label: "Method", type: "select", options: ["GET", "POST"], default: "GET" }], defaults: { channel: "GitHub", priority: "Normal", mode: "Auto" } },
  { type: "googleSheets", name: "Google Sheets", icon: "GS", color: "#34a853", config: [{ key: "scriptUrl", label: "Apps Script URL", type: "string", default: "" }, { key: "sheetName", label: "Sheet Name", type: "string", default: "Sheet1" }, { key: "rowData", label: "Row Data (JSON)", type: "code", default: '["{{timestamp}}", "workflow ran"]' }], defaults: { channel: "Sheets", priority: "Normal", mode: "Auto" } },
];

let WORKFLOW_TEMPLATES = [];

const ONBOARDING_KEY = "roseops_onboarded";
const STARTERS_SEED_KEY = "roseops_starters_seeded";
const ONBOARDING_STEPS = 3;

let localDb = JSON.parse(localStorage.getItem("roseops_workflows") || "[]");
let currentWorkflowId = null;
let nodes = [];
let connections = [];
let selectedNodeId = null;
let dragState = null;
let connectionDrag = null;
let executionResults = {};
let webhookInfo = null;
let saveTimeout = null;
let runTimer = null;
let onboardingStep = 0;
let paletteDrag = null;
let spawnNodeId = null;
let lastConnectedPair = null;

const els = {};
function initEls() {
  const ids = ["templateList","blockPalette","flowTitle","nodeCount","board","nodes","connections","inspectorEmpty","inspectorForm","nodeName","nodeChannel","nodeNotes","nodePriority","nodeMode","deleteNode","resetFlow","autoArrange","runFlow","runLog","runState","chatForm","chatInput","chatLog","workflowList","newWorkflow","nodeConfig","browseTemplates","onboarding","onboardingContent","onboardingProgress","credentialList","newCredential","modal","modalTitle","modalBody","connectionStatus","workflowVersion","nodeCountMeta"];
  ids.forEach(id => els[id] = document.querySelector("#" + id));
}

async function init() {
  initEls();

  // Set up event listeners
  els.nodeName.addEventListener("input", (e) => updateSelected("title", e.target.value));
  els.nodeChannel.addEventListener("change", (e) => updateSelected("channel", e.target.value));
  els.nodeNotes.addEventListener("input", (e) => updateSelected("notes", e.target.value));
  els.nodePriority.addEventListener("change", (e) => updateSelected("priority", e.target.value));
  els.nodeMode.addEventListener("change", (e) => updateSelected("mode", e.target.value));
  els.deleteNode.addEventListener("click", deleteSelected);
  if (els.resetFlow) els.resetFlow.addEventListener("click", () => { if (currentWorkflowId) loadWorkflow(currentWorkflowId); });
  els.autoArrange.addEventListener("click", autoArrange);
  els.runFlow.addEventListener("click", runFlow);
  els.nodes.addEventListener("pointerdown", (event) => {
    const outputHandle = event.target.closest(".node-handle-output");
    if (outputHandle) { event.stopPropagation(); startConnectionDrag(event, outputHandle); }
  });
  els.chatForm.addEventListener("submit", (e) => {
    e.preventDefault(); const value = els.chatInput.value; els.chatInput.value = ""; handleChatCommand(value);
  });
  els.newWorkflow.addEventListener("click", () => showWorkflowPickerModal());
  if (els.newCredential) els.newCredential.addEventListener("click", () => showNewCredentialModal());
  document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  if (els.browseTemplates) {
    els.browseTemplates.addEventListener("click", () => {
      els.templateList?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  setupPaletteDropZone();

  await connectToServer();
  await loadStarterCatalog();
  renderPalette();
  renderTemplates();
  await loadCredentials();
  await ensureStarterWorkflowsExist();
  await loadWorkflowList();
  if (connected) setupSSE();
  if (!localStorage.getItem(ONBOARDING_KEY)) showOnboarding();
}

async function connectToServer() {
  if (IS_GITHUB_PAGES && !API) {
    connected = false;
    els.connectionStatus.textContent = "● pages (static)";
    showPagesDeployBanner();
    addChatMessage("bot", "GitHub Pages serves the UI only. Deploy the Node engine (server.js) to Render/Railway, then set your API URL.");
    return;
  }
  try {
    const res = await apiFetch("/api/health", { signal: AbortSignal.timeout(2000) });
    const health = await res.json();
    connected = true;
    const typesRes = await apiFetch("/api/node-types");
    const serverTypes = await typesRes.json();
    if (serverTypes?.length) blockTypes = serverTypes;
    els.connectionStatus.textContent = `● ${health.version || "enterprise"}`;
    addChatMessage("bot", "Connected to RoseOps Enterprise engine.");
  } catch (err) {
    connected = false;
    els.connectionStatus.textContent = "● offline";
    if (String(err.message).includes("Unauthorized") && !apiKey) promptApiKey();
    addChatMessage("bot", "Server unavailable — start with npm start. Execution requires the engine.");
  }
}

function showPagesDeployBanner() {
  if (document.getElementById("pagesBanner")) return;
  const banner = document.createElement("div");
  banner.id = "pagesBanner";
  banner.className = "pages-banner";
  banner.innerHTML = `
    <strong>Enterprise engine not connected.</strong>
    GitHub Pages hosts the studio UI. Execution, credentials vault, and audit require the Node server.
    <button type="button" class="ghost-button" id="setApiUrl">Connect API URL</button>`;
  document.querySelector(".workspace")?.prepend(banner);
  banner.querySelector("#setApiUrl").addEventListener("click", () => {
    showModal("Connect Enterprise Engine", `
      <p class="onboarding-subtitle">Enter the URL where you deployed <code>server.js</code> (e.g. https://roseops-api.onrender.com)</p>
      <form id="apiUrlForm" class="credential-form-grid">
        <label>Engine URL<input id="apiUrlInput" type="url" placeholder="https://your-api.example.com" required /></label>
        <div class="modal-actions">
          <button type="submit" class="primary-button">Connect</button>
        </div>
      </form>`);
    document.getElementById("apiUrlForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = document.getElementById("apiUrlInput").value.trim().replace(/\/$/, "");
      sessionStorage.setItem("roseops_api_url", url);
      closeModal();
      location.reload();
    });
  });
}

function promptApiKey() {
  showModal("API Authentication", `
    <p class="onboarding-subtitle">This deployment requires an API key. Enter your ROSEOPS_API_KEY.</p>
    <form id="apiKeyForm" class="credential-form-grid">
      <label>API Key<input type="password" id="apiKeyInput" autocomplete="off" required /></label>
      <div class="modal-actions">
        <button type="submit" class="primary-button">Connect</button>
      </div>
    </form>`);
  document.getElementById("apiKeyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    apiKey = document.getElementById("apiKeyInput").value.trim();
    sessionStorage.setItem("roseops_api_key", apiKey);
    closeModal();
    await connectToServer();
    await loadCredentials();
    await loadWorkflowList();
    if (connected) setupSSE();
  });
}

function setupSSE() {
  if (!connected) return;
  const evt = new EventSource(`${API}/api/events`);
  evt.onmessage = (e) => {
    const data = JSON.parse(e.data);
    switch (data.type) {
      case "execution_start":
        els.runState.textContent = "Running";
        document.querySelector(".board-wrap")?.classList.add("board-running");
        els.runLog.innerHTML = `<li class="active">▶ Workflow started (${data.trigger})</li>`; break;
      case "node_start":
        const li = document.createElement("li");
        li.textContent = `▶ ${data.nodeName}`; li.className = "active"; els.runLog.appendChild(li); break;
      case "node_end":
        const last = els.runLog.lastElementChild;
        if (last) { last.className = "completed"; last.textContent = `✓ ${data.nodeName}`; } break;
      case "node_error":
        const err = els.runLog.lastElementChild;
        if (err) { err.className = "error"; err.textContent = `✗ ${friendlyError(data.error, { nodeName: data.nodeName })}`; } break;
      case "execution_end":
        document.querySelector(".board-wrap")?.classList.remove("board-running");
        els.runState.textContent = data.status === "success" ? "Complete" : "Error";
        if (data.status === "success") {
          els.runState.classList.add("success-pulse");
          setTimeout(() => els.runState.classList.remove("success-pulse"), 700);
        }
        executionResults = data.nodeResults || {};
        if (data.status === "error" && data.error) {
          const e = document.createElement("li");
          e.className = "error"; e.textContent = friendlyError(data.error); els.runLog.appendChild(e);
        }
        renderFlow(); break;
    }
  };
}

function saveLocalDb() {
  localStorage.setItem("roseops_workflows", JSON.stringify(localDb));
}

async function loadStarterCatalog() {
  try {
    if (connected) {
      WORKFLOW_TEMPLATES = await (await apiFetch("/api/starter-workflows")).json();
    } else {
      const base = window.location.pathname.replace(/\/[^/]*$/, "/");
      WORKFLOW_TEMPLATES = await (await fetch(`${base}starters.json`)).json();
    }
  } catch {
    WORKFLOW_TEMPLATES = [];
  }
}

async function ensureStarterWorkflowsExist() {
  let count = 0;
  if (connected) {
    try {
      const list = await (await apiFetch("/api/workflows")).json();
      count = list.length;
      if (!count) {
        const result = await (await apiFetch("/api/workflows/seed", { method: "POST" })).json();
        if (result.seeded) addChatMessage("bot", `${result.seeded} starter workflows ready — pick one from the sidebar.`);
      }
    } catch {}
    return;
  }
  if (!localDb.length && WORKFLOW_TEMPLATES.length && !localStorage.getItem(STARTERS_SEED_KEY)) {
    for (const starter of WORKFLOW_TEMPLATES) {
      await cloneTemplate(starter, { silent: true, skipArrange: true });
    }
    localStorage.setItem(STARTERS_SEED_KEY, "1");
    addChatMessage("bot", `${WORKFLOW_TEMPLATES.length} starter workflows loaded — pick one from the sidebar.`);
  }
}

async function loadWorkflowList() {
  els.workflowList.innerHTML = "";
  let workflows = [];
  if (connected) {
    try { workflows = await (await apiFetch("/api/workflows")).json(); } catch {}
  }
  if (!workflows?.length) workflows = localDb;

  if (!workflows.length) {
    const empty = document.createElement("div");
    empty.className = "workflow-empty";
    empty.innerHTML = `<p>No workflows yet.</p><button type="button" class="primary-button" id="pickStarterBtn">Pick a starter workflow</button>`;
    els.workflowList.appendChild(empty);
    empty.querySelector("#pickStarterBtn").addEventListener("click", () => showWorkflowPickerModal());
    return;
  }

  for (const wf of workflows) {
    const starter = WORKFLOW_TEMPLATES.find((t) => t.name === wf.name);
    const color = starter?.color || "#ed4f8f";
    const icon = starter?.icon || (wf.name || "?").slice(0, 2).toUpperCase();
    const btn = document.createElement("button");
    btn.className = `template-card${wf.id === currentWorkflowId ? " active" : ""}`;
    btn.innerHTML = `<span class="tile-icon" style="background:${color}">${icon}</span><span><strong>${escapeHtml(wf.name)}</strong><span>${escapeHtml(wf.description || "")}</span>${starter?.badge ? `<span class="template-badge">${escapeHtml(starter.badge)}</span>` : ""}</span>`;
    btn.addEventListener("click", () => loadWorkflow(wf.id));
    els.workflowList.appendChild(btn);
  }
  if (workflows.length > 0 && !currentWorkflowId) await loadWorkflow(workflows[0].id);
}

async function loadCredentials() {
  if (!connected || !els.credentialList) return;
  try {
    credentialList = await (await apiFetch("/api/credentials")).json();
    els.credentialList.innerHTML = "";
    credentialList.forEach((cred) => {
      const btn = document.createElement("button");
      btn.className = "template-card";
      btn.innerHTML = `<span class="tile-icon" style="background:#9b8ec4">${cred.type.slice(0, 2).toUpperCase()}</span><span><strong>${escapeHtml(cred.name)}</strong><span>${escapeHtml(cred.type)}</span></span>`;
      btn.addEventListener("click", () => showCredentialDetail(cred.id));
      els.credentialList.appendChild(btn);
    });
  } catch {}
}

async function createWorkflow(name, description) {
  let id = crypto.randomUUID();
  if (connected) {
    try {
      const d = await (await apiFetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, nodes: [], connections: [] }) })).json();
      id = d.id;
    } catch (err) {
      addChatMessage("bot", err.message);
      return;
    }
  }
  if (!connected) {
    localDb.push({ id, name, description, nodes: [], connections: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    saveLocalDb();
  }
  currentWorkflowId = id; nodes = []; connections = []; selectedNodeId = null; executionResults = {}; webhookInfo = null;
  els.flowTitle.textContent = name; clearRun(); renderFlow(); await loadWorkflowList();
}

async function loadWorkflow(id) {
  let wf = null;
  if (connected) {
    try { wf = await (await apiFetch(`/api/workflows/${id}`)).json(); } catch {}
  }
  if (!wf) wf = localDb.find(w => w.id === id);
  if (!wf) { await createWorkflow("Untitled", ""); return; }
  currentWorkflowId = wf.id; nodes = wf.nodes || []; connections = wf.connections || [];
  selectedNodeId = nodes[0]?.id ?? null; executionResults = {};
  workflowVersion = wf.version || 1;
  els.flowTitle.textContent = wf.name || "Untitled";
  els.workflowVersion.textContent = `v${workflowVersion}`;
  clearRun(); renderFlow(); await loadWorkflowList();
  webhookInfo = null;
  if (connected) {
    try { const wh = await (await apiFetch(`/api/webhooks/${id}`)).json(); if (wh) webhookInfo = wh; } catch {}
  }
}

function saveWorkflow() {
  if (!currentWorkflowId) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (connected) {
      try {
        const result = await (await apiFetch(`/api/workflows/${currentWorkflowId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes, connections }) })).json();
        if (result.version) { workflowVersion = result.version; els.workflowVersion.textContent = `v${workflowVersion}`; }
      } catch (err) { addChatMessage("bot", `Save failed: ${err.message}`); }
    }
    if (!connected) {
      const idx = localDb.findIndex(w => w.id === currentWorkflowId);
      if (idx >= 0) { localDb[idx].nodes = nodes; localDb[idx].connections = connections; localDb[idx].updated_at = new Date().toISOString(); }
      saveLocalDb();
    }
  }, 500);
}

function renderPalette() {
  els.blockPalette.innerHTML = "";
  blockTypes.forEach((block) => {
    const button = document.createElement("button");
    button.className = "palette-card";
    button.draggable = false;
    button.dataset.type = block.type;
    button.innerHTML = `<span class="tile-icon" style="background:${block.color}">${block.icon}</span><span><strong>${block.name}</strong><span>Drag or click to add</span></span>`;
    button.addEventListener("click", () => { if (!paletteDrag?.moved) addBlock(block.type); });
    button.addEventListener("pointerdown", (e) => startPaletteDrag(e, block));
    els.blockPalette.appendChild(button);
  });
}

function renderTemplates() {
  if (!els.templateList) return;
  els.templateList.innerHTML = "";
  WORKFLOW_TEMPLATES.forEach((tpl) => {
    const btn = document.createElement("button");
    btn.className = "template-card";
    btn.innerHTML = `<span class="tile-icon" style="background:${tpl.color}">${tpl.icon}</span><span><strong>${escapeHtml(tpl.name)}</strong><span>${escapeHtml(tpl.description)}</span>${tpl.badge ? `<span class="template-badge">${escapeHtml(tpl.badge)}</span>` : ""}</span>`;
    btn.addEventListener("click", () => cloneTemplate(tpl));
    els.templateList.appendChild(btn);
  });
}

function instantiateTemplateNodes(templateNodes) {
  return templateNodes.map((node) => ({
    ...node,
    id: crypto.randomUUID(),
    config: node.config ? { ...node.config } : {},
  }));
}

async function cloneTemplate(template, opts = {}) {
  const name = opts.rename || template.name;
  const description = template.description;
  const tplNodes = instantiateTemplateNodes(template.nodes);
  const tplConnections = template.connections.map(([f, t]) => [f, t]);

  let id = crypto.randomUUID();
  if (connected) {
    try {
      const d = await (await apiFetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, nodes: tplNodes, connections: tplConnections }),
      })).json();
      id = d.id;
      if (d.warnings?.length) addChatMessage("bot", `Warnings: ${d.warnings.join(" ")}`);
    } catch (err) {
      addChatMessage("bot", err.message);
      return;
    }
  }
  if (!connected) {
    localDb.push({ id, name, description, nodes: tplNodes, connections: tplConnections, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    saveLocalDb();
  }

  currentWorkflowId = id;
  nodes = tplNodes;
  connections = tplConnections;
  selectedNodeId = nodes[0]?.id ?? null;
  executionResults = {};
  webhookInfo = null;
  els.flowTitle.textContent = name;
  clearRun();
  if (!opts.skipArrange) autoArrange();
  renderFlow();
  await loadWorkflowList();
  if (!opts.silent) addChatMessage("bot", `Deployed "${name}" — configure credentials and endpoints before execution.`);
  return id;
}

async function createGuidedWorkflow() {
  const guided = WORKFLOW_TEMPLATES.find((t) => t.id === "api-pipeline");
  if (guided) {
    await cloneTemplate({
      ...guided,
      name: "Onboarding Pipeline",
      description: "Standard API ingest pipeline — configure credentials before first run.",
    });
  } else {
    await createWorkflow("Onboarding Pipeline", "Standard API ingest pipeline");
  }
  addChatMessage("bot", "Pipeline deployed. Add credentials in the vault, link them in node inspector, then execute.");
}

function renderFlow() {
  els.nodes.innerHTML = "";
  const countLabel = `${nodes.length} ${nodes.length === 1 ? "node" : "nodes"}`;
  els.nodeCount.textContent = countLabel;
  if (els.nodeCountMeta) els.nodeCountMeta.textContent = countLabel;

  nodes.forEach((item) => {
    const card = document.createElement("article");
    const spawnClass = item.id === spawnNodeId ? " node-spawn" : "";
    card.className = `node${item.id === selectedNodeId ? " selected" : ""}${spawnClass}`;
    card.style.setProperty("--spawn-x", `${item.x}px`);
    card.style.setProperty("--spawn-y", `${item.y}px`);
    card.style.transform = `translate(${item.x}px, ${item.y}px)`;
    card.dataset.id = item.id;
    const result = executionResults[item.id];
    const hasResult = result && (result.output || result.error);
    card.innerHTML = `
      <div class="node-icon" style="background:${item.color}">${item.icon || item.type.slice(0, 2).toUpperCase()}</div>
      <div>
        <div class="node-kicker">${escapeHtml(item.type)}</div>
        <h3>${escapeHtml(item.title)}</h3>
        ${hasResult ? `<div class="node-result ${result.error ? 'result-error' : 'result-success'}">
          ${result.error ? 'Error: ' + escapeHtml(friendlyError(result.error, { nodeName: item.title })) : 'Output: ' + escapeHtml(JSON.stringify(result.output).slice(0, 120))}
        </div>` : `<p>${escapeHtml(item.notes || item.type)}</p>`}
        <div class="node-footer">
          <span>${escapeHtml(item.channel || "")}</span>
          <span class="node-port"></span>
        </div>
      </div>
      <div class="node-handles">
        <span class="node-handle node-handle-input" data-node-id="${item.id}"></span>
        <span class="node-handle node-handle-output" data-node-id="${item.id}"></span>
      </div>
    `;
    card.addEventListener("pointerdown", startDrag);
    card.addEventListener("click", () => selectNode(item.id));
    els.nodes.appendChild(card);
  });

  renderConnections();
  renderInspector();
  if (spawnNodeId) {
    setTimeout(() => { spawnNodeId = null; }, 450);
  }
}

function renderConnections() {
  els.connections.innerHTML = "";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  grad.setAttribute("id", "flowGradient");
  grad.setAttribute("x1", "0%"); grad.setAttribute("y1", "0%");
  grad.setAttribute("x2", "100%"); grad.setAttribute("y2", "0%");
  const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", "#e8739a");
  const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop2.setAttribute("offset", "50%"); stop2.setAttribute("stop-color", "#b8a9d4");
  const stop3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop3.setAttribute("offset", "100%"); stop3.setAttribute("stop-color", "#a8d8c8");
  grad.appendChild(stop1); grad.appendChild(stop2); grad.appendChild(stop3);
  defs.appendChild(grad);
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "arrowhead");
  marker.setAttribute("markerWidth", "10");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "3.5");
  marker.setAttribute("orient", "auto");
  marker.setAttribute("markerUnits", "strokeWidth");
  const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrowPath.setAttribute("d", "M0 0 L10 3.5 L0 7z");
  arrowPath.setAttribute("fill", "rgba(47,38,52,0.4)");
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  els.connections.appendChild(defs);

  connections.forEach(([fromIndex, toIndex]) => {
    const from = nodes[fromIndex];
    const to = nodes[toIndex];
    if (!from || !to) return;
    const startX = from.x + NODE_WIDTH;
    const startY = from.y + NODE_MID_Y;
    const endX = to.x;
    const endY = to.y + NODE_MID_Y;
    const curve = Math.max(110, Math.abs(endX - startX) * 0.44);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "connection-line");
    path.setAttribute("d", `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`);
    path.setAttribute("marker-end", "url(#arrowhead)");
    path.style.pointerEvents = "stroke";
    if (lastConnectedPair && lastConnectedPair[0] === fromIndex && lastConnectedPair[1] === toIndex) {
      path.classList.add("just-connected");
      setTimeout(() => path.classList.remove("just-connected"), 420);
      lastConnectedPair = null;
    }
    path.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = connections.findIndex(([f, t]) => f === fromIndex && t === toIndex);
      if (idx >= 0) { connections.splice(idx, 1); clearRun(); renderFlow(); saveWorkflow(); }
    });
    els.connections.appendChild(path);
  });
}

function renderInspector() {
  const selected = nodes.find((item) => item.id === selectedNodeId);
  els.inspectorEmpty.classList.toggle("hidden", Boolean(selected));
  els.inspectorForm.classList.toggle("hidden", !selected);
  if (!selected) return;

  els.nodeName.value = selected.title || "";
  els.nodeChannel.value = selected.channel || "";
  els.nodeNotes.value = selected.notes || "";
  els.nodePriority.value = selected.priority || "Normal";
  els.nodeMode.value = selected.mode || "Manual";

  // Render node-specific config
  const bt = blockTypes.find(b => b.type === selected.type);
  if (bt && bt.config && bt.config.length > 0) {
    els.nodeConfig.innerHTML = bt.config.map(cfg => {
      const val = (selected.config || {})[cfg.key] ?? cfg.default ?? "";
      if (cfg.type === "select") {
        const opts = (cfg.options || []).map(o => `<option value="${o}"${val === o ? " selected" : ""}>${o}</option>`).join("");
        return `<label>${cfg.label}<select class="node-cfg" data-key="${cfg.key}">${opts}</select></label>`;
      }
      if (cfg.type === "number") {
        return `<label>${cfg.label}<input type="number" class="node-cfg" data-key="${cfg.key}" value="${val}" /></label>`;
      }
      if (cfg.type === "boolean") {
        const isTrue = val === true || val === "true";
        return `<label>${cfg.label}<select class="node-cfg" data-key="${cfg.key}"><option value="true"${isTrue ? " selected" : ""}>Yes</option><option value="false"${!isTrue ? " selected" : ""}>No</option></select></label>`;
      }
      if (cfg.type === "credential") {
        const filtered = credentialList.filter((c) => !cfg.credentialTypes || cfg.credentialTypes.includes(c.type));
        const opts = filtered.map((c) => `<option value="${c.id}"${val === c.id ? " selected" : ""}>${escapeHtml(c.name)} (${c.type})</option>`).join("");
        return `<label>${cfg.label}<select class="node-cfg" data-key="${cfg.key}"><option value="">— Select credential —</option>${opts}</select></label>`;
      }
      if (cfg.type === "code") {
        return `<label>${cfg.label}<textarea class="node-cfg code-cfg" data-key="${cfg.key}" rows="4">${escapeHtml(String(val))}</textarea></label>`;
      }
      return `<label>${cfg.label}<input type="text" class="node-cfg" data-key="${cfg.key}" value="${escapeHtml(String(val))}" /></label>`;
    }).join("");
    els.nodeConfig.style.display = "";
    // Add change listeners
    els.nodeConfig.querySelectorAll(".node-cfg").forEach(el => {
      el.addEventListener("change", () => updateNodeConfig());
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.addEventListener("input", () => updateNodeConfig());
      }
    });
  } else {
    els.nodeConfig.innerHTML = "";
    els.nodeConfig.style.display = "none";
  }

  // Show webhook URL if applicable
  const whEl = document.querySelector("#webhookInfo");
  if (selected.type === "webhook" && webhookInfo) {
    if (!whEl) {
      const div = document.createElement("div");
      div.id = "webhookInfo";
      div.className = "webhook-url";
      const url = `${window.location.origin}/webhook/${webhookInfo.path}`;
      div.innerHTML = `<label>Webhook URL<input type="text" readonly value="${url}" /></label><p class="webhook-hint">Signed requests require header <code>X-RoseOps-Signature: sha256=&lt;hmac&gt;</code></p><button type="button" class="ghost-button" id="copyWebhook">Copy URL</button><button type="button" class="ghost-button" id="rotateWebhook">Rotate Secret</button>`;
      div.querySelector("#copyWebhook").addEventListener("click", () => navigator.clipboard.writeText(url));
      div.querySelector("#rotateWebhook").addEventListener("click", async () => {
        try {
          const r = await (await apiFetch(`/api/webhooks/${currentWorkflowId}/rotate-secret`, { method: "POST" })).json();
          addChatMessage("bot", "Webhook secret rotated. Update your sender configuration.");
          if (r.secret) addChatMessage("bot", `New secret: ${r.secret.slice(0, 8)}…`);
        } catch (err) { addChatMessage("bot", err.message); }
      });
      els.inspectorForm.appendChild(div);
    }
  } else if (whEl) {
    whEl.remove();
  }
}

function updateNodeConfig() {
  const selected = nodes.find((item) => item.id === selectedNodeId);
  if (!selected) return;
  if (!selected.config) selected.config = {};
  els.nodeConfig.querySelectorAll(".node-cfg").forEach(el => {
    selected.config[el.dataset.key] = el.value;
  });
  saveWorkflow();
}

function addBlock(type, opts = {}) {
  const bt = blockTypes.find(b => b.type === type);
  const last = nodes[nodes.length - 1];
  const nextX = opts.x ?? (last ? Math.min(last.x + 390, 1220) : 120);
  const nextY = opts.y ?? (last ? Math.min(last.y + 95, 600) : 150);
  const defaultConfig = {};
  (bt?.config || []).forEach((cfg) => { if (cfg.default !== undefined) defaultConfig[cfg.key] = cfg.default; });
  const added = {
    id: crypto.randomUUID(),
    type,
    title: bt?.name || type,
    channel: bt?.defaults?.channel || "",
    notes: bt?.config?.find(c => c.key === "url" || c.key === "webhookUrl" || c.key === "scriptUrl") ? "Configure in the inspector →" : `${bt?.name || type} node`,
    x: nextX,
    y: nextY,
    icon: bt?.icon || type.slice(0, 2).toUpperCase(),
    color: bt?.color || "#888",
    priority: bt?.defaults?.priority || "Normal",
    mode: bt?.defaults?.mode || "Auto",
    config: defaultConfig,
  };
  const fromIndex = Math.max(nodes.length - 1, 0);
  const autoConnect = opts.autoConnect !== false;
  nodes.push(added);
  if (autoConnect && nodes.length > 1) {
    connections.push([fromIndex, nodes.length - 1]);
    lastConnectedPair = [fromIndex, nodes.length - 1];
  }
  spawnNodeId = added.id;
  selectedNodeId = added.id;
  clearRun();
  renderFlow();
  saveWorkflow();
  return added;
}

function selectNode(id) {
  selectedNodeId = id;
  renderFlow();
}

function startDrag(event) {
  if (event.target.closest(".node-handle")) return;
  const card = event.currentTarget;
  const selected = nodes.find((item) => item.id === card.dataset.id);
  if (!selected) return;
  selectedNodeId = selected.id;
  dragState = { id: selected.id, offsetX: event.clientX - selected.x, offsetY: event.clientY - selected.y };
  card.setPointerCapture(event.pointerId);
  window.addEventListener("pointermove", dragNode);
  window.addEventListener("pointerup", stopDrag, { once: true });
  renderFlow();
}

function dragNode(event) {
  if (!dragState) return;
  const selected = nodes.find((item) => item.id === dragState.id);
  if (!selected) return;
  selected.x = clamp(event.clientX - dragState.offsetX, 24, 1220);
  selected.y = clamp(event.clientY - dragState.offsetY, 70, 700);
  const card = els.nodes.querySelector(`[data-id="${selected.id}"]`);
  if (card) card.style.transform = `translate(${selected.x}px, ${selected.y}px)`;
  renderConnections();
}

function stopDrag() {
  dragState = null;
  window.removeEventListener("pointermove", dragNode);
  saveWorkflow();
}

function getHandlePosition(nodeId, type) {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const nodesRect = els.nodes.getBoundingClientRect();
  if (type === "output") {
    return { x: node.x + NODE_WIDTH, y: node.y + NODE_MID_Y, clientX: nodesRect.left + node.x + NODE_WIDTH, clientY: nodesRect.top + node.y + NODE_MID_Y };
  }
  return { x: node.x, y: node.y + NODE_MID_Y, clientX: nodesRect.left + node.x, clientY: nodesRect.top + node.y + NODE_MID_Y };
}

function startConnectionDrag(event, handle) {
  const nodeId = handle.dataset.nodeId;
  const pos = getHandlePosition(nodeId, "output");
  if (!pos) return;
  connectionDrag = { sourceId: nodeId, startX: pos.x, startY: pos.y };
  const temp = document.createElementNS("http://www.w3.org/2000/svg", "path");
  temp.setAttribute("class", "connection-dragging");
  els.connections.appendChild(temp);
  document.querySelectorAll(".node-handle-output").forEach((h) => (h.style.pointerEvents = "none"));
  handle.setPointerCapture(event.pointerId);
  window.addEventListener("pointermove", moveConnectionDrag);
  window.addEventListener("pointerup", endConnectionDrag, { once: true });
}

function moveConnectionDrag(event) {
  if (!connectionDrag) return;
  const temp = els.connections.querySelector(".connection-dragging");
  if (!temp) return;
  const nodesRect = els.nodes.getBoundingClientRect();
  const mx = event.clientX - nodesRect.left;
  const my = event.clientY - nodesRect.top;
  const curve = Math.max(60, Math.abs(mx - connectionDrag.startX) * 0.4);
  temp.setAttribute("d", `M ${connectionDrag.startX} ${connectionDrag.startY} C ${connectionDrag.startX + curve} ${connectionDrag.startY}, ${mx - curve} ${my}, ${mx} ${my}`);
  document.querySelectorAll(".node-handle-input").forEach((h) => h.classList.remove("drag-over"));
  const el = document.elementFromPoint(event.clientX, event.clientY);
  let inputHandle = el?.closest(".node-handle-input");
  if (!inputHandle) {
    let closest = null;
    let closestDist = 36;
    document.querySelectorAll(".node-handle-input").forEach((h) => {
      if (h.dataset.nodeId === connectionDrag.sourceId) return;
      const rect = h.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(event.clientX - cx, event.clientY - cy);
      if (dist < closestDist) { closestDist = dist; closest = h; }
    });
    inputHandle = closest;
  }
  if (inputHandle && inputHandle.dataset.nodeId !== connectionDrag.sourceId) {
    inputHandle.classList.add("drag-over");
    connectionDrag.snapTarget = inputHandle.dataset.nodeId;
  } else {
    connectionDrag.snapTarget = null;
  }
}

function endConnectionDrag(event) {
  const temp = els.connections.querySelector(".connection-dragging");
  if (temp) temp.remove();
  document.querySelectorAll(".node-handle-input").forEach((h) => h.classList.remove("drag-over"));
  document.querySelectorAll(".node-handle-output").forEach((h) => (h.style.pointerEvents = ""));
  if (connectionDrag) {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    let inputHandle = el?.closest(".node-handle-input");
    if (!inputHandle && connectionDrag.snapTarget) {
      inputHandle = document.querySelector(`.node-handle-input[data-node-id="${connectionDrag.snapTarget}"]`);
    }
    if (inputHandle) {
      const targetId = inputHandle.dataset.nodeId;
      const sourceIdx = nodes.findIndex((n) => n.id === connectionDrag.sourceId);
      const targetIdx = nodes.findIndex((n) => n.id === targetId);
      if (sourceIdx >= 0 && targetIdx >= 0 && sourceIdx !== targetIdx) {
        const exists = connections.some(([f, t]) => f === sourceIdx && t === targetIdx);
        if (!exists) {
          connections.push([sourceIdx, targetIdx]);
          lastConnectedPair = [sourceIdx, targetIdx];
          clearRun();
          renderFlow();
          saveWorkflow();
        }
      }
    }
    connectionDrag = null;
  }
  window.removeEventListener("pointermove", moveConnectionDrag);
}

function updateSelected(field, value) {
  const selected = nodes.find((item) => item.id === selectedNodeId);
  if (!selected) return;
  selected[field] = value;
  clearRun();
  renderFlow();
  saveWorkflow();
}

function deleteSelected() {
  const selectedIndex = nodes.findIndex((item) => item.id === selectedNodeId);
  if (selectedIndex < 0) return;
  nodes.splice(selectedIndex, 1);
  connections = connections.filter(([from, to]) => from !== selectedIndex && to !== selectedIndex).map(([from, to]) => [from > selectedIndex ? from - 1 : from, to > selectedIndex ? to - 1 : to]);
  selectedNodeId = nodes[Math.min(selectedIndex, nodes.length - 1)]?.id ?? null;
  clearRun();
  renderFlow();
  saveWorkflow();
}

function autoArrange() {
  const columns = 3;
  nodes.forEach((item, index) => {
    item.x = 90 + (index % columns) * 390;
    item.y = 140 + Math.floor(index / columns) * 250;
  });
  clearRun();
  renderFlow();
  saveWorkflow();
}

async function runFlow() {
  if (!currentWorkflowId) return;
  if (!connected) {
    addChatMessage("bot", "Start the server with 'npm start' to execute workflows");
    return;
  }
  clearRun(false);
  els.runState.textContent = "Starting...";
  try {
    await apiFetch(`/api/workflows/${currentWorkflowId}/execute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  } catch (err) {
    els.runState.textContent = "Error";
    addChatMessage("bot", `Execution error: ${err.message}`);
  }
}

function clearRun(resetState = true) {
  if (runTimer) clearInterval(runTimer);
  runTimer = null;
  els.runLog.innerHTML = "";
  if (resetState) els.runState.textContent = "Idle";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function addChatMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `chat-msg chat-msg-${role}`;
  msg.textContent = text;
  els.chatLog.appendChild(msg);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function handleChatCommand(raw) {
  const text = raw.trim();
  if (!text) return;
  addChatMessage("user", text);
  const lower = text.toLowerCase();

  if (lower === "run" || lower === "go" || lower === "start") {
    runFlow();
    addChatMessage("bot", "Executing workflow...");
  } else if (lower === "reset" || lower === "clear") {
    if (currentWorkflowId) loadWorkflow(currentWorkflowId);
    addChatMessage("bot", "Flow reset.");
  } else if (lower === "arrange" || lower === "layout") {
    autoArrange();
    addChatMessage("bot", "Nodes arranged.");
  } else if (lower.startsWith("add ")) {
    const query = lower.slice(4).trim();
    const match = blockTypes.find(b => b.type === query || b.name.toLowerCase() === query);
    if (match) { addBlock(match.type); addChatMessage("bot", `Added ${match.name}.`); }
    else { addChatMessage("bot", `Unknown. Try: add http / add code / add delay / add webhook / add schedule / add email`); }
  } else if (lower === "help" || lower === "?") {
    addChatMessage("bot", "Commands: run / reset / arrange / add [type] / help | Drag nodes from palette · connect handles · clone templates in sidebar");
  } else {
    addChatMessage("bot", `Unknown. Type "help".`);
  }
}

// ===== Modal & Credentials =====
function showModal(title, bodyHtml) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = bodyHtml;
  els.modal.classList.remove("hidden");
}

function closeModal() {
  els.modal.classList.add("hidden");
  els.modalBody.innerHTML = "";
  els.modal.querySelector(".modal-card")?.classList.remove("modal-wide");
}

function showWorkflowPickerModal() {
  els.modal.querySelector(".modal-card")?.classList.add("modal-wide");
  const starterCards = WORKFLOW_TEMPLATES.length
    ? WORKFLOW_TEMPLATES.map((tpl) => `
    <button type="button" class="picker-card" data-starter-id="${tpl.id}">
      <span class="tile-icon" style="background:${tpl.color}">${tpl.icon}</span>
      <span><strong>${escapeHtml(tpl.name)}</strong><span>${escapeHtml(tpl.description)}</span>${tpl.badge ? `<span class="template-badge">${escapeHtml(tpl.badge)}</span>` : ""}</span>
    </button>`).join("")
    : `<p class="onboarding-subtitle">Starters didn't load — refresh the page or check your API connection.</p>`;

  showModal("Pick a Workflow", `
    <p class="onboarding-subtitle">Choose a starter to add to your library, or start blank.</p>
    <div class="picker-grid">${starterCards}</div>
    <div class="picker-divider"><span>or</span></div>
    <form id="blankWorkflowForm" class="credential-form-grid">
      <label>Blank workflow name<input id="wfName" autocomplete="off" placeholder="Untitled" /></label>
      <label>Description<textarea id="wfDesc" rows="2" placeholder="Optional"></textarea></label>
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-close-modal>Cancel</button>
        <button type="submit" class="ghost-button">Empty canvas</button>
      </div>
    </form>`);

  els.modalBody.querySelectorAll("[data-starter-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === btn.dataset.starterId);
      if (!tpl) return;
      closeModal();
      await cloneTemplate(tpl);
    });
  });

  document.getElementById("blankWorkflowForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("wfName").value.trim() || "Untitled";
    const desc = document.getElementById("wfDesc").value.trim();
    closeModal();
    await createWorkflow(name, desc);
    addChatMessage("bot", `Workflow "${name}" created.`);
  });
}

function credentialFieldsForType(type) {
  const fields = {
    discord_webhook: `<label>Webhook URL<input type="url" id="credUrl" required /></label>`,
    webhook_url: `<label>Webhook URL<input type="url" id="credUrl" required /></label>`,
    github_token: `<label>Personal Access Token<input type="password" id="credToken" required autocomplete="off" /></label>`,
    bearer_token: `<label>Bearer Token<input type="password" id="credToken" required autocomplete="off" /></label>`,
    api_key: `<label>Header Name<input id="credHeader" value="X-API-Key" required /><label>API Key Value<input type="password" id="credValue" required autocomplete="off" /></label>`,
    smtp: `<label>Host<input id="credHost" required /><label>Port<input type="number" id="credPort" value="587" /><label>User<input id="credUser" required /><label>Password<input type="password" id="credPass" required autocomplete="off" /><label>From<input id="credFrom" /></label>`,
    google_service_account: `<label>Service Account JSON<textarea id="credJson" rows="6" required placeholder='{"type":"service_account",...}'></textarea></label>`,
  };
  return fields[type] || `<label>Value<input id="credValue" required /></label>`;
}

function collectCredentialData(type) {
  switch (type) {
    case "discord_webhook":
    case "webhook_url": return { url: document.getElementById("credUrl").value.trim() };
    case "github_token":
    case "bearer_token": return { token: document.getElementById("credToken").value.trim() };
    case "api_key": return { header: document.getElementById("credHeader").value.trim(), value: document.getElementById("credValue").value.trim() };
    case "smtp": return {
      host: document.getElementById("credHost").value.trim(),
      port: parseInt(document.getElementById("credPort").value, 10) || 587,
      user: document.getElementById("credUser").value.trim(),
      pass: document.getElementById("credPass").value,
      from: document.getElementById("credFrom").value.trim(),
      secure: false,
    };
    case "google_service_account": return JSON.parse(document.getElementById("credJson").value);
    default: return { value: document.getElementById("credValue").value };
  }
}

function showNewCredentialModal() {
  if (!connected) { addChatMessage("bot", "Server required to manage credentials."); return; }
  showModal("Add Credential", `
    <form id="newCredForm" class="credential-form-grid">
      <label>Name<input id="credName" required placeholder="Production Discord Webhook" /></label>
      <label>Type<select id="credType">
        <option value="discord_webhook">Discord Webhook</option>
        <option value="github_token">GitHub Token</option>
        <option value="bearer_token">Bearer Token</option>
        <option value="api_key">API Key</option>
        <option value="smtp">SMTP</option>
        <option value="google_service_account">Google Service Account</option>
        <option value="webhook_url">Webhook URL</option>
      </select></label>
      <div id="credFields">${credentialFieldsForType("discord_webhook")}</div>
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-close-modal>Cancel</button>
        <button type="submit" class="primary-button">Store Encrypted</button>
      </div>
    </form>`);
  const typeSelect = document.getElementById("credType");
  typeSelect.addEventListener("change", () => {
    document.getElementById("credFields").innerHTML = credentialFieldsForType(typeSelect.value);
  });
  document.getElementById("newCredForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const type = typeSelect.value;
      const data = collectCredentialData(type);
      await apiFetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: document.getElementById("credName").value.trim(), type, data }),
      });
      closeModal();
      await loadCredentials();
      renderInspector();
      addChatMessage("bot", "Credential stored in encrypted vault.");
    } catch (err) {
      addChatMessage("bot", err.message);
    }
  });
}

function showCredentialDetail(id) {
  const cred = credentialList.find((c) => c.id === id);
  if (!cred) return;
  showModal(cred.name, `
    <p class="onboarding-subtitle">Type: <strong>${escapeHtml(cred.type)}</strong><br>Stored AES-256-GCM encrypted. Secrets are never returned to the client.</p>
    <div class="modal-actions">
      <button type="button" class="ghost-button" data-close-modal>Close</button>
      <button type="button" class="danger-button" id="deleteCred">Delete</button>
    </div>`);
  document.getElementById("deleteCred").addEventListener("click", async () => {
    try {
      await apiFetch(`/api/credentials/${id}`, { method: "DELETE" });
      closeModal();
      await loadCredentials();
      renderInspector();
      addChatMessage("bot", "Credential removed.");
    } catch (err) { addChatMessage("bot", err.message); }
  });
}

// ===== Onboarding =====
function showOnboarding() {
  onboardingStep = 0;
  els.onboarding.classList.remove("hidden");
  renderOnboardingStep();
}

function completeOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, "1");
  els.onboarding.classList.add("hidden");
}

function renderOnboardingProgress() {
  els.onboardingProgress.innerHTML = "";
  for (let i = 0; i < ONBOARDING_STEPS; i++) {
    const dot = document.createElement("div");
    dot.className = "onboarding-dot";
    if (i < onboardingStep) dot.classList.add("done");
    if (i === onboardingStep) dot.classList.add("active");
    els.onboardingProgress.appendChild(dot);
  }
}

function renderOnboardingStep() {
  renderOnboardingProgress();
  const content = els.onboardingContent;

  if (onboardingStep === 0) {
    content.innerHTML = `
      <div class="onboarding-hero">
        <div class="onboarding-hero-mark">✿</div>
        <h2 class="onboarding-title" id="onboardingTitle">RoseOps Enterprise</h2>
        <p class="onboarding-subtitle">Production workflow automation with encrypted credentials, audit logging, versioned workflows, and signed webhooks.</p>
      </div>
      <div class="onboarding-actions">
        <button type="button" class="primary-button" data-action="next">Continue →</button>
      </div>`;
  } else if (onboardingStep === 1) {
    content.innerHTML = `
      <div class="onboarding-hero">
        <h2 class="onboarding-title" id="onboardingTitle">Operations model</h2>
        <p class="onboarding-subtitle">Designed for production teams running audited, credential-backed automations.</p>
      </div>
      <div class="onboarding-steps">
        <div class="onboarding-step"><span class="onboarding-step-num">1</span><span><strong>Vault credentials</strong><span>Store API keys, tokens, and SMTP config encrypted — never in node plaintext.</span></span></div>
        <div class="onboarding-step"><span class="onboarding-step-num">2</span><span><strong>Build validated DAGs</strong><span>Compose nodes, connect handles. Cycles and invalid config are rejected at save.</span></span></div>
        <div class="onboarding-step"><span class="onboarding-step-num">3</span><span><strong>Execute with audit trail</strong><span>Queued execution, retries, per-node telemetry, full audit log.</span></span></div>
      </div>
      <div class="onboarding-actions">
        <button type="button" class="ghost-button" data-action="back">Back</button>
        <button type="button" class="primary-button" data-action="next">Got it →</button>
      </div>`;
  } else {
    content.innerHTML = `
      <div class="onboarding-hero">
        <h2 class="onboarding-title" id="onboardingTitle">Deployment path</h2>
        <p class="onboarding-subtitle">Select your initial workspace configuration.</p>
      </div>
      <div class="onboarding-choices">
        <button type="button" class="onboarding-choice" data-action="guided">
          <span class="onboarding-choice-icon">✦</span>
          <span><strong>Standard API pipeline</strong><span>Production template with ingest, transform, and credential slots.</span></span>
        </button>
        <button type="button" class="onboarding-choice" data-action="template">
          <span class="onboarding-choice-icon">◇</span>
          <span><strong>Operations templates</strong><span>Incident notify, compliance watch, audit logging — clone and configure.</span></span>
        </button>
        <button type="button" class="onboarding-choice" data-action="scratch">
          <span class="onboarding-choice-icon">+</span>
          <span><strong>Empty workflow</strong><span>Start from a validated blank workflow.</span></span>
        </button>
      </div>
      <div class="onboarding-actions">
        <button type="button" class="ghost-button" data-action="back">Back</button>
      </div>`;
  }

  content.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      if (action === "next") { onboardingStep++; renderOnboardingStep(); }
      else if (action === "back") { onboardingStep = Math.max(0, onboardingStep - 1); renderOnboardingStep(); }
      else if (action === "guided") { completeOnboarding(); await createGuidedWorkflow(); }
      else if (action === "template") { completeOnboarding(); addChatMessage("bot", "Select an operations template from the sidebar. Configure credentials before execution."); }
      else if (action === "scratch") { completeOnboarding(); await createWorkflow("Untitled", ""); addChatMessage("bot", "Empty workflow created. Add credentials to the vault first."); }
    });
  });
}

// ===== Palette drag & drop =====
function startPaletteDrag(event, block) {
  if (event.button !== 0) return;
  paletteDrag = {
    type: block.type,
    block,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    ghost: null,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  window.addEventListener("pointermove", movePaletteDrag);
  window.addEventListener("pointerup", endPaletteDrag, { once: true });
}

function movePaletteDrag(event) {
  if (!paletteDrag) return;
  const dx = event.clientX - paletteDrag.startX;
  const dy = event.clientY - paletteDrag.startY;
  if (!paletteDrag.moved && Math.hypot(dx, dy) < 8) return;
  paletteDrag.moved = true;

  if (!paletteDrag.ghost) {
    paletteDrag.ghost = document.createElement("div");
    paletteDrag.ghost.className = "palette-ghost";
    paletteDrag.ghost.innerHTML = `<span class="tile-icon" style="background:${paletteDrag.block.color}">${paletteDrag.block.icon}</span><span><strong>${paletteDrag.block.name}</strong></span>`;
    document.body.appendChild(paletteDrag.ghost);
    document.querySelectorAll(".palette-card").forEach((c) => {
      if (c.dataset.type === paletteDrag.type) c.classList.add("dragging-source");
    });
    els.board.classList.add("drop-active");
  }

  paletteDrag.ghost.style.left = `${event.clientX}px`;
  paletteDrag.ghost.style.top = `${event.clientY}px`;

  const overBoard = els.board.contains(document.elementFromPoint(event.clientX, event.clientY));
  els.board.classList.toggle("drop-target", overBoard);
}

function endPaletteDrag(event) {
  window.removeEventListener("pointermove", movePaletteDrag);
  if (paletteDrag?.ghost) paletteDrag.ghost.remove();
  document.querySelectorAll(".palette-card").forEach((c) => c.classList.remove("dragging-source"));
  els.board.classList.remove("drop-active", "drop-target");

  if (paletteDrag?.moved) {
    const boardRect = els.board.getBoundingClientRect();
    if (
      event.clientX >= boardRect.left && event.clientX <= boardRect.right &&
      event.clientY >= boardRect.top && event.clientY <= boardRect.bottom
    ) {
      const x = clamp(event.clientX - boardRect.left + els.board.scrollLeft - 165, 24, 1220);
      const y = clamp(event.clientY - boardRect.top + els.board.scrollTop - 75, 70, 700);
      addBlock(paletteDrag.type, { x, y, autoConnect: false });
      addChatMessage("bot", `Dropped ${paletteDrag.block.name} on the canvas.`);
    }
  }

  paletteDrag = null;
}

function setupPaletteDropZone() {
  els.board.addEventListener("dragover", (e) => e.preventDefault());
}

// ===== Friendly errors =====
function friendlyError(raw, ctx = {}) {
  const msg = String(raw || "Something went wrong");
  const name = ctx.nodeName ? `${ctx.nodeName}: ` : "";

  if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("getaddrinfo"))
    return `${name}Couldn't reach that URL — double-check the address and make sure the server is running.`;
  if (msg.includes("ETIMEDOUT") || msg.toLowerCase().includes("timeout"))
    return `${name}Request timed out — the server took too long. Try again or check the URL.`;
  if (msg.includes("Unexpected token") && msg.includes("JSON"))
    return `${name}Invalid JSON in your config — look for missing quotes or trailing commas.`;
  if (msg.includes("Invalid cron") || msg.includes("cron expression"))
    return `${name}Invalid cron expression — try */5 * * * * (every 5 minutes).`;
  if (msg.includes("Credential not found") || msg.includes("credential"))
    return `${name}Link a valid credential from the vault in the node inspector.`;
  if (msg.includes("SMTP"))
    return `${name}Configure an SMTP credential in the vault.`;
  if (msg.includes("Validation failed"))
    return msg;
  if (msg.includes("401") || msg.includes("403"))
    return `${name}Authentication failed — check your API token or credentials.`;
  if (msg.includes("404"))
    return `${name}Not found — the URL or resource doesn't exist. Double-check the endpoint.`;
  if (msg.startsWith(name) || msg.includes(": "))
    return msg;
  return name ? `${name}${msg}` : msg;
}

// ===== BOOT =====
init();
