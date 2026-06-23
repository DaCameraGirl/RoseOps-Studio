const axios = require("axios");
const nodemailer = require("nodemailer");
const vm = require("vm");
const { google } = require("googleapis");
const { config } = require("./config");

function interpolateTemplate(str, data) {
  if (!str || !data) return str;
  return String(str).replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const parts = key.split(".");
    let val = data;
    for (const p of parts) val = val?.[p];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

function parseJsonField(raw, fieldName) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new Error(`Invalid JSON in ${fieldName}`);
  }
}

function runSandbox(code, input, timeoutMs = 5000) {
  const forbidden = /\b(require|process|global|globalThis|import|eval|Function)\b/;
  if (forbidden.test(code)) throw new Error("Code node contains disallowed identifiers");
  const sandbox = {
    data: input || {},
    console: { log: () => {} },
    JSON, Math, Date, Array, Object, String, Number, Boolean,
  };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(`"use strict"; (function() { ${code} })()`, { timeout: timeoutMs });
  return script.runInContext(context, { timeout: timeoutMs });
}

async function withRetry(fn, retries, delayMs) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

function createNodeRegistry(credentials) {
  async function resolveCredential(node, key) {
    const credId = node.config?.[key];
    if (!credId) return null;
    return credentials.resolve(credId);
  }

  const nodeTypes = {
    trigger: {
      name: "Trigger",
      color: "#ed4f8f",
      icon: "IN",
      defaults: { channel: "Manual", priority: "Normal", mode: "Auto" },
      config: [
        { key: "triggerType", label: "Trigger Type", type: "select", options: ["Manual", "Webhook", "Schedule"], default: "Manual" },
      ],
      validate() { return []; },
      async execute(node, input) {
        return { triggered: true, timestamp: new Date().toISOString(), ...input };
      },
    },
    http: {
      name: "HTTP Request",
      color: "#6f7dfb",
      icon: "HTTP",
      defaults: { channel: "API", priority: "Normal", mode: "Auto" },
      config: [
        { key: "url", label: "URL", type: "string", default: "" },
        { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
        { key: "credentialId", label: "Auth Credential", type: "credential", credentialTypes: ["api_key", "bearer_token"], default: "" },
        { key: "headers", label: "Headers (JSON)", type: "code", default: "{}" },
        { key: "body", label: "Body (JSON)", type: "code", default: "{}" },
        { key: "retries", label: "Retries", type: "number", default: 3 },
      ],
      validate(node) {
        const errs = [];
        if (!node.config?.url?.trim()) errs.push("URL is required");
        return errs;
      },
      async execute(node, input) {
        const cfg = node.config || {};
        const url = cfg.url?.trim();
        if (!url) throw new Error("URL is required");
        const method = (cfg.method || "GET").toLowerCase();
        let headers = parseJsonField(cfg.headers, "headers");
        let body = {};
        if (["post", "put", "patch"].includes(method)) {
          body = parseJsonField(cfg.body, "body");
          if (input && Object.keys(input).length) body = { ...body, ...input };
        }
        const cred = await resolveCredential(node, "credentialId");
        if (cred) {
          if (cred.type === "bearer_token" && cred.data.token) headers.Authorization = `Bearer ${cred.data.token}`;
          if (cred.type === "api_key" && cred.data.header && cred.data.value) headers[cred.data.header] = cred.data.value;
        }
        const retries = parseInt(cfg.retries ?? config.defaultNodeRetries, 10);
        const res = await withRetry(
          () => axios({ method, url, headers, data: body, timeout: 30000, validateStatus: () => true }),
          retries,
          config.defaultRetryDelayMs
        );
        if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${typeof res.data === "string" ? res.data.slice(0, 200) : JSON.stringify(res.data).slice(0, 200)}`);
        return { status: res.status, headers: res.headers, data: res.data };
      },
    },
    code: {
      name: "Code",
      color: "#13a68f",
      icon: "</>",
      defaults: { channel: "JS", priority: "Normal", mode: "Auto" },
      config: [
        { key: "code", label: "JavaScript Code", type: "code", default: "return data;", language: "javascript" },
      ],
      validate(node) {
        if (!node.config?.code?.trim()) return ["Code is required"];
        return [];
      },
      async execute(node, input) {
        return runSandbox(node.config?.code || "return data;", input, 5000);
      },
    },
    delay: {
      name: "Delay",
      color: "#f3ae3d",
      icon: "WAIT",
      defaults: { channel: "Timer", priority: "Low", mode: "Auto" },
      config: [{ key: "duration", label: "Duration (ms)", type: "number", default: 1000 }],
      validate() { return []; },
      async execute(node, input) {
        const ms = Math.min(parseInt(node.config?.duration || 1000, 10), 300000);
        await new Promise((r) => setTimeout(r, ms));
        return { ...input, delayed: ms };
      },
    },
    filter: {
      name: "Filter",
      color: "#2f2634",
      icon: "IF",
      defaults: { channel: "Logic", priority: "Normal", mode: "Auto" },
      config: [{ key: "condition", label: "Condition (JS)", type: "code", default: "return data != null;" }],
      validate() { return []; },
      async execute(node, input) {
        const passed = !!runSandbox(node.config?.condition || "return true;", { data: input }, 2000);
        if (!passed) throw new Error("Filter condition not met — downstream nodes skipped");
        return { ...input, passed };
      },
    },
    webhook: {
      name: "Webhook",
      color: "#ed4f8f",
      icon: "WEB",
      defaults: { channel: "Webhook", priority: "Normal", mode: "Auto" },
      config: [
        { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "POST" },
        { key: "requireSignature", label: "Require HMAC Signature", type: "boolean", default: true },
      ],
      validate() { return []; },
      async execute(node, input) {
        return {
          received: true,
          method: input?.method || "POST",
          headers: input?.headers || {},
          body: input?.body || {},
          query: input?.query || {},
          timestamp: new Date().toISOString(),
        };
      },
    },
    schedule: {
      name: "Schedule",
      color: "#ed4f8f",
      icon: "CLOCK",
      defaults: { channel: "Cron", priority: "Normal", mode: "Auto" },
      config: [
        { key: "cron", label: "Cron Expression", type: "string", default: "0 * * * *" },
        { key: "timezone", label: "Timezone", type: "string", default: "UTC" },
      ],
      validate(node) {
        const cron = require("node-cron");
        const expr = node.config?.cron || "";
        if (!expr.trim()) return ["Cron expression is required"];
        if (!cron.validate(expr)) return ["Invalid cron expression"];
        return [];
      },
      async execute(node, input) {
        return { scheduled: true, cron: node.config?.cron, timestamp: new Date().toISOString(), ...input };
      },
    },
    email: {
      name: "Send Email",
      color: "#c47bf0",
      icon: "@",
      defaults: { channel: "Email", priority: "Normal", mode: "Manual" },
      config: [
        { key: "credentialId", label: "SMTP Credential", type: "credential", credentialTypes: ["smtp"], default: "" },
        { key: "to", label: "To", type: "string", default: "" },
        { key: "subject", label: "Subject", type: "string", default: "" },
        { key: "body", label: "Body", type: "code", default: "" },
      ],
      validate(node) {
        const errs = [];
        if (!node.config?.credentialId) errs.push("SMTP credential is required");
        if (!node.config?.to?.trim()) errs.push("Recipient (to) is required");
        if (!node.config?.subject?.trim()) errs.push("Subject is required");
        return errs;
      },
      async execute(node, input) {
        const cfg = node.config || {};
        const cred = await resolveCredential(node, "credentialId");
        const smtp = cred?.data || config.smtp;
        if (!smtp.host || !smtp.user || !smtp.pass) throw new Error("SMTP not configured — add an SMTP credential or set SMTP_* environment variables");
        const transporter = nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port || 587,
          secure: !!smtp.secure,
          auth: { user: smtp.user, pass: smtp.pass },
        });
        const body = interpolateTemplate(cfg.body || "", input || {});
        const info = await transporter.sendMail({
          from: smtp.from || smtp.user,
          to: cfg.to,
          subject: interpolateTemplate(cfg.subject || "RoseOps Notification", input || {}),
          text: body,
        });
        return { sent: true, messageId: info.messageId, to: cfg.to };
      },
    },
    discord: {
      name: "Discord",
      color: "#7289da",
      icon: "DC",
      defaults: { channel: "Discord", priority: "Normal", mode: "Auto" },
      config: [
        { key: "credentialId", label: "Webhook Credential", type: "credential", credentialTypes: ["discord_webhook", "webhook_url"], default: "" },
        { key: "message", label: "Message", type: "code", default: "" },
        { key: "username", label: "Bot Name", type: "string", default: "RoseOps" },
      ],
      validate(node) {
        if (!node.config?.credentialId) return ["Discord webhook credential is required"];
        if (!node.config?.message?.trim()) return ["Message is required"];
        return [];
      },
      async execute(node, input) {
        const cred = await resolveCredential(node, "credentialId");
        const url = cred.data.url || cred.data.webhookUrl;
        if (!url) throw new Error("Discord webhook URL missing in credential");
        const content = interpolateTemplate(node.config.message, input || {});
        const res = await axios.post(url, { content, username: node.config.username || "RoseOps" }, { timeout: 15000 });
        return { sent: true, status: res.status, message: content };
      },
    },
    github: {
      name: "GitHub",
      color: "#3d444d",
      icon: "GH",
      defaults: { channel: "GitHub", priority: "Normal", mode: "Auto" },
      config: [
        { key: "endpoint", label: "API Endpoint", type: "string", default: "" },
        { key: "credentialId", label: "GitHub Token", type: "credential", credentialTypes: ["github_token", "bearer_token"], default: "" },
        { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
        { key: "body", label: "Body (JSON)", type: "code", default: "{}" },
      ],
      validate(node) {
        if (!node.config?.endpoint?.trim()) return ["API endpoint is required"];
        return [];
      },
      async execute(node, input) {
        const cfg = node.config || {};
        const method = (cfg.method || "GET").toLowerCase();
        const headers = { Accept: "application/vnd.github+json", "User-Agent": "RoseOps-Enterprise", "X-GitHub-Api-Version": "2022-11-28" };
        const cred = await resolveCredential(node, "credentialId");
        if (cred?.data?.token) headers.Authorization = `Bearer ${cred.data.token}`;
        let data;
        if (["post", "put", "patch"].includes(method)) data = parseJsonField(cfg.body, "body");
        const res = await axios({ method, url: cfg.endpoint, headers, data, timeout: 20000, validateStatus: () => true });
        if (res.status >= 400) throw new Error(`GitHub API ${res.status}`);
        return { status: res.status, data: res.data };
      },
    },
    googleSheets: {
      name: "Google Sheets",
      color: "#34a853",
      icon: "GS",
      defaults: { channel: "Sheets", priority: "Normal", mode: "Auto" },
      config: [
        { key: "credentialId", label: "Service Account", type: "credential", credentialTypes: ["google_service_account"], default: "" },
        { key: "spreadsheetId", label: "Spreadsheet ID", type: "string", default: "" },
        { key: "range", label: "Range (e.g. Sheet1!A:C)", type: "string", default: "Sheet1!A:C" },
        { key: "rowData", label: "Row Data (JSON array)", type: "code", default: "[]" },
      ],
      validate(node) {
        const errs = [];
        if (!node.config?.credentialId) errs.push("Google service account credential is required");
        if (!node.config?.spreadsheetId?.trim()) errs.push("Spreadsheet ID is required");
        if (!node.config?.range?.trim()) errs.push("Range is required");
        return errs;
      },
      async execute(node, input) {
        const cfg = node.config || {};
        const cred = await resolveCredential(node, "credentialId");
        const raw = interpolateTemplate(cfg.rowData || "[]", { ...input, timestamp: new Date().toISOString() });
        const values = [JSON.parse(raw)];
        const auth = new google.auth.GoogleAuth({
          credentials: cred.data,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const sheets = google.sheets({ version: "v4", auth });
        const res = await sheets.spreadsheets.values.append({
          spreadsheetId: cfg.spreadsheetId,
          range: cfg.range,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values },
        });
        return {
          appended: true,
          updatedRange: res.data.updates?.updatedRange,
          updatedRows: res.data.updates?.updatedRows,
        };
      },
    },
  };

  return nodeTypes;
}

function friendlyError(err, ctx = {}) {
  const raw = err?.message || String(err);
  const nodeName = ctx.nodeName || "Node";
  if (raw.includes("ECONNREFUSED") || raw.includes("ENOTFOUND"))
    return `${nodeName}: Could not reach endpoint — verify URL and network connectivity.`;
  if (raw.includes("ETIMEDOUT") || raw.toLowerCase().includes("timeout"))
    return `${nodeName}: Request timed out.`;
  if (raw.includes("SMTP not configured"))
    return `${nodeName}: SMTP credential required — configure in Credentials vault.`;
  if (raw.includes("Credential not found"))
    return `${nodeName}: Referenced credential is missing — re-link in node inspector.`;
  if (raw.startsWith(`${nodeName}:`)) return raw;
  return `${nodeName}: ${raw}`;
}

module.exports = { createNodeRegistry, interpolateTemplate, friendlyError };