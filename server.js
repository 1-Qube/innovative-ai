import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8788);
const API_KEY = process.env.GEMINI_API_KEY || "";
const MODELS = (process.env.GEMINI_MODELS || "gemini-3.5-flash-lite,gemini-3.8-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const HTML_FILE = path.join(__dirname, "innovative hackaton.html");

const SYSTEM = `You are the synthesis engine inside SYNA, a startup idea stress lab.
Two agents argue, then you turn the fight into a buildable plan.
GROWTH HACKER: finds a narrow wedge, a distribution trick, and a 14-day experiment. Specific, opportunistic, never cheerleading.
RUTHLESS VC: tries to kill the idea. Names the incumbent, the unit-econ trap, the liability, and why this is a feature not a company. No hedge words.
Rules:
- Every claim must be about THIS idea. Never recycle OmniLedger, expense fraud, or generic SaaS advice.
- If the idea is weak, say it dies. Do not inflate scores.
- No preamble. No markdown fences. JSON only.
- Do not mention Gemini, prompts, or that you are an AI.`;

function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function ideaBlock(idea) {
  return [
    `Title: ${clip(idea.title, 120)}`,
    `Tagline: ${clip(idea.tagline, 240)}`,
    `Stage: ${clip(idea.stage, 80)}`,
    `Revenue model: ${clip(idea.revenueModel, 160)}`,
    `Target customer: ${clip(idea.targetAudience, 400)}`,
    `Problem: ${clip(idea.problemStatement, 900)}`,
    `Solution: ${clip(idea.solution, 900)}`,
    `Founder fear: ${clip(idea.biggestFear, 400)}`,
  ].join("\n");
}

function parseModelJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model did not return JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function gemini(userPrompt, { temperature = 0.7, maxOutputTokens = 4096 } = {}) {
  if (!API_KEY) throw new Error("Missing GEMINI_API_KEY in .env");
  let lastError = "Gemini request failed";

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": API_KEY,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM }] },
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature,
                maxOutputTokens,
                responseMimeType: "application/json",
                thinkingConfig: { thinkingLevel: "MINIMAL" },
              },
            }),
          }
        );
      } catch (error) {
        lastError = error.message || "Network error calling Gemini";
        await sleep(600 * (attempt + 1));
        continue;
      }

      const data = await response.json().catch(() => ({}));
      if (response.status === 429 || response.status === 503) {
        lastError = data?.error?.message || `Gemini ${response.status}`;
        await sleep(900 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        lastError = data?.error?.message || `Gemini ${response.status}`;
        break;
      }

      const text = (data.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || "")
        .join("");
      try {
        return { model, json: parseModelJson(text) };
      } catch (error) {
        lastError = `Unparseable model JSON from ${model}`;
        if (attempt === 2) break;
      }
    }
  }

  throw new Error(lastError);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debatePrompt(idea) {
  return `Run a 4-round adversarial debate on this startup idea.

${ideaBlock(idea)}

Return this JSON shape exactly:
{
  "rounds": [
    {
      "round": 1,
      "title": "Market Wedge & Willingness to Pay",
      "builder": { "argument": "90-130 words", "lever": "4-8 word lever", "timeToValue": "short label" },
      "challenger": { "argument": "90-130 words", "fatalRisk": "4-8 word risk", "salesFriction": "short label" }
    }
  ]
}

Round titles, in order:
1. Market Wedge & Willingness to Pay
2. Defensibility & Why This Is Not a Feature
3. Unit Economics & Go-to-Market
4. Existential Risk & The Bet That Saves It

builder = Growth Hacker. challenger = Ruthless VC.
Each argument must name a concrete mechanism, buyer, competitor, or number tied to this idea.
The VC speaks second in spirit: attack the hacker's claim, do not write a parallel essay.`;
}

function verdictPrompt(idea, rounds) {
  return `Score this idea after the debate. Be willing to score under 50 if it should die.

${ideaBlock(idea)}

DEBATE:
${JSON.stringify(rounds)}

Return JSON:
{
  "score": 0,
  "verdict": "5-8 word verdict",
  "conclusion": "2 sentences a founder can act on",
  "tension": "e.g. 2.4σ",
  "consensus": "Kill / Split Decision / Conditional Go",
  "keyTension": "one sentence naming the central unresolved fight",
  "dimensions": [
    { "name": "1. Demand Urgency & Willingness to Pay", "score": 0, "tone": "lime", "note": "one sentence" },
    { "name": "2. Defensibility vs Incumbents", "score": 0, "tone": "violet", "note": "one sentence" },
    { "name": "3. GTM Velocity & Sales Cycle Friction", "score": 0, "tone": "ink", "note": "one sentence" }
  ],
  "strengths": [
    { "title": "4-7 words", "detail": "one sentence" },
    { "title": "4-7 words", "detail": "one sentence" },
    { "title": "4-7 words", "detail": "one sentence" }
  ],
  "killshots": [
    { "title": "4-7 words", "detail": "one sentence" },
    { "title": "4-7 words", "detail": "one sentence" },
    { "title": "4-7 words", "detail": "one sentence" }
  ],
  "pathA": { "title": "Path A: short name", "body": "2 sentences, the growth-hacker path", "tradeoff": "Upside: ... Downside: ..." },
  "pathB": { "title": "Path B: short name", "body": "2 sentences, the VC-hardened path", "tradeoff": "Upside: ... Downside: ..." },
  "disagreements": [
    { "point": "short label", "builder": "one sentence", "challenger": "one sentence" },
    { "point": "short label", "builder": "one sentence", "challenger": "one sentence" }
  ],
  "category": "short market category"
}
tone must be lime, violet, or ink. lime = healthy, violet = dangerous, ink = mixed.
score is an integer 0-100 and must match the harshness of the kill-shots.`;
}

function blueprintPrompt(idea, rounds, audit) {
  return `Turn the debate into a 14-day MVP and a landing-page prototype. Do not write a fantasy company. Write what one founder can ship.

${ideaBlock(idea)}

VERDICT:
${JSON.stringify(audit)}

DEBATE:
${JSON.stringify(rounds)}

Return JSON:
{
  "executiveThesis": "one sharp sentence",
  "idealCustomerProfile": "who pays, in one or two sentences",
  "wedgeStrategy": "the first distribution wedge, specific channel and offer",
  "defensiveMoat": "the only moat worth building in year one, or say there is none yet",
  "vulnerabilityRemediation": "how to neutralize the strongest VC kill-shot without boiling the ocean",
  "milestone1": "day-30 gate with a number",
  "milestone2": "day-60 gate with a number",
  "milestone3": "day-90 gate with a number",
  "mvpScope": "what the 14-day build includes",
  "outOfScope": "what is explicitly not built",
  "stack": "boring recommended stack in one line",
  "steps": [
    { "day": "Day 1-2", "ship": "concrete output" },
    { "day": "Day 3-5", "ship": "concrete output" },
    { "day": "Day 6-9", "ship": "concrete output" },
    { "day": "Day 10-14", "ship": "concrete output" }
  ],
  "landing": {
    "brand": "product name",
    "eyebrow": "short category",
    "headline": "max 12 words, not a slogan cliche",
    "subhead": "max 32 words, must answer the strongest objection",
    "cta": "button label",
    "proof": "one proof line. If unproven, label it as a pilot hypothesis, do not invent fake customers.",
    "priceLine": "the first offer and price logic",
    "features": [
      { "title": "3-5 words", "body": "one sentence" },
      { "title": "3-5 words", "body": "one sentence" },
      { "title": "3-5 words", "body": "one sentence" }
    ],
    "objection": { "label": "the VC kill-shot in 8 words", "answer": "how the page answers it" },
    "faq": [
      { "q": "question", "a": "answer" },
      { "q": "question", "a": "answer" },
      { "q": "question", "a": "answer" }
    ],
    "experiment": "the one landing test to run this week"
  }
}`;
}

function intervenePrompt(idea, round, note, transcript) {
  return `The founder just interrupted the debate. Both agents must respond to THIS note, not repeat their last speech.

${ideaBlock(idea)}

CURRENT ROUND:
${JSON.stringify(round || {})}

FOUNDER NOTE:
${clip(note, 600)}

PRIOR ROUNDS:
${JSON.stringify(transcript || [])}

Return JSON:
{
  "builderReply": "60-90 words. Growth hacker either uses the note as a wedge or admits it doesn't save the idea.",
  "challengerReply": "60-90 words. Ruthless VC attacks the note. If it is hand-waving, say so.",
  "shift": "one sentence: what changed in the thesis"
}`;
}

function normalizeRounds(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  return list.slice(0, 4).map((round, index) => ({
    round: index + 1,
    title: clip(round.title, 80) || `Round ${index + 1}`,
    builder: {
      title: "Growth Hacker",
      subtitle: "Finds the wedge",
      argument: clip(round.builder?.argument || round.builder, 1200),
      lever: clip(round.builder?.lever, 80),
      timeToValue: clip(round.builder?.timeToValue, 80),
    },
    challenger: {
      title: "Ruthless VC",
      subtitle: "Tries to kill it",
      argument: clip(round.challenger?.argument || round.challenger, 1200),
      fatalRisk: clip(round.challenger?.fatalRisk, 80),
      salesFriction: clip(round.challenger?.salesFriction, 80),
    },
  }));
}

function readBody(req, limit = 120_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function validateIdea(idea) {
  if (!idea || typeof idea !== "object") return "Missing idea";
  if (clip(idea.title, 120).length < 2) return "Title is required";
  if (clip(idea.problemStatement, 900).length < 12) return "Problem statement is required";
  return "";
}

const hits = [];
function rateLimited() {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 8) return true;
  hits.push(now);
  return false;
}

async function handleRun(req, res) {
  const idea = await readBody(req);
  const problem = validateIdea(idea);
  if (problem) {
    sendJson(res, 400, { error: problem });
    return;
  }
  if (rateLimited()) {
    sendJson(res, 429, { error: "Slow down — free tier is 8 runs per minute on this machine." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });

  const emit = (event) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    emit({ type: "phase", phase: "debate", message: "Growth hacker and ruthless VC are opening the debate…" });
    const debate = await gemini(debatePrompt(idea), { temperature: 0.85, maxOutputTokens: 4096 });
    const rounds = normalizeRounds(debate.json.rounds);
    if (rounds.length < 4 || rounds.some((round) => !round.builder.argument || !round.challenger.argument)) {
      throw new Error("Debate came back incomplete. Try again.");
    }
    emit({ type: "debate", rounds, model: debate.model });

    emit({ type: "phase", phase: "verdict", message: "Scoring survival, kill-shots, and the two paths forward…" });
    const verdict = await gemini(verdictPrompt(idea, rounds), { temperature: 0.4, maxOutputTokens: 3072 });
    const audit = verdict.json || {};
    audit.score = Math.max(0, Math.min(100, Number(audit.score) || 0));
    emit({
      type: "verdict",
      model: verdict.model,
      audit,
      score: audit.score,
      verdict: audit.verdict,
      keyTension: audit.keyTension,
      disagreements: audit.disagreements || [],
      category: audit.category,
    });

    emit({ type: "phase", phase: "blueprint", message: "Writing the 14-day MVP and the landing prototype…" });
    const plan = await gemini(blueprintPrompt(idea, rounds, audit), { temperature: 0.55, maxOutputTokens: 4096 });
    const blueprint = plan.json || {};
    const landing = blueprint.landing || null;
    delete blueprint.landing;
    emit({ type: "blueprint", blueprint, landing, model: plan.model });
    emit({ type: "done", model: plan.model });
  } catch (error) {
    emit({ type: "error", message: error.message || "Synthesis failed" });
  } finally {
    res.end();
  }
}

async function handleIntervene(req, res) {
  const body = await readBody(req);
  const note = clip(body.note, 600);
  if (note.length < 8) {
    sendJson(res, 400, { error: "Write a real counter-argument first." });
    return;
  }
  if (rateLimited()) {
    sendJson(res, 429, { error: "Free-tier pause. Wait a minute and inject again." });
    return;
  }
  try {
    const result = await gemini(intervenePrompt(body.idea || {}, body.round, note, body.transcript), {
      temperature: 0.7,
      maxOutputTokens: 1024,
    });
    sendJson(res, 200, {
      builderReply: clip(result.json.builderReply, 900),
      challengerReply: clip(result.json.challengerReply, 900),
      shift: clip(result.json.shift, 240),
      model: result.model,
    });
  } catch (error) {
    sendJson(res, 502, { error: error.message || "Intervention failed" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: Boolean(API_KEY),
        models: MODELS,
        engine: "gemini-free-tier",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/run") {
      await handleRun(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/intervene") {
      await handleIntervene(req, res);
      return;
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = fs.readFileSync(HTML_FILE);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { error: error.message || "Server error" });
    else res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SYNA listening at http://127.0.0.1:${PORT}`);
});
