<div align="center">

# ✿ RoseOps Studio

**Enterprise workflow automation with a feminine DevOps soul.**  
Real execution engine — not a mockup. Not a visualizer.

<br />

[![Version](https://img.shields.io/badge/version-3.0.0--enterprise-e8739a?style=for-the-badge&logo=semanticrelease&logoColor=white)](https://github.com/DaCameraGirl/RoseOps-Studio/releases)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](package.json)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](app.js)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](server.js)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](server.js)
[![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-c24b73?style=for-the-badge)](LICENSE)

<br />

[![Live Studio](https://img.shields.io/badge/🌐_Live_Studio-GitHub_Pages-b8a9d4?style=for-the-badge)](https://dacameragirl.github.io/RoseOps-Studio/)
[![API](https://img.shields.io/badge/⚡_Engine-Node_Server-a8d8c8?style=for-the-badge)](server.js)
[![Credentials](https://img.shields.io/badge/🔐_Vault-AES--256--GCM-9b8ec4?style=for-the-badge)](lib/crypto.js)
[![Audit](https://img.shields.io/badge/📋_Audit-Full_Trail-7bc4b4?style=for-the-badge)](lib/audit.js)

<br />

[Quick Start](#-quick-start) · [Features](#-features) · [What's Been Built](#-whats-been-built-grok--angela-sessions) · [Node Types](#-node-types) · [Deploy](#-deploy) · [Architecture](#-architecture)

---

</div>

## ✨ What is RoseOps?

RoseOps Studio is **n8n-inspired workflow automation** built for people who want power *without* the bro-y DevOps aesthetic. Drag nodes, connect handles, execute real workflows — with encrypted credentials, audit logs, and production validation baked in.

| | Traditional automation tools | RoseOps Studio |
|---|---|---|
| **Vibe** | Dark mode, monospace, intimidating | Warm, animated, welcoming |
| **Secrets** | Pasted in node config | AES-256-GCM credentials vault |
| **Execution** | Often cloud-only | Self-hosted Node engine + SQLite |
| **Validation** | Run and pray | DAG validation on every save |

---

## 🚀 Quick Start

### Full stack (recommended)

```bash
git clone https://github.com/DaCameraGirl/RoseOps-Studio.git
cd RoseOps-Studio
npm install
cp .env.example .env   # set ROSEOPS_API_KEY + ROSEOPS_ENCRYPTION_KEY
npm start
```

Open **http://localhost:3099** — UI + execution engine together.

### GitHub Pages (UI preview only)

**[dacameragirl.github.io/RoseOps-Studio](https://dacameragirl.github.io/RoseOps-Studio/)** hosts the studio UI for browsing and building flows.  
**Running workflows requires the engine** — the live site includes a full **Setup guide** (sidebar, top bar, and Getting started panel) with engine + Grok/API key steps. README mirrors that for GitHub visitors.

| Who | What to do |
|-----|------------|
| **New users** | Clone repo → `npm install` → `npm start` → open **http://localhost:3099** |
| **Desktop shortcut** | Run `start-roseops.cmd` (opens localhost + engine) |
| **GitHub Pages visitors** | Tap **How to connect** in the banner, or the **● pages** status badge |
| **Self-hosters** | Deploy `server.js` to Render/Railway → **Connect engine** → paste your URL |

In the app: type **`connect`** in Assistant chat, or click the connection status (● pages / ● offline).

### Free AI options (all providers)

**Setup guide → section 2** has a **dropdown + tabs** per provider (OpenCode, Local, Gemini, DeepSeek, Claude, Grok, Copilot, OpenAI) with PowerShell install/test commands.

| Provider | Cost |
|----------|------|
| **OpenCode Zen** | **Free models** (DeepSeek Flash Free, MiMo, Big Pickle, Nemotron…) |
| **Local (Ollama)** | Always free |
| **Gemini** | Free tier |
| **DeepSeek** | Freemium |
| **Anthropic Claude** | Trial → paid |
| **xAI Grok** | Free credits |
| **Microsoft Copilot (Azure)** | Azure credits |
| **OpenAI** | Trial → paid |

In RoseOps: **API keys** dropdown → **Add key** → **AI Chat** step → matching provider + model.

---

## 📖 What's been built (Grok + Angela sessions)

This section is the **verbose honest log** of what shipped recently — especially the work from **June 22–23, 2026** when Angela started pairing with **Grok** in Cursor to turn RoseOps from “pretty UI” into something people can actually run, connect, and use with real AI.

A mirror of this log lives in the companion repo **[groks-work](https://github.com/DaCameraGirl/groks-work)** (session notes, PR trail, decisions).

### The goal we kept circling back to

> **n8n for the girlies** — enterprise-grade workflow automation that feels welcoming, not intimidating.  
> Build flows in the browser. Run them for real. Store API keys safely. **Nobody should need to read GitHub docs to figure out how to connect.**

### Before vs after (this sprint)

| Area | Before | After |
|------|--------|-------|
| **New workflow** | Empty list, confusing | **Starter picker** on `+` — 7 templates including AI Assistant |
| **Onboarding** | Broken on GitHub Pages | Fixed deployment path; empty canvas auto-repairs from templates |
| **UX copy** | Dev-tool jargon | Plain language, checklists, toasts, Getting started panel |
| **Canvas** | Steps off-screen at bottom | Fit-to-view, horizontal auto-arrange, “Show all steps” |
| **API keys** | Unclear | n8n-style vault + quick-add; **dropdown per provider** |
| **LLMs** | None | OpenAI, Gemini, DeepSeek, Grok, **Claude**, **Azure Copilot**, **local Ollama** |
| **Connecting engine** | Mystery URL field | In-app **Setup guide** — sidebar, tabs, PowerShell, chat commands |
| **Desktop** | Broken shortcut (`m9m` path) | `start-roseops.cmd` + health check on port 3099 |
| **GitHub Pages** | Looked connected but couldn’t run | Preview mode banner; connect to localhost or deployed engine |

### Merged pull requests (#5 → #18)

Each item was a **feature branch → PR → merge to `master`** (Angela approves direction; agents ship).

| PR | What it did |
|----|-------------|
| **#5** | Starter workflow picker when you hit `+ Add` |
| **#6** | Onboarding / deployment path fix |
| **#7** | UX friendliness pass — hints, guide panel, warmer copy |
| **#8** | Canvas fit-to-view — steps visible without scrolling |
| **#9** | LLM node + encrypted API keys (OpenAI, Gemini, DeepSeek, Grok) |
| **#10** | Empty canvas repair on GitHub Pages (templates hydrate workflows) |
| **#11** | Desktop launcher `start-roseops.cmd` + shortcut fix |
| **#12** | Connect engine modal — desktop icon vs deploy URL explained |
| **#13** | Self-service “How to connect” (banner, status badge, chat) |
| **#14** | Full setup guide **in the website**, not just README |
| **#15** | Free local LLMs via **Ollama** + PowerShell |
| **#16** | Complete local LLM checklist (engine + Ollama + first run) |
| **#17** | All free/freemium cloud providers documented (not just Grok) |
| **#18** | **Dropdown + tabs** per AI provider with PowerShell test scripts |

Earlier foundation: **#3** Enterprise v3 engine, **#4** visual overhaul.

### In-app Setup guide (the main self-service doc)

Everything below lives **on the live site** — hard refresh (`Ctrl+Shift+R`) if you don’t see it.

**Section 1 — Connect the engine**

RoseOps = **studio** (UI) + **engine** (`server.js`). GitHub Pages is preview-only.

- Clone → `npm install` → `npm start` → `http://localhost:3099`
- Or double-click `start-roseops.cmd` / desktop shortcut
- Or deploy `server.js` to Render/Railway → **Connect engine** → paste URL

**Section 2 — All AI providers (dropdown + tabs)**

| Tab | Provider | Free until… | PowerShell in guide |
|-----|----------|-------------|---------------------|
| OpenCode | OpenCode Zen | Many models free | `npm i -g opencode-ai`, Zen API test |
| Local | Ollama | Always free | `winget install Ollama.Ollama`, `ollama pull llama3.2` |
| Gemini | Google | Rate limits | `Invoke-RestMethod` test |
| DeepSeek | DeepSeek | Freemium limits | API test script |
| Claude | Anthropic | Trial → paid | `x-api-key` test |
| Grok | xAI | Credits run out | Bearer test |
| Copilot | Azure OpenAI | Azure credits | Endpoint + deployment test |
| OpenAI | OpenAI | Trial → paid | Chat completions test |

**API keys sidebar:** dropdown → **Add key** → pick key in **AI Chat** step → **Run workflow**.

**Assistant chat shortcuts:** `connect` · `gemini` · `deepseek` · `claude` · `grok` · `copilot` · `openai` · `ollama` · `keys` · `help`

### Technical additions (engine)

- `lib/llm.js` — multi-provider chat (OpenAI-compatible, Gemini, Anthropic Messages, Azure OpenAI, Ollama)
- `lib/credentials.js` — types: `openai_api`, `google_gemini`, `deepseek_api`, `xai_grok`, `anthropic_api`, `azure_openai`, `ollama_local`
- `lib/starter-workflows.js` + `starters.json` — template catalog with repair for empty workflows
- `app.js` — `AI_PROVIDER_GUIDES`, tabbed setup modal, SSE, localStorage fallback on Pages

### URLs

| What | URL |
|------|-----|
| Live UI (Pages) | https://dacameragirl.github.io/RoseOps-Studio/ |
| Full stack local | http://localhost:3099 |
| Main repo | https://github.com/DaCameraGirl/RoseOps-Studio |
| Grok session log repo | https://github.com/DaCameraGirl/groks-work |

### What’s still “you need the engine”

GitHub Pages **cannot** run Node. Building flows works; **Run workflow**, encrypted vault, and Ollama calls need `npm start` locally (or a deployed engine). The app explains this everywhere now — that was the whole point.

---

## 💎 Features

### Execution engine
- **HTTP Request** — real API calls with retries + auth credentials
- **Code** — sandboxed JavaScript transforms
- **Delay / Filter / IF** — flow control with validation
- **Webhook** — HMAC-signed inbound triggers
- **Schedule** — cron with expression validation
- **Email** — real SMTP via nodemailer + vault credentials

### Integrations
- **Discord** — webhook credential-backed alerts
- **GitHub** — API with token credentials
- **Google Sheets** — Sheets API v4 via service account

### Enterprise
- 🔐 **Credentials vault** — secrets never stored in node plaintext
- 📋 **Audit log** — every credential, workflow, and execution event
- 🔁 **Workflow versioning** — snapshot on every save
- ⚡ **Queued execution** — concurrency limits + per-node retries
- 🛡️ **API key auth** + rate limiting + Helmet security headers

### Studio UX
- Drag-and-drop node palette → canvas
- Magnetic connection snapping
- Live SSE execution streaming
- Operations templates (API Pipeline, Incident Notify, Compliance Watch)
- Animated rose/lavender interface — because tools should feel *good*

---

## 🧩 Node Types

| Node | What it does |
|---|---|
| **Trigger** | Manual, webhook, or scheduled entry |
| **HTTP Request** | Authenticated API calls with retries |
| **Code** | JavaScript transform (hardened sandbox) |
| **Delay** | Timed wait, passes data downstream |
| **Filter** | Conditional gate — stops flow on fail |
| **Webhook** | Signed inbound HTTP receiver |
| **Schedule** | Cron-based automatic execution |
| **Send Email** | SMTP delivery via vault credential |
| **Discord** | Channel alerts via webhook credential |
| **GitHub** | Repository/API operations |
| **Google Sheets** | Append rows via service account |

---

## 🌐 Deploy

| Target | What runs | How |
|---|---|---|
| **Local** | UI + engine | `npm start` → port 3099 |
| **GitHub Pages** | UI only | Auto-deploys from `master` |
| **Render / Railway** | Engine only | Deploy `server.js`, set env vars from `.env.example` |

### Required environment variables

```env
ROSEOPS_API_KEY=your-secure-key
ROSEOPS_ENCRYPTION_KEY=32-plus-character-secret
```

---

## 🏗 Architecture

```
RoseOps-Studio/
├── app.js              # Studio UI — canvas, inspector, credentials panel
├── index.html          # Shell
├── styles.css          # Rose/lavender design system + animations
├── server.js           # Express API gateway
└── lib/
    ├── credentials.js  # Encrypted vault
    ├── execution.js    # Queued workflow engine
    ├── nodes.js        # Node registry + real integrations
    ├── validate.js     # DAG validation
    ├── triggers.js     # Webhooks + cron
    └── audit.js        # Audit logging
```

**Stack:** Node.js · Express · SQLite (WAL) · Vanilla JS · SVG canvas · SSE  
**No build step.** Clone, install, run.

---

<div align="center">

<br />

**RoseOps Studio** — workflow automation that doesn't hate you.

Made with ✿ by [DaCameraGirl](https://github.com/DaCameraGirl)

</div>