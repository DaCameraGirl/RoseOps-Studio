const IS_GITHUB_PAGES = /github\.io$/i.test(window.location.hostname);
const API = IS_GITHUB_PAGES
  ? (sessionStorage.getItem("roseops_api_url") || "")
  : `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ":3099"}`;
const NODE_WIDTH = 340;
const NODE_HEIGHT = 170;
const NODE_MID_Y = 81;
const CANVAS_PAD = 80;
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

const LOCAL_CREDS_KEY = "roseops_local_credentials";
const AI_STEP_TYPES = new Set(["llm"]);
const CREDENTIAL_PRESETS = {
  openai_api: { label: "OpenAI", name: "My OpenAI Key", hint: "Get a key at platform.openai.com/api-keys" },
  google_gemini: { label: "Google Gemini", name: "My Gemini Key", hint: "Get a key at aistudio.google.com/apikey" },
  deepseek_api: { label: "DeepSeek", name: "My DeepSeek Key", hint: "Get a key at platform.deepseek.com" },
  xai_grok: { label: "xAI Grok", name: "My Grok Key", hint: "Get a key at console.x.ai" },
  ollama_local: { label: "Ollama (local)", name: "My PC — Ollama", hint: "Free LLMs on your computer — install via Setup guide" },
};

let localCredentialList = [];
let blockTypes = [
  { type: "trigger", name: "Trigger", icon: "\u2726", color: "#e8739a", config: [{ key: "triggerType", label: "Type", type: "select", options: ["Manual", "Webhook", "Schedule"], default: "Manual" }], defaults: { channel: "Manual", priority: "Normal", mode: "Auto" } },
  { type: "llm", name: "AI Chat", icon: "AI", color: "#7c5cff", config: [{ key: "provider", label: "Provider", type: "select", options: ["openai", "google", "deepseek", "xai", "ollama"], default: "openai" }, { key: "credentialId", label: "API Key", type: "credential", credentialTypes: ["openai_api", "google_gemini", "deepseek_api", "xai_grok", "ollama_local", "bearer_token"], default: "" }, { key: "model", label: "Model", type: "string", default: "gpt-4o-mini" }, { key: "systemPrompt", label: "System prompt", type: "code", default: "You are a helpful assistant." }, { key: "userPrompt", label: "User prompt", type: "code", default: "{{message}}" }, { key: "temperature", label: "Temperature", type: "number", default: 0.7 }], defaults: { channel: "LLM", priority: "Normal", mode: "Auto" } },
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
const GUIDE_DISMISS_KEY = "roseops_guide_dismissed";
const HOWTO_CONNECT_KEY = "roseops_howto_connect_seen";
const ONBOARDING_STEPS = 2;

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
  const ids = ["templateList","blockPalette","blockPaletteAi","flowTitle","nodeCount","board","nodes","connections","inspectorEmpty","inspectorForm","nodeName","nodeChannel","nodeNotes","nodePriority","nodeMode","deleteNode","resetFlow","autoArrange","fitView","runFlow","runLog","runState","chatForm","chatInput","chatLog","workflowList","newWorkflow","nodeConfig","browseTemplates","onboarding","onboardingContent","onboardingProgress","credentialList","newCredential","keyQuickGrid","modal","modalTitle","modalBody","connectionStatus","workflowVersion","nodeCountMeta","canvasEmpty","canvasPickStarter","guidePanel","guideSteps","dismissGuide","setupDrawerBody","openSetupGuide","openSetupGuideSide"];
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
  if (els.fitView) els.fitView.addEventListener("click", () => { fitCanvasToNodes(); showToast("Centered your steps in view."); });
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
  if (els.connectionStatus) els.connectionStatus.addEventListener("click", () => showSetupGuideModal());
  els.openSetupGuide?.addEventListener("click", () => showSetupGuideModal());
  els.openSetupGuideSide?.addEventListener("click", () => showSetupGuideModal());
  els.guideSteps?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-guide-action]");
    if (!btn) return;
    if (btn.dataset.guideAction === "engine") showSetupGuideModal("engine");
    if (btn.dataset.guideAction === "grok") showSetupGuideModal("keys");
    if (btn.dataset.guideAction === "local") showSetupGuideModal("local");
  });
  els.keyQuickGrid?.querySelectorAll("[data-provider]").forEach((btn) => {
    btn.addEventListener("click", () => showQuickCredentialModal(btn.dataset.provider));
  });
  document.getElementById("keysSetupHelp")?.addEventListener("click", () => showSetupGuideModal("local"));
  document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  if (els.browseTemplates) {
    els.browseTemplates.addEventListener("click", () => {
      els.templateList?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  if (els.canvasPickStarter) els.canvasPickStarter.addEventListener("click", () => showWorkflowPickerModal());
  if (els.dismissGuide) {
    els.dismissGuide.addEventListener("click", () => {
      try { localStorage.setItem(GUIDE_DISMISS_KEY, "1"); } catch {}
      els.guidePanel?.classList.add("hidden");
    });
  }
  setupPaletteDropZone();

  await connectToServer();
  renderSetupDrawer();
  await loadStarterCatalog();
  renderPalette();
  renderTemplates();
  await loadCredentials();
  await ensureStarterWorkflowsExist();
  await repairAllStoredWorkflows();
  await loadWorkflowList();
  if (connected) setupSSE();
  updateGuidePanel();
  if (!localStorage.getItem(ONBOARDING_KEY)) showOnboarding();
  else if (!sessionStorage.getItem("roseops_welcomed")) {
    showToast("Drag steps onto the canvas, connect the dots, then hit Run workflow.");
    sessionStorage.setItem("roseops_welcomed", "1");
  }
}

async function connectToServer() {
  if (IS_GITHUB_PAGES && !API) {
    connected = false;
    els.connectionStatus.textContent = "● pages (static)";
    showPagesDeployBanner();
    addChatMessage("bot", "You're on GitHub Pages (preview only). Open Setup guide in the sidebar or type connect for full steps.");
    if (!sessionStorage.getItem(HOWTO_CONNECT_KEY)) {
      sessionStorage.setItem(HOWTO_CONNECT_KEY, "1");
      setTimeout(() => showSetupGuideModal(), 600);
    }
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
    addChatMessage("bot", "You're connected! Pick a workflow on the left to get started.");
    renderSetupDrawer();
  } catch (err) {
    connected = false;
    els.connectionStatus.textContent = "● offline";
    if (String(err.message).includes("Unauthorized") && !apiKey) promptApiKey();
    addChatMessage("bot", "Engine offline — open Setup guide or run npm start. You can still browse templates and build flows.");
    renderSetupDrawer();
  }
}

function showPagesDeployBanner() {
  if (document.getElementById("pagesBanner")) return;
  const banner = document.createElement("div");
  banner.id = "pagesBanner";
  banner.className = "pages-banner";
  banner.innerHTML = `
    <span><strong>Preview mode</strong> — you can build flows here, but <strong>Run workflow</strong> needs the engine.</span>
    <button type="button" class="ghost-button" id="howToConnect">How to connect</button>
    <button type="button" class="ghost-button" id="setApiUrl">Connect engine</button>
    <button type="button" class="icon-button" id="dismissPagesBanner" aria-label="Dismiss">&#215;</button>
    <p class="pages-banner-steps">New here? <strong>1)</strong> Clone the repo · <strong>2)</strong> Run <code>npm install</code> then <code>npm start</code> · <strong>3)</strong> Open <code>localhost:3099</code> — or tap <strong>How to connect</strong> for all options.</p>`;
  document.querySelector(".workspace")?.prepend(banner);
  banner.querySelector("#dismissPagesBanner")?.addEventListener("click", () => banner.remove());
  banner.querySelector("#howToConnect")?.addEventListener("click", () => showSetupGuideModal());
  banner.querySelector("#setApiUrl").addEventListener("click", () => showConnectEngineModal());
}

const REPO_CLONE_URL = "https://github.com/DaCameraGirl/RoseOps-Studio.git";

const ROSEOPS_POWERSHELL = `# RoseOps engine — run once in PowerShell (first-time setup):
git clone ${REPO_CLONE_URL}
cd RoseOps-Studio
npm install
Copy-Item .env.example .env
npm start
# Keep this window open. Browser opens http://localhost:3099`;

const LOCAL_LLM_POWERSHELL = `# Ollama — run in a second PowerShell window:
winget install Ollama.Ollama

# If winget isn't available:
# irm https://ollama.com/install.ps1 | iex

# Open a NEW PowerShell window after install, then:
ollama pull llama3.2
ollama list
ollama run llama3.2 "Say hello in one sentence"`;

function getSetupGuideBodyHtml() {
  const pagesNote = IS_GITHUB_PAGES
    ? `<p class="onboarding-subtitle">You're on <strong>GitHub Pages</strong> — great for browsing and building. Running workflows needs the engine (below).</p>`
    : "";
  return `
    ${pagesNote}
    <h3 class="howto-section-title" id="setup-engine">1 · Connect the engine</h3>
    <p class="onboarding-subtitle">RoseOps has two parts: the <strong>studio</strong> (this UI) and the <strong>engine</strong> (<code>server.js</code>) that runs workflows and stores API keys encrypted.</p>
    <div class="howto-steps">
      <div class="howto-step"><span class="howto-step-num">A</span><span><strong>Run on your computer (recommended)</strong><span><code>git clone ${REPO_CLONE_URL}</code> → <code>cd RoseOps-Studio</code> → <code>npm install</code> → copy <code>.env.example</code> to <code>.env</code> → <code>npm start</code> → open <code>http://localhost:3099</code>.</span></span></div>
      <div class="howto-step"><span class="howto-step-num">B</span><span><strong>Desktop shortcut</strong><span>After cloning, double-click <code>start-roseops.cmd</code>. Same as A — opens localhost automatically.</span></span></div>
      <div class="howto-step"><span class="howto-step-num">C</span><span><strong>GitHub Pages + engine</strong><span>Stay on this page for preview. Deploy <code>server.js</code> to Render/Railway, copy that URL, then <strong>Connect engine</strong> — or run locally and click <strong>I started RoseOps from my desktop icon</strong>.</span></span></div>
    </div>
    <table class="howto-table">
      <thead><tr><th>Who</th><th>What to do</th></tr></thead>
      <tbody>
        <tr><td>New users</td><td>Clone → <code>npm install</code> → <code>npm start</code> → <code>localhost:3099</code></td></tr>
        <tr><td>Desktop shortcut</td><td>Run <code>start-roseops.cmd</code></td></tr>
        <tr><td>Pages visitors</td><td><strong>Setup guide</strong> (sidebar) or status badge <strong>● pages</strong></td></tr>
        <tr><td>Self-hosters</td><td>Deploy <code>server.js</code> → <strong>Connect engine</strong> → paste your URL</td></tr>
      </tbody>
    </table>
    <h3 class="howto-section-title" id="setup-keys">2 · Connect Grok &amp; other AI keys</h3>
    <p class="onboarding-subtitle">Like n8n — add keys once in <strong>API keys</strong> (left sidebar), then pick them in any <strong>AI Chat</strong> step.</p>
    <div class="howto-steps">
      <div class="howto-step"><span class="howto-step-num">1</span><span><strong>Connect the engine</strong><span>Keys are encrypted in the vault when the engine is running. Preview mode saves keys in this browser only.</span></span></div>
      <div class="howto-step"><span class="howto-step-num">2</span><span><strong>Get your Grok key</strong><span>Sign in at <a href="https://console.x.ai" target="_blank" rel="noopener">console.x.ai</a> and create an API key.</span></span></div>
      <div class="howto-step"><span class="howto-step-num">3</span><span><strong>Add in RoseOps</strong><span>Left sidebar → <strong>API keys</strong> → tap <strong>Grok</strong> (or OpenAI / Gemini / DeepSeek) → paste key → save.</span></span></div>
      <div class="howto-step"><span class="howto-step-num">4</span><span><strong>Use in a workflow</strong><span>Drag <strong>AI Chat</strong> onto the canvas → set Provider to <strong>xai</strong> → pick your Grok key → set model (e.g. <code>grok-2</code>) → run.</span></span></div>
    </div>
    <h3 class="howto-section-title" id="setup-local-llm">3 · Free local LLMs — full setup</h3>
    <p class="onboarding-subtitle">Run AI on <strong>your PC</strong> with zero API cost. You need <strong>two things running</strong>: the RoseOps engine (<code>localhost:3099</code>) and Ollama (<code>localhost:11434</code>).</p>
    <div class="howto-checklist">
      <p class="howto-checklist-title">Complete checklist (do in order)</p>
      <ol class="howto-checklist-steps">
        <li><strong>Start RoseOps engine</strong> — PowerShell block A below, or double-click <code>start-roseops.cmd</code>. Status should show <strong>● enterprise</strong> (not ● pages / ● offline).</li>
        <li><strong>Install Ollama</strong> — PowerShell block B: <code>winget install Ollama.Ollama</code></li>
        <li><strong>Download a model</strong> — new PowerShell window: <code>ollama pull llama3.2</code> (wait for download to finish)</li>
        <li><strong>Test Ollama</strong> — <code>ollama list</code> should show <code>llama3.2</code></li>
        <li><strong>Add Local key in RoseOps</strong> — sidebar <strong>API keys</strong> → tap <strong>Local</strong> → leave URL as <code>http://localhost:11434/v1</code> → <strong>Save key</strong></li>
        <li><strong>Open a workflow</strong> — tap <strong>+ Add</strong> → pick <strong>AI Assistant</strong> template (or any workflow)</li>
        <li><strong>Configure AI Chat step</strong> — click the <strong>AI Chat</strong> step on canvas → Provider: <strong>ollama</strong> → API Key: your Local key → Model: <code>llama3.2</code> (must match what you pulled)</li>
        <li><strong>Run it</strong> — click <strong>Run workflow</strong> → check <strong>Execution</strong> panel on the right for the response</li>
      </ol>
    </div>
    <p class="howto-code-label">A · RoseOps engine (PowerShell — first time)</p>
    <pre class="howto-code" id="roseopsPs1">${ROSEOPS_POWERSHELL}</pre>
    <p class="howto-code-label">B · Ollama + model (PowerShell — second window)</p>
    <pre class="howto-code" id="localLlmPs1">${LOCAL_LLM_POWERSHELL}</pre>
    <div class="howto-troubleshoot">
      <p class="howto-checklist-title">If something fails</p>
      <ul class="howto-troubleshoot-list">
        <li><strong>Run workflow greyed out / nothing happens</strong> — engine not connected. Run <code>npm start</code> and use <code>localhost:3099</code>, not GitHub Pages alone.</li>
        <li><strong>LLM error / connection refused</strong> — Ollama not running. Open PowerShell and run <code>ollama list</code>; reinstall with block B if needed.</li>
        <li><strong>Model not found</strong> — Model name in the step must exactly match <code>ollama list</code> (e.g. <code>llama3.2</code>, not <code>llama3</code>).</li>
        <li><strong>Slow first reply</strong> — normal; Ollama loads the model into RAM on first run.</li>
      </ul>
    </div>
    <p class="onboarding-subtitle">Assistant shortcuts: <code>connect</code> · <code>ollama</code> · <code>local</code> · <code>setup</code> · <code>help</code></p>`;
}

function renderSetupDrawer() {
  if (!els.setupDrawerBody) return;
  const status = connected
    ? `<p class="setup-status setup-status-ok"><strong>Engine connected</strong> — workflows and encrypted keys are ready.</p>`
    : IS_GITHUB_PAGES
      ? `<p class="setup-status setup-status-warn"><strong>Preview mode</strong> — build flows here; <strong>Run workflow</strong> needs the engine.</p>`
      : `<p class="setup-status setup-status-warn"><strong>Engine offline</strong> — run <code>npm start</code> in the project folder.</p>`;
  const keyCount = getCredentialList().length;
  els.setupDrawerBody.innerHTML = `
    ${status}
    <p class="setup-path-label">Free local AI setup:</p>
    <ol class="setup-mini-steps">
      <li><code>npm start</code> → open <code>localhost:3099</code></li>
      <li>PowerShell: <code>winget install Ollama.Ollama</code></li>
      <li><code>ollama pull llama3.2</code> then <code>ollama list</code></li>
      <li>Tap <strong>Local</strong> under API keys → Save</li>
      <li>AI Chat step → <strong>ollama</strong> → model <code>llama3.2</code> → Run</li>
    </ol>
    <p class="setup-keys-note">${keyCount ? `${keyCount} API key${keyCount === 1 ? "" : "s"} saved` : "No API keys yet"}</p>
    <div class="setup-drawer-actions">
      <button type="button" class="ghost-button" id="drawerFullGuide">Full guide</button>
      <button type="button" class="ghost-button" id="drawerLocalLlm">How to set up Local</button>
      ${connected ? "" : `<button type="button" class="ghost-button" id="drawerConnectEngine">Connect engine</button>`}
      <button type="button" class="primary-button" id="drawerAddOllama">Add Local key</button>
    </div>`;
  els.setupDrawerBody.querySelector("#drawerFullGuide")?.addEventListener("click", () => showSetupGuideModal());
  els.setupDrawerBody.querySelector("#drawerLocalLlm")?.addEventListener("click", () => showSetupGuideModal("local"));
  els.setupDrawerBody.querySelector("#drawerConnectEngine")?.addEventListener("click", () => showConnectEngineModal());
  els.setupDrawerBody.querySelector("#drawerAddOllama")?.addEventListener("click", () => showQuickCredentialModal("ollama_local"));
}

function showSetupGuideModal(scrollTo = "") {
  els.modal.querySelector(".modal-card")?.classList.add("modal-wide");
  showModal("Setup guide", `${getSetupGuideBodyHtml()}
    <div class="modal-actions">
      <button type="button" class="ghost-button" data-close-modal>Got it</button>
      <button type="button" class="ghost-button" id="howtoAddGrok">Add Grok key</button>
      <button type="button" class="ghost-button" id="howtoAddOllama">Add Local (Ollama)</button>
      <button type="button" class="ghost-button" id="howtoOpenLocal">Open localhost:3099</button>
      <button type="button" class="primary-button" id="howtoConnectEngine">Connect engine</button>
    </div>`);
  document.getElementById("howtoOpenLocal")?.addEventListener("click", () => {
    window.open("http://localhost:3099", "_blank");
    showToast("If that tab loads, use it — that's the full app.");
  });
  document.getElementById("howtoConnectEngine")?.addEventListener("click", () => {
    closeModal();
    showConnectEngineModal();
  });
  document.getElementById("howtoAddGrok")?.addEventListener("click", () => {
    closeModal();
    showQuickCredentialModal("xai_grok");
  });
  document.getElementById("howtoAddOllama")?.addEventListener("click", () => {
    closeModal();
    showQuickCredentialModal("ollama_local");
  });
  if (scrollTo) {
    requestAnimationFrame(() => {
      const targetId = scrollTo === "keys" ? "setup-keys" : scrollTo === "local" ? "setup-local-llm" : "setup-engine";
      document.getElementById(targetId)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
}

function showHowToConnectModal() {
  showSetupGuideModal("engine");
}

function showConnectEngineModal() {
  showModal("Connect the engine", `
    <p class="onboarding-subtitle"><strong>Easiest:</strong> double-click <strong>RoseOps Studio</strong> on your desktop. It opens <code>http://localhost:3099</code> — no URL to type.</p>
    <p class="onboarding-subtitle">You're on GitHub Pages (preview only). To run workflows and save API keys encrypted, connect to an engine below.</p>
    <div class="connect-engine-options">
      <button type="button" class="primary-button" id="useLocalEngine">I started RoseOps from my desktop icon</button>
      <p class="onboarding-subtitle">Uses <code>http://localhost:3099</code> on this PC. The RoseOps Engine window must be running.</p>
    </div>
    <div class="picker-divider"><span>or deployed online</span></div>
    <form id="apiUrlForm" class="credential-form-grid">
      <label>Online engine URL<input id="apiUrlInput" type="url" placeholder="https://roseops-api.onrender.com" /></label>
      <p class="onboarding-subtitle">Only if you deployed <code>server.js</code> to Render, Railway, etc. Leave blank if you use the desktop icon.</p>
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-close-modal>Cancel</button>
        <button type="submit" class="ghost-button">Connect online URL</button>
        <button type="button" class="ghost-button" id="openLocalTab">Open localhost:3099 instead</button>
      </div>
    </form>`);

  document.getElementById("useLocalEngine").addEventListener("click", () => {
    sessionStorage.setItem("roseops_api_url", "http://localhost:3099");
    closeModal();
    location.reload();
  });

  document.getElementById("openLocalTab").addEventListener("click", () => {
    window.open("http://localhost:3099", "_blank");
    closeModal();
    showToast("Use the localhost tab — that's the full app with no engine setup.");
  });

  document.getElementById("apiUrlForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = document.getElementById("apiUrlInput").value.trim().replace(/\/$/, "");
    if (!url) {
      showToast("Enter your deployed URL, or use the desktop icon button above.");
      return;
    }
    sessionStorage.setItem("roseops_api_url", url);
    closeModal();
    location.reload();
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
        } else if (data.status === "success") {
          showToast("Workflow finished successfully!", "success");
        }
        renderFlow();
        updateGuidePanel();
        break;
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
      return;
    }
    const bases = [
      window.location.pathname.replace(/\/[^/]*$/, "/"),
      "/RoseOps-Studio/",
      "./",
    ];
    for (const base of bases) {
      try {
        const res = await fetch(`${base}starters.json?v=10`);
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
          WORKFLOW_TEMPLATES = data;
          return;
        }
      } catch {}
    }
    WORKFLOW_TEMPLATES = [];
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
    empty.innerHTML = `<p>No workflows yet — let's fix that.</p><button type="button" class="primary-button" id="pickStarterBtn">Browse templates</button>`;
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
    btn.innerHTML = `<span class="tile-icon" style="background:${color}">${icon}</span><span><strong>${escapeHtml(wf.name)}</strong><span>${escapeHtml(wf.description || "")}</span>${starter?.badge ? `<span class="template-badge">${escapeHtml(starter.badge)}</span>` : ""}<span class="card-cta">Tap to open →</span></span>`;
    btn.addEventListener("click", async () => { await loadWorkflow(wf.id); });
    els.workflowList.appendChild(btn);
  }
  if (workflows.length > 0 && !currentWorkflowId) await loadWorkflow(workflows[0].id);
}

function renderCredentialCards(list) {
  if (!els.credentialList) return;
  els.credentialList.innerHTML = "";
  if (!list.length) {
    els.credentialList.innerHTML = `<div class="workflow-empty"><p>No API keys yet — tap <strong>Local</strong> for free Ollama models, or <strong>OpenAI</strong> / <strong>Grok</strong> above. See <strong>Setup guide</strong> for PowerShell install steps.</p></div>`;
    return;
  }
  list.forEach((cred) => {
    const btn = document.createElement("button");
    btn.className = "template-card";
    const label = CREDENTIAL_PRESETS[cred.type]?.label || cred.type;
    btn.innerHTML = `<span class="tile-icon" style="background:#7c5cff">${label.slice(0, 2).toUpperCase()}</span><span><strong>${escapeHtml(cred.name)}</strong><span>${escapeHtml(label)}</span><span class="card-cta">Tap to view →</span></span>`;
    btn.addEventListener("click", () => showCredentialDetail(cred.id));
    els.credentialList.appendChild(btn);
  });
}

async function loadCredentials() {
  loadLocalCredentials();
  if (!els.credentialList) return;
  if (!connected) {
    renderCredentialCards(localCredentialList);
    renderSetupDrawer();
    updateGuidePanel();
    return;
  }
  try {
    credentialList = await (await apiFetch("/api/credentials")).json();
    renderCredentialCards(credentialList);
  } catch {
    renderCredentialCards(localCredentialList);
  }
  renderSetupDrawer();
  updateGuidePanel();
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
  showToast(`"${name}" created — drag your first step in.`, "success");
}

async function loadWorkflow(id) {
  let wf = null;
  if (connected) {
    try { wf = await (await apiFetch(`/api/workflows/${id}`)).json(); } catch {}
  }
  if (!wf) wf = localDb.find(w => w.id === id);
  if (!wf) { await createWorkflow("Untitled", ""); return; }
  wf = await persistRepairedWorkflow(wf);
  currentWorkflowId = wf.id; nodes = wf.nodes || []; connections = wf.connections || [];
  selectedNodeId = nodes[0]?.id ?? null; executionResults = {};
  workflowVersion = wf.version || 1;
  els.flowTitle.textContent = wf.name || "Untitled";
  els.workflowVersion.textContent = `v${workflowVersion}`;
  clearRun(); renderFlow(); await loadWorkflowList();
  ensureNodesVisible();
  updateGuidePanel();
  webhookInfo = null;
  if (connected) {
    try { const wh = await (await apiFetch(`/api/webhooks/${id}`)).json(); if (wh) webhookInfo = wh; } catch {}
  }
  showToast(`Opened "${wf.name}" — ${nodes.length} step${nodes.length === 1 ? "" : "s"}`, "success");
  els.board?.closest(".board-wrap")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (nodes[0]) selectNode(nodes[0].id);
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
  if (els.blockPaletteAi) els.blockPaletteAi.innerHTML = "";
  if (els.blockPalette) els.blockPalette.innerHTML = "";
  blockTypes.forEach((block) => {
    const host = AI_STEP_TYPES.has(block.type) ? (els.blockPaletteAi || els.blockPalette) : els.blockPalette;
    if (!host) return;
    const button = document.createElement("button");
    button.className = "palette-card";
    button.draggable = false;
    button.dataset.type = block.type;
    button.innerHTML = `<span class="tile-icon" style="background:${block.color}">${block.icon}</span><span><strong>${block.name}</strong><span>Drag or click to add</span></span>`;
    button.addEventListener("click", () => { if (!paletteDrag?.moved) addBlock(block.type); });
    button.addEventListener("pointerdown", (e) => startPaletteDrag(e, block));
    host.appendChild(button);
  });
}

function loadLocalCredentials() {
  try { localCredentialList = JSON.parse(localStorage.getItem(LOCAL_CREDS_KEY) || "[]"); } catch { localCredentialList = []; }
}

function getActiveCredentials() {
  return connected ? credentialList : localCredentialList;
}

async function persistCredential(name, type, data) {
  if (connected) {
    const res = await apiFetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, data }),
    });
    return (await res.json()).id;
  }
  const id = crypto.randomUUID();
  localCredentialList.push({ id, name, type, tags: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const secrets = JSON.parse(localStorage.getItem(`${LOCAL_CREDS_KEY}_secrets`) || "{}");
  secrets[id] = data;
  localStorage.setItem(`${LOCAL_CREDS_KEY}_secrets`, JSON.stringify(secrets));
  localStorage.setItem(LOCAL_CREDS_KEY, JSON.stringify(localCredentialList.map(({ id, name, type, tags, created_at, updated_at }) => ({ id, name, type, tags, created_at, updated_at }))));
  return id;
}

function renderTemplates() {
  if (!els.templateList) return;
  els.templateList.innerHTML = "";
  WORKFLOW_TEMPLATES.forEach((tpl) => {
    const btn = document.createElement("button");
    btn.className = "template-card";
    btn.innerHTML = `<span class="tile-icon" style="background:${tpl.color}">${tpl.icon}</span><span><strong>${escapeHtml(tpl.name)}</strong><span>${escapeHtml(tpl.description)}</span>${tpl.badge ? `<span class="template-badge">${escapeHtml(tpl.badge)}</span>` : ""}<span class="card-cta">Tap to add →</span></span>`;
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

function findTemplateForWorkflow(wf) {
  if (!WORKFLOW_TEMPLATES.length || !wf) return null;
  if (wf.name === "Onboarding Pipeline") {
    return WORKFLOW_TEMPLATES.find((t) => t.id === "api-pipeline") || null;
  }
  return WORKFLOW_TEMPLATES.find((t) => t.name === wf.name) || null;
}

function repairWorkflowNodes(wf) {
  if (Array.isArray(wf.nodes) && wf.nodes.length > 0) return wf;
  const template = findTemplateForWorkflow(wf);
  if (!template?.nodes?.length) return wf;
  return {
    ...wf,
    nodes: instantiateTemplateNodes(template.nodes),
    connections: (template.connections || []).map(([f, t]) => [f, t]),
    description: wf.description || template.description,
  };
}

async function persistRepairedWorkflow(wf) {
  const repaired = repairWorkflowNodes(wf);
  if ((wf.nodes?.length || 0) === repaired.nodes.length) return repaired;
  if (connected) {
    try {
      await apiFetch(`/api/workflows/${wf.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: repaired.nodes, connections: repaired.connections, name: wf.name, description: repaired.description }),
      });
    } catch {}
  } else {
    const idx = localDb.findIndex((w) => w.id === wf.id);
    if (idx >= 0) {
      localDb[idx] = { ...localDb[idx], nodes: repaired.nodes, connections: repaired.connections, updated_at: new Date().toISOString() };
      saveLocalDb();
    }
  }
  showToast(`Loaded ${repaired.nodes.length} steps into "${repaired.name}"`, "success");
  return repaired;
}

async function repairAllStoredWorkflows() {
  let changed = false;
  for (let i = 0; i < localDb.length; i++) {
    const repaired = repairWorkflowNodes(localDb[i]);
    if ((localDb[i].nodes?.length || 0) !== repaired.nodes.length) {
      localDb[i] = { ...localDb[i], nodes: repaired.nodes, connections: repaired.connections };
      changed = true;
    }
  }
  if (changed) saveLocalDb();
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
  else {
    renderFlow();
    ensureNodesVisible();
  }
  await loadWorkflowList();
  if (!opts.silent) {
    showToast(`"${name}" added — tap each step to configure it.`, "success");
    addChatMessage("bot", `"${name}" is ready. Tap each step to set it up, then hit Run workflow.`);
  }
  return id;
}

async function createGuidedWorkflow() {
  if (!WORKFLOW_TEMPLATES.length) await loadStarterCatalog();
  const guided = WORKFLOW_TEMPLATES.find((t) => t.id === "api-pipeline");
  if (guided) {
    await cloneTemplate({
      ...guided,
      name: "Onboarding Pipeline",
      description: "Standard API ingest pipeline — configure credentials before first run.",
    }, { rename: "Onboarding Pipeline" });
  } else {
    showToast("Templates didn't load — hit Browse templates or hard-refresh (Ctrl+Shift+R).", "info");
    await createWorkflow("Onboarding Pipeline", "Standard API ingest pipeline");
  }
}

function renderFlow() {
  els.nodes.innerHTML = "";
  const countLabel = `${nodes.length} ${nodes.length === 1 ? "step" : "steps"}`;
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
  renderCanvasEmpty();
  resizeCanvasSurface();
  updateGuidePanel();
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
        const filtered = getActiveCredentials().filter((c) => !cfg.credentialTypes || cfg.credentialTypes.includes(c.type));
        const opts = filtered.map((c) => `<option value="${c.id}"${val === c.id ? " selected" : ""}>${escapeHtml(c.name)} (${CREDENTIAL_PRESETS[c.type]?.label || c.type})</option>`).join("");
        const addKey = `<button type="button" class="ghost-button cred-inline-add" data-cred-key="${cfg.key}">+ Add API key</button>`;
        return `<label>${cfg.label}<select class="node-cfg" data-key="${cfg.key}"><option value="">— Pick your API key —</option>${opts}</select>${addKey}</label>`;
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
    els.nodeConfig.querySelectorAll(".cred-inline-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        const provider = selected.type === "llm" ? { openai: "openai_api", google: "google_gemini", deepseek: "deepseek_api", xai: "xai_grok", ollama: "ollama_local" }[selected.config?.provider] || "openai_api" : "api_key";
        showQuickCredentialModal(provider);
      });
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
  if (nodes.length === 1) showToast("First step added — drag more from the left or connect the dots.", "success");
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
  const gapX = 56;
  const gapY = 72;
  const startX = 32;
  const startY = 72;
  const rowW = NODE_WIDTH + gapX;

  nodes.forEach((item, index) => {
    if (nodes.length <= 5) {
      item.x = startX + index * rowW;
      item.y = startY;
    } else {
      const cols = 3;
      item.x = startX + (index % cols) * rowW;
      item.y = startY + Math.floor(index / cols) * (NODE_HEIGHT + gapY);
    }
  });
  clearRun();
  renderFlow();
  saveWorkflow();
  fitCanvasToNodes();
}

async function runFlow() {
  if (!currentWorkflowId) return;
  if (!connected) {
    showToast("Connect the engine to run workflows (npm start locally, or Connect engine on GitHub Pages).", "info");
    addChatMessage("bot", "Running needs the engine. You can still build flows and save API keys — connect the engine when ready.");
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
    addChatMessage("bot", "Commands: run · reset · arrange · add [type] · connect · grok · ollama · local · keys · help | Setup guide is in the sidebar.");
  } else if (lower === "connect" || lower === "engine" || lower === "setup") {
    showSetupGuideModal("engine");
  } else if (lower === "grok" || lower === "xai") {
    showSetupGuideModal("keys");
    showQuickCredentialModal("xai_grok");
  } else if (lower === "keys" || lower === "api") {
    showSetupGuideModal("keys");
    document.querySelector(".panel-keys")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (lower === "ollama" || lower === "local" || lower === "local llm") {
    showSetupGuideModal("local");
    showQuickCredentialModal("ollama_local");
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
      <span><strong>${escapeHtml(tpl.name)}</strong><span>${escapeHtml(tpl.description)}</span>${tpl.badge ? `<span class="template-badge">${escapeHtml(tpl.badge)}</span>` : ""}<span class="card-cta">Tap to add →</span></span>
    </button>`).join("")
    : `<p class="onboarding-subtitle">Starters didn't load — refresh the page or check your API connection.</p>`;

  showModal("Add a workflow", `
    <p class="onboarding-subtitle">Tap a template to add it, or start with a blank canvas below.</p>
    <div class="picker-grid">${starterCards}</div>
    <div class="picker-divider"><span>or</span></div>
    <form id="blankWorkflowForm" class="credential-form-grid">
      <label>Blank workflow name<input id="wfName" autocomplete="off" placeholder="Untitled" /></label>
      <label>Description<textarea id="wfDesc" rows="2" placeholder="Optional"></textarea></label>
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-close-modal>Cancel</button>
        <button type="submit" class="primary-button">Start blank</button>
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
  const apiKeyField = `<label>API Key<input type="password" id="credApiKey" required autocomplete="off" placeholder="Paste your API key" /></label>`;
  const fields = {
    openai_api: apiKeyField,
    google_gemini: apiKeyField,
    deepseek_api: apiKeyField,
    xai_grok: apiKeyField,
    ollama_local: `<p class="onboarding-subtitle"><strong>Before saving:</strong> RoseOps engine running (<code>npm start</code>) + Ollama installed (<code>ollama pull llama3.2</code>). <button type="button" class="guide-inline-link" id="credOllamaSetupHelp">Full setup steps</button></p>
      <label>Ollama URL<input type="url" id="credOllamaUrl" value="http://localhost:11434/v1" placeholder="http://localhost:11434/v1" /></label>
      <label>API key (optional)<input type="text" id="credApiKey" value="ollama" autocomplete="off" placeholder="ollama" /></label>
      <p class="onboarding-subtitle">Then in your <strong>AI Chat</strong> step: Provider <strong>ollama</strong>, Model <strong>llama3.2</strong>.</p>`,
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
    case "openai_api":
    case "google_gemini":
    case "deepseek_api":
    case "xai_grok": return { apiKey: document.getElementById("credApiKey").value.trim() };
    case "ollama_local": return {
      baseUrl: document.getElementById("credOllamaUrl").value.trim() || "http://localhost:11434/v1",
      apiKey: document.getElementById("credApiKey").value.trim() || "ollama",
    };
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

function showQuickCredentialModal(provider) {
  const preset = CREDENTIAL_PRESETS[provider] || { label: "API Key", name: "My API Key", hint: "Paste your API key below." };
  if (provider === "ollama_local") preset.name = "My PC — Ollama (llama3.2)";
  showModal(`Connect ${preset.label}`, `
    <p class="onboarding-subtitle">${preset.hint}</p>
    <form id="quickCredForm" class="credential-form-grid">
      <label>Label<input id="credName" required value="${escapeHtml(preset.name)}" /></label>
      ${credentialFieldsForType(provider)}
      ${!connected ? '<p class="onboarding-subtitle">Preview mode: saved in this browser. Connect the engine for encrypted vault + runs.</p>' : ""}
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-close-modal>Cancel</button>
        <button type="submit" class="primary-button">Save key</button>
      </div>
    </form>`);
  document.getElementById("credOllamaSetupHelp")?.addEventListener("click", () => {
    closeModal();
    showSetupGuideModal("local");
  });
  document.getElementById("quickCredForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById("credName").value.trim();
      const data = collectCredentialData(provider);
      const id = await persistCredential(name, provider, data);
      closeModal();
      await loadCredentials();
      if (selectedNodeId) {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected) {
          if (!selected.config) selected.config = {};
          selected.config.credentialId = id;
          saveWorkflow();
        }
      }
      renderInspector();
      showToast(`${preset.label} key saved — pick it in your step settings.`, "success");
    } catch (err) {
      showToast(err.message, "info");
    }
  });
}

function showNewCredentialModal() {
  showModal("Add API key", `
    <form id="newCredForm" class="credential-form-grid">
      <label>Name<input id="credName" required placeholder="My OpenAI Key" /></label>
      <label>Type<select id="credType">
        <optgroup label="AI models">
          <option value="openai_api">OpenAI</option>
          <option value="google_gemini">Google Gemini</option>
          <option value="deepseek_api">DeepSeek</option>
          <option value="xai_grok">xAI Grok</option>
          <option value="ollama_local">Ollama (local, free)</option>
        </optgroup>
        <optgroup label="Integrations">
          <option value="discord_webhook">Discord Webhook</option>
          <option value="github_token">GitHub Token</option>
          <option value="smtp">SMTP</option>
          <option value="google_service_account">Google Service Account</option>
          <option value="webhook_url">Webhook URL</option>
          <option value="bearer_token">Bearer Token</option>
          <option value="api_key">Generic API Key</option>
        </optgroup>
      </select></label>
      <div id="credFields">${credentialFieldsForType("openai_api")}</div>
      ${!connected ? '<p class="onboarding-subtitle">Preview mode: saved in this browser until you connect the engine.</p>' : ""}
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-close-modal>Cancel</button>
        <button type="submit" class="primary-button">${connected ? "Store encrypted" : "Save key"}</button>
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
      await persistCredential(document.getElementById("credName").value.trim(), type, data);
      closeModal();
      await loadCredentials();
      renderInspector();
      showToast("API key saved.", "success");
    } catch (err) {
      showToast(err.message, "info");
    }
  });
}

function showCredentialDetail(id) {
  const cred = getActiveCredentials().find((c) => c.id === id);
  if (!cred) return;
  const label = CREDENTIAL_PRESETS[cred.type]?.label || cred.type;
  const storageNote = connected ? "Stored encrypted in the vault. Secrets never leave the server." : "Stored in this browser for preview — connect the engine for encrypted storage.";
  showModal(cred.name, `
    <p class="onboarding-subtitle">Type: <strong>${escapeHtml(label)}</strong><br>${storageNote}</p>
    <div class="modal-actions">
      <button type="button" class="ghost-button" data-close-modal>Close</button>
      <button type="button" class="danger-button" id="deleteCred">Delete</button>
    </div>`);
  document.getElementById("deleteCred").addEventListener("click", async () => {
    try {
      if (connected) {
        await apiFetch(`/api/credentials/${id}`, { method: "DELETE" });
      } else {
        localCredentialList = localCredentialList.filter((c) => c.id !== id);
        const secrets = JSON.parse(localStorage.getItem(`${LOCAL_CREDS_KEY}_secrets`) || "{}");
        delete secrets[id];
        localStorage.setItem(`${LOCAL_CREDS_KEY}_secrets`, JSON.stringify(secrets));
        localStorage.setItem(LOCAL_CREDS_KEY, JSON.stringify(localCredentialList));
      }
      closeModal();
      await loadCredentials();
      renderInspector();
      showToast("API key removed.", "info");
    } catch (err) { showToast(err.message, "info"); }
  });
}

// ===== Onboarding =====
let onboardingHandlersBound = false;

function showOnboarding() {
  onboardingStep = 0;
  els.onboarding.classList.remove("hidden");
  bindOnboardingHandlers();
  renderOnboardingStep();
}

function completeOnboarding() {
  try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
  els.onboarding?.classList.add("hidden");
}

function bindOnboardingHandlers() {
  if (onboardingHandlersBound || !els.onboardingContent) return;
  onboardingHandlersBound = true;
  els.onboardingContent.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    handleOnboardingAction(btn.dataset.action, btn);
  });
}

async function handleOnboardingAction(action, btn) {
  if (action === "next") {
    onboardingStep++;
    renderOnboardingStep();
    return;
  }
  if (action === "back") {
    onboardingStep = Math.max(0, onboardingStep - 1);
    renderOnboardingStep();
    return;
  }

  if (btn) btn.disabled = true;
  completeOnboarding();

  try {
    if (action === "guided") {
      await createGuidedWorkflow();
      showToast("API pipeline loaded — tap each step to set it up.", "success");
    } else if (action === "template") {
      showWorkflowPickerModal();
      showToast("Pick a template — they’re ready to use.", "info");
    } else if (action === "scratch") {
      await createWorkflow("Untitled", "");
      showToast("Blank canvas ready — drag your first step in.", "success");
    } else if (action === "skip") {
      showToast("Check Getting started on the right for your next steps.", "info");
    }
  } catch (err) {
    showToast(err?.message || "Something went wrong — try Browse templates.", "info");
  } finally {
    if (btn) btn.disabled = false;
  }
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
        <h2 class="onboarding-title" id="onboardingTitle">Welcome to RoseOps</h2>
        <p class="onboarding-subtitle">Build automations visually — drag, connect, and run. Everything you need is in the <strong>Setup guide</strong> on the left (engine + Grok keys).</p>
      </div>
      ${IS_GITHUB_PAGES && !connected ? `<p class="onboarding-subtitle">You're on GitHub Pages (preview). Open <strong>Setup guide</strong> in the sidebar to connect the engine.</p>` : ""}
      <div class="onboarding-steps">
        <div class="onboarding-step"><span class="onboarding-step-num">1</span><span><strong>Pick a workflow</strong><span>Start from a template or blank canvas.</span></span></div>
        <div class="onboarding-step"><span class="onboarding-step-num">2</span><span><strong>Add &amp; connect steps</strong><span>Drag steps onto the canvas and link them together.</span></span></div>
        <div class="onboarding-step"><span class="onboarding-step-num">3</span><span><strong>Run it</strong><span>Hit Run workflow when you're ready.</span></span></div>
      </div>
      <div class="onboarding-actions">
        <button type="button" class="primary-button" data-action="next">Let's go →</button>
      </div>`;
  } else {
    content.innerHTML = `
      <div class="onboarding-hero">
        <h2 class="onboarding-title" id="onboardingTitle">How do you want to start?</h2>
        <p class="onboarding-subtitle">Tap one of these — you can always add more later.</p>
      </div>
      <p class="onboarding-choice-hint">👇 Click to choose</p>
      <div class="onboarding-choices">
        <button type="button" class="onboarding-choice" data-action="guided">
          <span class="onboarding-choice-icon">✦</span>
          <span><strong>API pipeline</strong><span>Fetch data, transform it, and send it somewhere.</span><span class="onboarding-choice-cta">Start with this →</span></span>
        </button>
        <button type="button" class="onboarding-choice" data-action="template">
          <span class="onboarding-choice-icon">◇</span>
          <span><strong>Browse templates</strong><span>Discord alerts, health checks, audit logs, and more.</span><span class="onboarding-choice-cta">Start with this →</span></span>
        </button>
        <button type="button" class="onboarding-choice" data-action="scratch">
          <span class="onboarding-choice-icon">+</span>
          <span><strong>Blank canvas</strong><span>Start from scratch and build your own flow.</span><span class="onboarding-choice-cta">Start with this →</span></span>
        </button>
      </div>
      <div class="onboarding-actions">
        <button type="button" class="ghost-button" data-action="back">Back</button>
        <button type="button" class="ghost-button" data-action="skip">Skip for now</button>
      </div>`;
  }
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

// ===== UX helpers =====
function showToast(message, type = "info") {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = message;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("visible"));
  setTimeout(() => {
    t.classList.remove("visible");
    setTimeout(() => t.remove(), 280);
  }, 4200);
}

function updateGuidePanel() {
  if (!els.guidePanel) return;
  if (localStorage.getItem(GUIDE_DISMISS_KEY)) {
    els.guidePanel.classList.add("hidden");
    return;
  }
  els.guidePanel.classList.remove("hidden");
  const engineStep = els.guideSteps?.querySelector('[data-step="engine"]');
  if (engineStep) engineStep.classList.toggle("hidden", connected);
  const progress = {
    engine: connected,
    workflow: !!currentWorkflowId,
    keys: getCredentialList().length > 0,
    nodes: nodes.length > 0,
    connect: connections.length > 0,
    run: els.runState?.textContent === "Complete",
  };
  let activeSet = false;
  let stepNum = 0;
  els.guideSteps?.querySelectorAll(".guide-step").forEach((li) => {
    if (li.classList.contains("hidden")) return;
    stepNum++;
    const done = !!progress[li.dataset.step];
    li.classList.toggle("done", done);
    const isActive = !done && !activeSet;
    li.classList.toggle("active", isActive);
    if (isActive) activeSet = true;
    const check = li.querySelector(".guide-check");
    if (check) check.textContent = done ? "✓" : String(stepNum);
  });
}

function renderCanvasEmpty() {
  if (!els.canvasEmpty) return;
  const show = nodes.length === 0 && currentWorkflowId;
  els.canvasEmpty.classList.toggle("hidden", !show);
  if (!show) return;
  const wfName = els.flowTitle?.textContent || "this workflow";
  const template = findTemplateForWorkflow({ name: wfName });
  const repairBtn = template
    ? `<button type="button" class="primary-button" id="canvasRepairSteps">Load ${template.nodes.length} template steps</button>`
    : "";
  els.canvasEmpty.innerHTML = `
    <div class="canvas-empty-card">
      <div class="canvas-empty-icon" aria-hidden="true">✿</div>
      <h3>No steps on the canvas</h3>
      <p class="warn-steps">"${escapeHtml(wfName)}" is empty — that's why nothing shows up when you click it.</p>
      <p>Load the template steps, or drag from <strong>Steps to add</strong> on the left.</p>
      ${repairBtn}
      <button type="button" class="ghost-button" id="canvasPickStarterInner">Browse templates</button>
    </div>`;
  els.canvasEmpty.querySelector("#canvasPickStarterInner")?.addEventListener("click", () => showWorkflowPickerModal());
  els.canvasEmpty.querySelector("#canvasRepairSteps")?.addEventListener("click", async () => {
    if (!currentWorkflowId) return;
    let wf = null;
    if (connected) {
      try { wf = await (await apiFetch(`/api/workflows/${currentWorkflowId}`)).json(); } catch {}
    }
    if (!wf) wf = localDb.find((w) => w.id === currentWorkflowId) || { id: currentWorkflowId, name: wfName, nodes: [], connections: [] };
    await loadWorkflow((await persistRepairedWorkflow(wf)).id);
  });
}

function getNodesBounds() {
  if (!nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_WIDTH);
    maxY = Math.max(maxY, n.y + NODE_HEIGHT);
  });
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function resizeCanvasSurface() {
  if (!els.nodes || !els.connections || !els.board) return;
  const bounds = getNodesBounds();
  const viewW = Math.max(els.board.clientWidth || 800, 480);
  const viewH = Math.max(els.board.clientHeight || 420, 420);

  if (!bounds) {
    els.nodes.style.width = `${viewW}px`;
    els.nodes.style.height = `${viewH}px`;
    els.connections.setAttribute("width", viewW);
    els.connections.setAttribute("height", viewH);
    return;
  }

  const w = Math.max(viewW, bounds.maxX + CANVAS_PAD);
  const h = Math.max(viewH, bounds.maxY + CANVAS_PAD);
  els.nodes.style.width = `${w}px`;
  els.nodes.style.height = `${h}px`;
  els.connections.setAttribute("width", w);
  els.connections.setAttribute("height", h);
}

function fitCanvasToNodes() {
  if (!els.board || !nodes.length) return;
  requestAnimationFrame(() => {
    const bounds = getNodesBounds();
    if (!bounds) return;
    const pad = 24;
    els.board.scrollLeft = Math.max(0, bounds.minX - pad);
    els.board.scrollTop = Math.max(0, bounds.minY - pad);
  });
}

function ensureNodesVisible() {
  if (!nodes.length) return;
  const bounds = getNodesBounds();
  if (!bounds) return;

  const viewW = els.board?.clientWidth || 800;
  const viewH = els.board?.clientHeight || 420;
  const offScreen = bounds.minY > viewH * 0.35 || bounds.minX > viewW * 0.5 || bounds.maxY > viewH + 200;

  if (offScreen) autoArrange();
  else {
    resizeCanvasSurface();
    fitCanvasToNodes();
  }

  if (window.matchMedia("(max-width: 820px)").matches) {
    els.board?.closest(".board-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
