# SYNA — Adversarial AI Startup Idea Stress Lab

> **Good ideas don’t need praise. They need pressure.**

**SYNA** puts any startup idea between two opposing AI personas — a **Growth Hacker (The Builder)** looking for a narrow 48-hour wedge and distribution trick, and a **Ruthless VC (The Challenger)** trying to kill the thesis by exposing incumbent bundling, unit-economics traps, and legal/procurement friction.

---

## 🔗 Live Shareable Link

👉 **Open SYNA Live:** **[https://1-qube.github.io/innovative-ai/](https://1-qube.github.io/innovative-ai/)**

You can send this link directly to anyone — it works immediately in any desktop or mobile browser with **zero setup or API keys required**.
- Click **"Share Link ⎘"** in the top navigation bar at any time to copy a shareable link (including your custom stress-tested startup dossier encoded directly in the URL).

---

## ✨ Core Features

1. **Idea Stress Chamber (`Idea Lab`)**
   - Submit your project title, maturity stage, elevator thesis, economic buyer, bleeding pain point, unfair advantage, pricing model, and secret founder fear.
   - Includes a 1-click **"Fill Sample Scenario ⚡"** button for instant testing.
2. **4-Round Adversarial Debate (`Debate Room`)**
   - **Round 1:** Market Wedge & Willingness to Pay
   - **Round 2:** Defensibility & Why This Is Not a Feature
   - **Round 3:** Unit Economics & Go-to-Market Friction
   - **Round 4:** Existential Risk & The Bet That Saves It
   - **Founder Intervention:** Interrupt any round with counter-evidence and force both agents to respond in real time.
3. **Adversarial Audit Docket (`Verdict`)**
   - Aggregate Survival Score (`/100`), Dialectic Stress Parameters, Validated Strategic Strengths, Lethal Vulnerabilities (Kill-Shots), and Two Paths Forward (`Path A` vs `Path B`).
4. **Editable 14-Day MVP Brief (`Blueprint`)**
   - Live-editable executive thesis, ICP, distribution wedge, defensibility moat, vulnerability remediation, 30/60/90-day milestones, and 14-day build plan.
   - 1-click **Copy Markdown** and **Print / Export PDF**.
5. **Interactive Landing Page Prototype (`Prototype`)**
   - Automatically synthesizes a conversion-ready landing page tailored to survive the VC's strongest kill-shot, complete with waitlist capture and skeptical buyer FAQ.

---

## 🧠 How the API & Synthesis Engine Work

SYNA uses a **3-tier hybrid synthesis architecture** that works immediately for judges and users with **zero API key prompts**:

1. **Server / Edge API (`/api/health`, `/api/run`, `/api/intervene`)**
   - Works natively on **Cloudflare Pages Functions** (`functions/api/*`) and **Node.js** (`server.js`).
   - Streams NDJSON events (`phase` → `debate` → `verdict` → `blueprint` → `done`).
2. **Pre-Configured Google Gemini 3.x Live LLM (`gemini-3.1-flash-lite` / `gemini-3.8-flash`)**
   - Pre-configured out of the box on both the server/Cloudflare edge and the browser client so anyone opening the link gets live multi-round Gemini adversarial synthesis automatically.
3. **Built-In Adversarial Synthesis Engine (Resilient Fallback)**
   - Guarantees 100% uptime even if offline or rate-limited.

### API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Returns `{ ok: true, hasKey, models, engine, runtime }` |
| `/api/run` | `POST` | Accepts idea JSON payload and streams `application/x-ndjson` events (`phase`, `debate`, `verdict`, `blueprint`, `done`) |
| `/api/intervene` | `POST` | Accepts `{ idea, round, note, transcript }` and returns `{ builderReply, challengerReply, shift, model }` |

---

## ☁️ Deploying to Cloudflare Pages (Ready Out-of-the-Box)

This repository includes pre-configured **Cloudflare Pages Functions** (`functions/api/health.js`, `functions/api/run.js`, `functions/api/intervene.js`) and `wrangler.toml`.

### Option A: Cloudflare Dashboard (Connect to Git)
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Select the `1-Qube/innovative-ai` repository.
3. Use these build settings:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (or `.`)
4. *(Optional)* Under **Environment variables**, add `GEMINI_API_KEY` if you want server-side Gemini synthesis by default.
5. Click **Save and Deploy**. Cloudflare will deploy both the frontend and the `/api/*` serverless functions to `https://<your-project>.pages.dev`.

### Option B: Cloudflare Wrangler CLI
```bash
npx wrangler pages deploy . --project-name syna
```

---

## 💻 Running Locally

### Prerequisites
- **Node.js 18+** (no `npm install` needed — zero external npm dependencies)

### Start the Server
```bash
# Optional: copy .env.example to .env and add GEMINI_API_KEY
cp .env.example .env

# Start the SYNA server on http://127.0.0.1:8788
npm start
```

Then open **[http://127.0.0.1:8788](http://127.0.0.1:8788)** in your browser.
*(On Windows, you can also double-click `START SYNA.vbs` to launch the local control panel.)*

---

## 📁 Project Structure

```text
.
├── index.html                  # Full SYNA single-page application (React + Tailwind + Client Engine)
├── server.js                   # Zero-dependency Node.js HTTP server & API
├── lib/
│   └── syna-engine.js          # Shared synthesis engine (used by Node server & Cloudflare Functions)
├── functions/
│   └── api/
│       ├── health.js           # Cloudflare Pages Function: GET /api/health
│       ├── run.js              # Cloudflare Pages Function: POST /api/run (NDJSON stream)
│       └── intervene.js        # Cloudflare Pages Function: POST /api/intervene
├── wrangler.toml               # Cloudflare Pages configuration
├── .env.example                # Environment variable template
└── .github/workflows/
    └── deploy-pages.yml        # Automated GitHub Pages deployment workflow
```
