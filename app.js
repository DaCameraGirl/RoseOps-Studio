const API = "http://localhost:3099";
const NODE_WIDTH = 340;
const NODE_MID_Y = 81;

let blockTypes = [];
let templates = [];
let currentWorkflowId = null;
let nodes = [];
let connections = [];
let selectedNodeId = null;
let dragState = null;
let connectionDrag = null;
let executionResults = {};
let webhookInfo = null;
let saveTimeout = null;

const els = {
  templateList: document.querySelector("#templateList"),
  blockPalette: document.querySelector("#blockPalette"),
  flowTitle: document.querySelector("#flowTitle"),
  nodeCount: document.querySelector("#nodeCount"),
  board: document.querySelector("#board"),
  nodes: document.querySelector("#nodes"),
  connections: document.querySelector("#connections"),
  inspectorEmpty: document.querySelector("#inspectorEmpty"),
  inspectorForm: document.querySelector("#inspectorForm"),
  nodeName: document.querySelector("#nodeName"),
  nodeChannel: document.querySelector("#nodeChannel"),
  nodeNotes: document.querySelector("#nodeNotes"),
  nodePriority: document.querySelector("#nodePriority"),
  nodeMode: document.querySelector("#nodeMode"),
  deleteNode: document.querySelector("#deleteNode"),
  resetFlow: document.querySelector("#resetFlow"),
  autoArrange: document.querySelector("#autoArrange"),
  runFlow: document.querySelector("#runFlow"),
  runLog: document.querySelector("#runLog"),
  runState: document.querySelector("#runState"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  chatLog: document.querySelector("#chatLog"),
  workflowList: document.querySelector("#workflowList"),
  newWorkflow: document.querySelector("#newWorkflow"),
  nodeConfig: document.querySelector("#nodeConfig"),
};

async function init() {
  await loadBlockTypes();
  renderPalette();
  await loadWorkflowList();
  setupSSE();
}

async function loadBlockTypes() {
  try {
    const res = await fetch(`${API}/api/node-types`);
    blockTypes = await res.json();
  } catch {
    blockTypes = [
      { type: "trigger", name: "Trigger", icon: "IN", color: "#ed4f8f", config: [], defaults: {} },
      { type: "http", name: "HTTP Request", icon: "HTTP", color: "#6f7dfb", config: [], defaults: {} },
      { type: "code", name: "Code", icon: "</>", color: "#13a68f", config: [], defaults: {} },
      { type: "delay", name: "Delay", icon: "WAIT", color: "#f3ae3d", config: [], defaults: {} },
      { type: "filter", name: "Filter", icon: "IF", color: "#2f2634", config: [], defaults: {} },
      { type: "webhook", name: "Webhook", icon: "WEB", color: "#ed4f8f", config: [], defaults: {} },
      { type: "schedule", name: "Schedule", icon: "CLOCK", color: "#ed4f8f", config: [], defaults: {} },
      { type: "email", name: "Send Email", icon: "@", color: "#c47bf0", config: [], defaults: {} },
    ];
  }
}

function setupSSE() {
  const evt = new EventSource(`${API}/api/events`);
  evt.onmessage = (e) => {
    const data = JSON.parse(e.data);
    switch (data.type) {
      case "execution_start":
        els.runState.textContent = "Running";
        els.runLog.innerHTML = `<li class="active">Workflow started (${data.trigger})</li>`;
        break;
      case "node_start":
        const li = document.createElement("li");
        li.textContent = `▶ ${data.nodeName}`;
        li.className = "active";
        els.runLog.appendChild(li);
        break;
      case "node_end":
        const last = els.runLog.lastElementChild;
        if (last) { last.className = "completed"; last.textContent = `✓ ${data.nodeName}`; }
        break;
      case "node_error":
        const err = els.runLog.lastElementChild;
        if (err) { err.className = "error"; err.textContent = `✗ ${data.nodeName}: ${data.error}`; }
        break;
      case "execution_end":
        els.runState.textContent = data.status === "success" ? "Complete" : "Error";
        executionResults = data.nodeResults || {};
        if (data.status === "error" && data.error) {
          const e = document.createElement("li");
          e.className = "error";
          e.textContent = `Error: ${data.error}`;
          els.runLog.appendChild(e);
        }
        break;
    }
  };
}

async function loadWorkflowList() {
  try {
    const res = await fetch(`${API}/api/workflows`);
    const workflows = await res.json();
    els.workflowList.innerHTML = "";
    for (const wf of workflows) {
      const btn = document.createElement("button");
      btn.className = `template-card${wf.id === currentWorkflowId ? " active" : ""}`;
      btn.innerHTML = `<span class="tile-icon" style="background:#ed4f8f">${wf.name.slice(0, 2).toUpperCase()}</span><span><strong>${escapeHtml(wf.name)}</strong><span>${escapeHtml(wf.description || "")}</span></span>`;
      btn.addEventListener("click", () => loadWorkflow(wf.id));
      els.workflowList.appendChild(btn);
    }
    if (workflows.length > 0 && !currentWorkflowId) {
      await loadWorkflow(workflows[0].id);
    } else if (workflows.length === 0) {
      await createWorkflow("Release Train", "CI/CD workflow");
    }
  } catch {
    await createWorkflow("Release Train", "CI/CD workflow");
  }
}

async function createWorkflow(name, description) {
  const res = await fetch(`${API}/api/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, nodes: [], connections: [] }),
  });
  const data = await res.json();
  currentWorkflowId = data.id;
  nodes = [];
  connections = [];
  selectedNodeId = null;
  executionResults = {};
  webhookInfo = null;
  els.flowTitle.textContent = name;
  renderFlow();
  await loadWorkflowList();
}

async function loadWorkflow(id) {
  try {
    const res = await fetch(`${API}/api/workflows/${id}`);
    const wf = await res.json();
    currentWorkflowId = wf.id;
    nodes = wf.nodes || [];
    connections = wf.connections || [];
    selectedNodeId = nodes[0]?.id || null;
    executionResults = {};
    els.flowTitle.textContent = wf.name;
    clearRun();
    renderFlow();
    await loadWorkflowList();
    // Load webhook info
    const whRes = await fetch(`${API}/api/webhooks/${id}`);
    if (whRes.ok) {
      const wh = await whRes.json();
      webhookInfo = wh;
    } else {
      webhookInfo = null;
    }
  } catch (err) {
    addChatMessage("bot", `Error loading workflow: ${err.message}`);
  }
}

function saveWorkflow() {
  if (!currentWorkflowId) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await fetch(`${API}/api/workflows/${currentWorkflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, connections }),
      });
    } catch {}
  }, 500);
}

function renderPalette() {
  els.blockPalette.innerHTML = "";
  blockTypes.forEach((block) => {
    const button = document.createElement("button");
    button.className = "palette-card";
    button.innerHTML = `<span class="tile-icon" style="background:${block.color}">${block.icon}</span><span><strong>${block.name}</strong><span>Click to add</span></span>`;
    button.addEventListener("click", () => addBlock(block.type));
    els.blockPalette.appendChild(button);
  });
}

function renderFlow() {
  els.nodes.innerHTML = "";
  els.nodeCount.textContent = `${nodes.length} ${nodes.length === 1 ? "node" : "nodes"}`;

  nodes.forEach((item) => {
    const card = document.createElement("article");
    card.className = `node${item.id === selectedNodeId ? " selected" : ""}`;
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
          ${result.error ? 'Error: ' + escapeHtml(result.error) : 'Output: ' + escapeHtml(JSON.stringify(result.output).slice(0, 120))}
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
}

function renderConnections() {
  els.connections.innerHTML = "";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
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
      div.innerHTML = `<label>Webhook URL<input type="text" readonly value="${window.location.origin}/webhook/${webhookInfo.path}" /><button class="icon-button" onclick="navigator.clipboard.writeText('${window.location.origin}/webhook/${webhookInfo.path}')">Copy</button></label>`;
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

function addBlock(type) {
  const bt = blockTypes.find(b => b.type === type);
  const last = nodes[nodes.length - 1];
  const nextX = last ? Math.min(last.x + 390, 1220) : 120;
  const nextY = last ? Math.min(last.y + 95, 600) : 150;
  const added = {
    id: crypto.randomUUID(),
    type,
    title: bt?.name || type,
    channel: bt?.defaults?.channel || "",
    notes: bt?.config?.find(c => c.key === "url") ? "Configure URL in inspector" : `${bt?.name || type} node`,
    x: nextX,
    y: nextY,
    icon: bt?.icon || type.slice(0, 2).toUpperCase(),
    color: bt?.color || "#888",
    priority: bt?.defaults?.priority || "Normal",
    mode: bt?.defaults?.mode || "Auto",
    config: {},
  };
  const fromIndex = Math.max(nodes.length - 1, 0);
  nodes.push(added);
  if (nodes.length > 1) connections.push([fromIndex, nodes.length - 1]);
  selectedNodeId = added.id;
  clearRun();
  renderFlow();
  saveWorkflow();
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
  const inputHandle = el?.closest(".node-handle-input");
  if (inputHandle && inputHandle.dataset.nodeId !== connectionDrag.sourceId) {
    inputHandle.classList.add("drag-over");
  }
}

function endConnectionDrag(event) {
  const temp = els.connections.querySelector(".connection-dragging");
  if (temp) temp.remove();
  document.querySelectorAll(".node-handle-input").forEach((h) => h.classList.remove("drag-over"));
  document.querySelectorAll(".node-handle-output").forEach((h) => (h.style.pointerEvents = ""));
  if (connectionDrag) {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const inputHandle = el?.closest(".node-handle-input");
    if (inputHandle) {
      const targetId = inputHandle.dataset.nodeId;
      const sourceIdx = nodes.findIndex((n) => n.id === connectionDrag.sourceId);
      const targetIdx = nodes.findIndex((n) => n.id === targetId);
      if (sourceIdx >= 0 && targetIdx >= 0 && sourceIdx !== targetIdx) {
        const exists = connections.some(([f, t]) => f === sourceIdx && t === targetIdx);
        if (!exists) {
          connections.push([sourceIdx, targetIdx]);
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
  clearRun(false);
  els.runState.textContent = "Starting...";
  try {
    await fetch(`${API}/api/workflows/${currentWorkflowId}/execute`, { method: "POST" });
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
    addChatMessage("bot", "Commands: run / reset / arrange / add [type] / help | Drag handles to connect, click lines to delete");
  } else {
    addChatMessage("bot", `Unknown. Type "help".`);
  }
}

// ===== EVENT LISTENERS =====
els.nodeName.addEventListener("input", (e) => updateSelected("title", e.target.value));
els.nodeChannel.addEventListener("change", (e) => updateSelected("channel", e.target.value));
els.nodeNotes.addEventListener("input", (e) => updateSelected("notes", e.target.value));
els.nodePriority.addEventListener("change", (e) => updateSelected("priority", e.target.value));
els.nodeMode.addEventListener("change", (e) => updateSelected("mode", e.target.value));
els.deleteNode.addEventListener("click", deleteSelected);
els.resetFlow.addEventListener("click", () => { if (currentWorkflowId) loadWorkflow(currentWorkflowId); });
els.autoArrange.addEventListener("click", autoArrange);
els.runFlow.addEventListener("click", runFlow);

els.nodes.addEventListener("pointerdown", (event) => {
  const outputHandle = event.target.closest(".node-handle-output");
  if (outputHandle) { event.stopPropagation(); startConnectionDrag(event, outputHandle); }
});

els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = els.chatInput.value;
  els.chatInput.value = "";
  handleChatCommand(value);
});

els.newWorkflow.addEventListener("click", async () => {
  const name = prompt("Workflow name:") || "Untitled";
  const desc = prompt("Description (optional):") || "";
  await createWorkflow(name, desc);
  addChatMessage("bot", `Created "${name}".`);
});

// ===== BOOT =====
init();
