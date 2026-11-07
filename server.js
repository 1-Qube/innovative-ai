import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MODELS,
  DEFAULT_PROJECT_KEY,
  clip,
  validateIdea,
  runSynthesisStream,
  runIntervene,
} from "./lib/syna-engine.js";

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
const HOST = process.env.HOST || "0.0.0.0";
const API_KEY = process.env.GEMINI_API_KEY || DEFAULT_PROJECT_KEY || "";
const RAW_MODELS = (process.env.GEMINI_MODELS || "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const MODELS = [...new Set([...DEFAULT_MODELS, ...RAW_MODELS])];

const INDEX_FILE = path.join(__dirname, "index.html");
const LEGACY_HTML_FILE = path.join(__dirname, "innovative hackaton.html");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-gemini-key",
};

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
    ...CORS_HEADERS,
  });
  res.end(body);
}

const hits = [];
function rateLimited() {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 24) return true;
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
    sendJson(res, 429, { error: "Slow down — rate limit reached on this machine." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    ...CORS_HEADERS,
  });

  const emit = (event) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  const customKey = clip(idea.apiKey || req.headers["x-gemini-key"] || API_KEY || "", 200);

  try {
    await runSynthesisStream(idea, { apiKey: customKey, models: MODELS, emit });
  } catch (error) {
    emit({ type: "error", message: error.message || "Synthesis failed" });
  } finally {
    res.end();
  }
}

async function handleIntervene(req, res) {
  const body = await readBody(req);
  const note = clip(body.note, 600);
  if (note.length < 4) {
    sendJson(res, 400, { error: "Write a real counter-argument first." });
    return;
  }
  if (rateLimited()) {
    sendJson(res, 429, { error: "Rate limit pause. Wait a moment and inject again." });
    return;
  }
  const customKey = clip(body.apiKey || req.headers["x-gemini-key"] || API_KEY || "", 200);
  const payload = await runIntervene(body, { apiKey: customKey, models: MODELS });
  sendJson(res, 200, payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        hasKey: Boolean(API_KEY),
        models: MODELS,
        engine: API_KEY ? "gemini+fallback" : "syna-adversarial-engine",
        runtime: "node",
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

    if (req.method === "GET") {
      const cleanPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const safePath = path.resolve(__dirname, "." + cleanPath);
      if (safePath.startsWith(__dirname) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        const ext = path.extname(safePath).toLowerCase();
        const mimeMap = {
          ".html": "text/html; charset=utf-8",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".pdf": "application/pdf",
          ".mp4": "video/mp4",
          ".js": "application/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json; charset=utf-8",
        };
        res.writeHead(200, {
          "Content-Type": mimeMap[ext] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(fs.readFileSync(safePath));
        return;
      }
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { error: error.message || "Server error" });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SYNA listening at http://127.0.0.1:${PORT}`);
});
