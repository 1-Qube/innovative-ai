import { DEFAULT_MODELS, clip, runIntervene } from "../../lib/syna-engine.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-gemini-key",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env = {} } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
    });
  }

  const note = clip(body?.note, 600);
  if (note.length < 4) {
    return new Response(
      JSON.stringify({ error: "Write a real counter-argument first." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
      }
    );
  }

  const customKey = clip(
    body.apiKey || request.headers.get("x-gemini-key") || env.GEMINI_API_KEY || "",
    200
  );
  const rawModels = String(env.GEMINI_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const models = [...new Set([...DEFAULT_MODELS, ...rawModels])];

  const payload = await runIntervene(body, { apiKey: customKey, models });

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}
