const NODE_WIDTH = 340;
const NODE_MID_Y = 81;

const blockTypes = [
  {
    type: "trigger",
    title: "Trigger",
    channel: "Slack",
    icon: "IN",
    color: "#ed4f8f",
    notes: "Start from webhook, chat command, schedule, or incident signal.",
    priority: "Normal",
    mode: "Auto",
  },
  {
    type: "triage",
    title: "Triage",
    channel: "Linear",
    icon: "TR",
    color: "#6f7dfb",
    notes: "Classify risk, owner, service, and customer impact before work starts.",
    priority: "High",
    mode: "Manual",
  },
  {
    type: "build",
    title: "Build",
    channel: "GitHub",
    icon: "CI",
    color: "#13a68f",
    notes: "Run tests, linting, image build, secrets check, and artifact publish.",
    priority: "Normal",
    mode: "Auto",
  },
  {
    type: "deploy",
    title: "Deploy",
    channel: "Vercel",
    icon: "CD",
    color: "#2f2634",
    notes: "Promote the build with approval, rollout window, and rollback plan.",
    priority: "Critical",
    mode: "Approval",
  },
  {
    type: "observe",
    title: "Observe",
    channel: "Datadog",
    icon: "OB",
    color: "#f3ae3d",
    notes: "Watch SLOs, errors, latency, and alerts before closing the loop.",
    priority: "High",
    mode: "Auto",
  },
];

const templates = [
  {
    id: "release",
    name: "Release Train",
    description: "CI/CD with approval, deploy, and observability.",
    nodes: [
      node("trigger", "PR merged to main", "GitHub", "Watch main for approved merges and tag the deployment candidate.", 90, 150),
      node("build", "Build release artifact", "Docker", "Run tests, build image, scan dependencies, and publish the release artifact.", 480, 95),
      node("triage", "Risk gate", "Linear", "Confirm owner, rollout scope, customer impact, and change window.", 870, 160),
      node("deploy", "Promote to production", "Vercel", "Deploy behind approval with rollback target and release notes attached.", 1220, 115),
      node("observe", "Monitor health window", "Datadog", "Track latency, errors, logs, and alerts for the first 30 minutes.", 1220, 390),
    ],
    connections: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    id: "incident",
    name: "Incident Response",
    description: "Alert intake, comms, mitigation, and postmortem.",
    nodes: [
      node("trigger", "PagerDuty alert", "PagerDuty", "Open the response flow when error budget or uptime alerts fire.", 90, 170),
      node("triage", "Assign commander", "Slack", "Set severity, service owner, comms lead, and customer visibility.", 480, 110),
      node("build", "Mitigation branch", "GitHub", "Patch, test, and package the fastest safe mitigation path.", 870, 185),
      node("deploy", "Hotfix rollout", "Terraform", "Apply the mitigation with rollback notes and change log.", 1220, 120),
      node("observe", "Postmortem capture", "Notion", "Record impact, timeline, prevention work, and owner follow-ups.", 1220, 400),
    ],
    connections: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ],
  },
  {
    id: "founder",
    name: "Founder Ops",
    description: "Ship a product update with metrics and customer loops.",
    nodes: [
      node("trigger", "Feature ready", "Linear", "Start when product, copy, and launch checklist are complete.", 100, 160),
      node("triage", "Launch criteria", "Notion", "Confirm customer segment, success metric, risk, and support owner.", 480, 105),
      node("build", "Prepare campaign", "GitHub", "Package release assets, changelog, demo link, and QA notes.", 870, 175),
      node("deploy", "Publish update", "Email", "Send announcement, update docs, and post release note.", 1220, 125),
      node("observe", "Read signals", "Sheets", "Track activation, replies, errors, signups, and follow-up experiments.", 1220, 400),
    ],
    connections: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ],
  },
  {
    id: "brand",
    name: "Brand Drop",
    description: "Campaign launch with content review and social.",
    nodes: [
      node("trigger", "Campaign ready", "Notion", "Creative assets, copy, and approvals checklist complete.", 100, 160),
      node("triage", "Brand review", "Slack", "Verify tone, visuals, legal disclaimers, and accessibility.", 480, 105),
      node("build", "Schedule posts", "Sheets", "Plan publishing calendar across channels with UTM links.", 870, 175),
      node("deploy", "Publish campaign", "Email", "Push live: social posts, newsletter, landing page update.", 1220, 125),
      node("observe", "Track engagement", "Datadog", "Monitor clicks, conversions, mentions, and sentiment.", 1220, 400),
    ],
    connections: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ],
  },
];

let currentTemplateId = templates[0].id;
let nodes = cloneNodes(templates[0].nodes);
let connections = cloneConnections(templates[0].connections);
let selectedNodeId = null;
let dragState = null;
let connectionDrag = null;
let runTimer = null;

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
};

function node(type, title, channel, notes, x, y) {
  const config = blockTypes.find((block) => block.type === type);
  return {
    id: crypto.randomUUID(),
    type,
    title,
    channel,
    notes,
    x,
    y,
    icon: config.icon,
    color: config.color,
    priority: config.priority,
    mode: config.mode,
  };
}

function cloneNodes(source) {
  return source.map((item) => ({ ...item, id: crypto.randomUUID() }));
}

function cloneConnections(source) {
  return source.map(([from, to]) => [from, to]);
}

function renderTemplates() {
  els.templateList.innerHTML = "";

  templates.forEach((template) => {
    const button = document.createElement("button");
    button.className = `template-card${template.id === currentTemplateId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="tile-icon" style="background:${template.nodes[0].color}">${template.name.slice(0, 2).toUpperCase()}</span>
      <span>
        <strong>${template.name}</strong>
        <span>${template.description}</span>
      </span>
    `;
    button.addEventListener("click", () => loadTemplate(template.id));
    els.templateList.appendChild(button);
  });
}

function renderPalette() {
  els.blockPalette.innerHTML = "";

  blockTypes.forEach((block) => {
    const button = document.createElement("button");
    button.className = "palette-card";
    button.type = "button";
    button.innerHTML = `
      <span class="tile-icon" style="background:${block.color}">${block.icon}</span>
      <span>
        <strong>${block.title}</strong>
        <span>${block.notes}</span>
      </span>
    `;
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
    card.innerHTML = `
      <div class="node-icon" style="background:${item.color}">${item.icon}</div>
      <div>
        <div class="node-kicker">${escapeHtml(item.type)}</div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.notes)}</p>
        <div class="node-footer">
          <span>${escapeHtml(item.channel)}</span>
          <span class="node-port"></span>
        </div>
        <div class="node-meta">
          <span class="meta-chip">${escapeHtml(item.priority ?? "Normal")}</span>
          <span class="meta-chip">${escapeHtml(item.mode ?? "Manual")}</span>
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
    path.setAttribute(
      "d",
      `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`,
    );
    path.setAttribute("marker-end", "url(#arrowhead)");
    path.style.pointerEvents = "stroke";
    path.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = connections.findIndex(([f, t]) => f === fromIndex && t === toIndex);
      if (idx >= 0) {
        connections.splice(idx, 1);
        clearRun();
        renderFlow();
      }
    });
    els.connections.appendChild(path);
  });
}

function renderInspector() {
  const selected = nodes.find((item) => item.id === selectedNodeId);
  els.inspectorEmpty.classList.toggle("hidden", Boolean(selected));
  els.inspectorForm.classList.toggle("hidden", !selected);

  if (!selected) return;
  els.nodeName.value = selected.title;
  els.nodeChannel.value = selected.channel;
  els.nodeNotes.value = selected.notes;
  els.nodePriority.value = selected.priority ?? "Normal";
  els.nodeMode.value = selected.mode ?? "Manual";
}

function loadTemplate(templateId) {
  const template = templates.find((item) => item.id === templateId);
  currentTemplateId = template.id;
  nodes = cloneNodes(template.nodes);
  connections = cloneConnections(template.connections);
  selectedNodeId = nodes[0]?.id ?? null;
  els.flowTitle.textContent = template.name;
  clearRun();
  renderTemplates();
  renderFlow();
}

function addBlock(type) {
  const config = blockTypes.find((block) => block.type === type);
  const last = nodes[nodes.length - 1];
  const nextX = last ? Math.min(last.x + 390, 1220) : 120;
  const nextY = last ? Math.min(last.y + 95, 600) : 150;
  const added = {
    ...config,
    id: crypto.randomUUID(),
    title: config.title,
    x: nextX,
    y: nextY,
  };
  const fromIndex = Math.max(nodes.length - 1, 0);
  nodes.push(added);
  if (nodes.length > 1) connections.push([fromIndex, nodes.length - 1]);
  selectedNodeId = added.id;
  clearRun();
  renderFlow();
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
  dragState = {
    id: selected.id,
    offsetX: event.clientX - selected.x,
    offsetY: event.clientY - selected.y,
  };
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
}

function getHandlePosition(nodeId, type) {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const nodesRect = els.nodes.getBoundingClientRect();
  if (type === "output") {
    return {
      x: node.x + NODE_WIDTH,
      y: node.y + NODE_MID_Y,
      clientX: nodesRect.left + node.x + NODE_WIDTH,
      clientY: nodesRect.top + node.y + NODE_MID_Y,
    };
  }
  return {
    x: node.x,
    y: node.y + NODE_MID_Y,
    clientX: nodesRect.left + node.x,
    clientY: nodesRect.top + node.y + NODE_MID_Y,
  };
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

  temp.setAttribute(
    "d",
    `M ${connectionDrag.startX} ${connectionDrag.startY} C ${connectionDrag.startX + curve} ${connectionDrag.startY}, ${mx - curve} ${my}, ${mx} ${my}`,
  );

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
}

function deleteSelected() {
  const selectedIndex = nodes.findIndex((item) => item.id === selectedNodeId);
  if (selectedIndex < 0) return;

  nodes.splice(selectedIndex, 1);
  connections = connections
    .filter(([from, to]) => from !== selectedIndex && to !== selectedIndex)
    .map(([from, to]) => [
      from > selectedIndex ? from - 1 : from,
      to > selectedIndex ? to - 1 : to,
    ]);
  selectedNodeId = nodes[Math.min(selectedIndex, nodes.length - 1)]?.id ?? null;
  clearRun();
  renderFlow();
}

function autoArrange() {
  const columns = 3;
  nodes.forEach((item, index) => {
    item.x = 90 + (index % columns) * 390;
    item.y = 140 + Math.floor(index / columns) * 250;
  });
  clearRun();
  renderFlow();
}

function runFlow() {
  clearRun(false);
  els.runState.textContent = "Running";

  const ordered = resolveRunOrder();
  ordered.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.title} / ${item.channel} / ${item.mode ?? "Manual"}`;
    els.runLog.appendChild(li);
  });

  let index = 0;
  const steps = [...els.runLog.children];
  runTimer = window.setInterval(() => {
    steps.forEach((step) => step.classList.remove("active"));
    if (index >= steps.length) {
      clearInterval(runTimer);
      runTimer = null;
      els.runState.textContent = "Complete";
      return;
    }
    steps[index].classList.add("active");
    index += 1;
  }, 520);
}

function resolveRunOrder() {
  const visited = new Set();
  const order = [];

  function visit(index) {
    if (visited.has(index) || !nodes[index]) return;
    visited.add(index);
    order.push(nodes[index]);
    connections
      .filter(([from]) => from === index)
      .forEach(([, to]) => visit(to));
  }

  visit(0);
  nodes.forEach((_, index) => visit(index));
  return order;
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
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
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
    addChatMessage("bot", "Running the workflow preview.");
  } else if (lower === "reset" || lower === "restart" || lower === "clear") {
    loadTemplate(currentTemplateId);
    addChatMessage("bot", "Flow reset to the saved template.");
  } else if (lower === "arrange" || lower === "auto arrange" || lower === "layout") {
    autoArrange();
    addChatMessage("bot", "Nodes auto-arranged.");
  } else if (lower.startsWith("load ")) {
    const query = lower.slice(5).trim();
    const match = templates.find(
      (t) => t.id.includes(query) || t.name.toLowerCase().includes(query),
    );
    if (match) {
      loadTemplate(match.id);
      addChatMessage("bot", `Loaded "${match.name}".`);
    } else {
      addChatMessage("bot", `No template found for "${query}". Try: load release / load incident / load founder`);
    }
  } else if (lower.startsWith("add ")) {
    const query = lower.slice(4).trim();
    const match = blockTypes.find(
      (b) => b.type === query || b.title.toLowerCase() === query,
    );
    if (match) {
      addBlock(match.type);
      addChatMessage("bot", `Added a "${match.title}" node.`);
    } else {
      addChatMessage(
        "bot",
        `Unknown node type "${query}". Try: add trigger / add triage / add build / add deploy / add observe`,
      );
    }
  } else if (lower === "help" || lower === "?" || lower === "commands") {
    addChatMessage("bot", "Commands: run / reset / arrange / load [name] / add [type] / help | Tip: drag output handles (circles) to connect nodes, click connections to delete");
  } else {
    addChatMessage("bot", `Unknown command. Type "help" to see what's available.`);
  }
}

els.nodeName.addEventListener("input", (e) => updateSelected("title", e.target.value));
els.nodeChannel.addEventListener("change", (e) => updateSelected("channel", e.target.value));
els.nodeNotes.addEventListener("input", (e) => updateSelected("notes", e.target.value));
els.nodePriority.addEventListener("change", (e) => updateSelected("priority", e.target.value));
els.nodeMode.addEventListener("change", (e) => updateSelected("mode", e.target.value));
els.deleteNode.addEventListener("click", deleteSelected);
els.resetFlow.addEventListener("click", () => loadTemplate(currentTemplateId));
els.autoArrange.addEventListener("click", autoArrange);
els.runFlow.addEventListener("click", runFlow);

els.nodes.addEventListener("pointerdown", (event) => {
  const outputHandle = event.target.closest(".node-handle-output");
  if (outputHandle) {
    event.stopPropagation();
    startConnectionDrag(event, outputHandle);
  }
});

els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = els.chatInput.value;
  els.chatInput.value = "";
  handleChatCommand(value);
});

renderTemplates();
renderPalette();
loadTemplate(currentTemplateId);
addChatMessage("bot", "Chat trigger ready. Type \"help\" for commands.");
