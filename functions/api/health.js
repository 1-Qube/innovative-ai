import { DEFAULT_MODELS } from "../../lib/syna-engine.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-gemini-key",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const env = context.env || {};
  const apiKey = env.GEMINI_API_KEY || "";
  const rawModels = String(env.GEMINI_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const models = [...new Set([...DEFAULT_MODELS, ...rawModels])];

  return new Response(
    JSON.stringify({
      ok: true,
      hasKey: Boolean(apiKey),
      models,
      engine: apiKey ? "gemini+fallback" : "syna-adversarial-engine",
      runtime: "cloudflare-pages",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...CORS_HEADERS,
      },
    }
  );
}
