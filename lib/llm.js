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
};

function extractApiKey(cred) {
  const d = cred?.data || {};
  if (d.apiKey) return d.apiKey;
  if (d.token) return d.token;
  if (d.value) return d.value;
  throw new Error("API key missing — add your key in Secrets vault");
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