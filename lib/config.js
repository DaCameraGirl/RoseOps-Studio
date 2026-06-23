require("dotenv").config();

const config = {
  port: parseInt(process.env.PORT || "3099", 10),
  host: process.env.HOST || "0.0.0.0",
  apiKey: process.env.ROSEOPS_API_KEY || "",
  encryptionKey: process.env.ROSEOPS_ENCRYPTION_KEY || "",
  dbPath: process.env.ROSEOPS_DB_PATH || "",
  maxConcurrentExecutions: parseInt(process.env.ROSEOPS_MAX_CONCURRENT_EXECUTIONS || "10", 10),
  defaultNodeRetries: parseInt(process.env.ROSEOPS_DEFAULT_RETRIES || "3", 10),
  defaultRetryDelayMs: parseInt(process.env.ROSEOPS_RETRY_DELAY_MS || "1000", 10),
  executionTimeoutMs: parseInt(process.env.ROSEOPS_EXECUTION_TIMEOUT_MS || "300000", 10),
  rateLimitWindowMs: parseInt(process.env.ROSEOPS_RATE_LIMIT_WINDOW_MS || "60000", 10),
  rateLimitMax: parseInt(process.env.ROSEOPS_RATE_LIMIT_MAX || "300", 10),
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  },
  corsOrigin: process.env.CORS_ORIGIN || "*",
  logLevel: process.env.LOG_LEVEL || "info",
};

function ensureProductionKeys() {
  if (!config.encryptionKey || config.encryptionKey.length < 32) {
    const crypto = require("crypto");
    const generated = crypto.randomBytes(32).toString("hex");
    config.encryptionKey = generated;
    console.warn("[RoseOps] ROSEOPS_ENCRYPTION_KEY not set — generated ephemeral key. Set a 32+ char key in production.");
  }
  if (!config.apiKey) {
    console.warn("[RoseOps] ROSEOPS_API_KEY not set — API is open on the local network. Set an API key for production.");
  }
}

module.exports = { config, ensureProductionKeys };