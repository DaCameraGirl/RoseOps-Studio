# RoseOps Studio

Real workflow automation engine with a feminine devops twist.   

Like n8n, but make it girl devops. Actually executes workflows — not a visualizer.

## Two ways to use

### 1. Full mode (recommended) — real execution engine

```bash
npm install
npm start
```

Open http://localhost:3099 — full execution, webhooks, scheduling, SQLite persistence.

### 2. Offline mode — just open index.html

Open `index.html` directly in your browser. You can build and edit workflows, but execution requires the server. Workflows save to browser localStorage.

## What it does

**Real execution, not mockups:**
- **HTTP Request** — calls real APIs (GET, POST, PUT, PATCH, DELETE)
- **Code** — runs custom JavaScript in a VM, data flows between nodes
- **Delay** — waits, then passes data downstream
- **Filter** — conditional logic (JS expression)
- **Webhook** — receives real HTTP requests, triggers workflows
- **Schedule** — cron-based automatic execution
- **Send Email** — SMTP logging (SMTP config can be added)
- **Manual** — click Execute to run

**n8n-style features:**
- Drag-to-connect nodes via output/input handles
- Click connections to delete them
- Live SSE streaming of execution progress
- Node config panels per type (URL, code editor, cron expr, etc.)
- Workflow persistence via SQLite
- Webhook URLs auto-generated for webhook trigger nodes

## Node Types

| Node | What it does |
|---|---|
| **Trigger** | Manual, webhook, or scheduled start |

## Badge
| **HTTP Request** | Make real API calls |
| **Code** | Run JavaScript, transform data |
| **Delay** | Wait N milliseconds |
| **Filter** | Conditional pass/fail |
| **Webhook** | Receive real HTTP requests |
| **Schedule** | Cron-based execution |
| **Send Email** | Email via SMTP |

## Tech

- **Backend:** Node.js, Express, SQLite (better-sqlite3), node-cron
- **Frontend:** Vanilla JS, SVG, SSE real-time updates
- **No build step required**
