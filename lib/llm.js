const axios = require("axios");

const LLM_PROVIDERS = {
  openai: {
    label: "OpenAI",
    credentialTypes: ["openai_api", "bearer_token"],
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    baseUrl: "https://api.openai.com/v1",
  },
  google: {
    label: "Google Gemini",
    credentialTypes: ["google_gemini"],
    defaultModel: "gemini-1.5-flash",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
  },
  deepseek: {
    label: "DeepSeek",
    credentialTypes: ["deepseek_api", "bearer_token"],
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    baseUrl: "https://api.deepseek.com",
  },
  xai: {
    label: "xAI Grok",
    credentialTypes: ["xai_grok", "bearer_token"],
    defaultModel: "grok-2-latest",
    models: ["grok-2-latest", "grok-beta"],
    baseUrl: "https://api.x.ai/v1",
  },
  ollama: {
    label: "Ollama (local)",
    credentialTypes: ["ollama_local", "bearer_token"],
    defaultModel: "llama3.2",
    models: ["llama3.2", "mistral", "phi3", "gemma2", "qwen2.5"],
    baseUrl: "http://localhost:11434/v1",
  },
  anthropic: {
    label: "Anthropic Claude",
    credentialTypes: ["anthropic_api", "bearer_token"],
    defaultModel: "claude-3-5-haiku-latest",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-opus-latest"],
  },
  azure: {
    label: "Microsoft Copilot (Azure)",
    credentialTypes: ["azure_openai"],
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-35-turbo"],
  },
  opencode: {
    label: "OpenCode Zen",
    credentialTypes: ["opencode_zen", "bearer_token"],
    defaultModel: "deepseek-v4-flash-free",
    models: [
      "deepseek-v4-flash-free",
      "mimo-v2.5-free",
      "big-pickle",
      "north-mini-code-free",
      "nemotron-3-ultra-free",
      "gpt-5-nano",
      "claude-haiku-4-5",
    ],
    baseUrl: "https://opencode.ai/zen/v1",
  },
};

function extractApiKey(cred) {
  const d = cred?.data || {};
  if (d.apiKey) return d.apiKey;
  if (d.token) return d.token;
  if (d.value) return d.value;
  throw new Error("API key missing — add your key in Secrets vault");
}

function resolveOllamaEndpoint(cred) {
  const d = cred?.data || {};
  const baseUrl = (d.baseUrl || "http://localhost:11434/v1").replace(/\/$/, "");
  const apiKey = d.apiKey || d.token || "ollama";
  return { baseUrl, apiKey };
}

function resolveAzureEndpoint(cred, model) {
  const d = cred?.data || {};
  const endpoint = (d.endpoint || d.baseUrl || "").replace(/\/$/, "");
  const apiKey = d.apiKey || d.token;
  const deployment = d.deployment || model;
  if (!endpoint) throw new Error("Azure endpoint missing — add endpoint in API keys");
  if (!apiKey) throw new Error("Azure API key missing — add your key in Secrets vault");
  return { endpoint, apiKey, deployment };
}

async function chatOpenAICompatible({ baseUrl, apiKey, model, system, user, temperature }) {
  const res = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [
        { role: "system", content: system || "You are a helpful assistant." },
        { role: "user", content: user },
      ],
      temperature: temperature ?? 0.7,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    const detail = typeof res.data?.error?.message === "string" ? res.data.error.message : JSON.stringify(res.data).slice(0, 300);
    throw new Error(`LLM API ${res.status}: ${detail}`);
  }
  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("LLM returned an empty response");
  return { text, model, provider: "openai-compatible", usage: res.data?.usage || null };
}

async function chatAnthropic({ apiKey, model, system, user, temperature }) {
  const body = {
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: user }],
    temperature: temperature ?? 0.7,
  };
  if (system?.trim()) body.system = system;
  const res = await axios.post("https://api.anthropic.com/v1/messages", body, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    timeout: 120000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    const detail = res.data?.error?.message || JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Anthropic API ${res.status}: ${detail}`);
  }
  const text = res.data?.content?.map((p) => p.text).join("") || "";
  if (!text) throw new Error("Anthropic returned an empty response");
  return { text, model, provider: "anthropic", usage: res.data?.usage || null };
}

async function chatAzureOpenAI({ endpoint, apiKey, deployment, system, user, temperature }) {
  const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-08-01-preview`;
  const res = await axios.post(
    url,
    {
      messages: [
        { role: "system", content: system || "You are a helpful assistant." },
        { role: "user", content: user },
      ],
      temperature: temperature ?? 0.7,
    },
    {
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      timeout: 120000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    const detail = typeof res.data?.error?.message === "string" ? res.data.error.message : JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Azure OpenAI ${res.status}: ${detail}`);
  }
  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Azure OpenAI returned an empty response");
  return { text, model: deployment, provider: "azure", usage: res.data?.usage || null };
}

async function chatGemini({ apiKey, model, system, user }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: user }] }],
  };
  if (system?.trim()) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  const res = await axios.post(url, body, { timeout: 120000, validateStatus: () => true });
  if (res.status >= 400) {
    const detail = res.data?.error?.message || JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Gemini API ${res.status}: ${detail}`);
  }
  const text = res.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) throw new Error("Gemini returned an empty response");
  return { text, model, provider: "google", usage: res.data?.usageMetadata || null };
}

async function runLlmChat({ provider, credential, model, systemPrompt, userPrompt, temperature }) {
  const cfg = LLM_PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown LLM provider: ${provider}`);
  const apiKey = extractApiKey(credential);
  const resolvedModel = model || cfg.defaultModel;

  if (provider === "google") {
    return chatGemini({ apiKey, model: resolvedModel, system: systemPrompt, user: userPrompt });
  }

  if (provider === "anthropic") {
    return chatAnthropic({
      apiKey,
      model: resolvedModel,
      system: systemPrompt,
      user: userPrompt,
      temperature,
    });
  }

  if (provider === "azure") {
    const { endpoint, apiKey: azureKey, deployment } = resolveAzureEndpoint(credential, resolvedModel);
    return chatAzureOpenAI({
      endpoint,
      apiKey: azureKey,
      deployment,
      system: systemPrompt,
      user: userPrompt,
      temperature,
    });
  }

  if (provider === "ollama") {
    const { baseUrl, apiKey: ollamaKey } = resolveOllamaEndpoint(credential);
    return chatOpenAICompatible({
      baseUrl,
      apiKey: ollamaKey,
      model: resolvedModel,
      system: systemPrompt,
      user: userPrompt,
      temperature,
    });
  }

  const baseUrl = cfg.baseUrl || "https://api.openai.com/v1";
  return chatOpenAICompatible({
    baseUrl,
    apiKey,
    model: resolvedModel,
    system: systemPrompt,
    user: userPrompt,
    temperature,
  });
}

module.exports = { LLM_PROVIDERS, runLlmChat, extractApiKey };