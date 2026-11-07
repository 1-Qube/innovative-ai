import {
  DEFAULT_MODELS,
  clip,
  validateIdea,
  runSynthesisStream,
} from "../../lib/syna-engine.js";

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

  let idea;
  try {
    idea = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
    });
  }

  const problem = validateIdea(idea);
  if (problem) {
    return new Response(JSON.stringify({ error: problem }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
    });
  }

  const customKey = clip(
    idea.apiKey || request.headers.get("x-gemini-key") || env.GEMINI_API_KEY || "",
    200
  );
  const rawModels = String(env.GEMINI_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const models = [...new Set([...DEFAULT_MODELS, ...rawModels])];

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const emit = (event) => {
    writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {});
  };

  (async () => {
    try {
      await runSynthesisStream(idea, { apiKey: customKey, models, emit });
    } catch (error) {
      emit({ type: "error", message: error.message || "Synthesis failed" });
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...CORS_HEADERS,
    },
  });
}
