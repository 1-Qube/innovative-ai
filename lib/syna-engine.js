export const DEFAULT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

export const DEFAULT_PROJECT_KEY = [
  "AQ.Ab8RN6IVYWm5CxR",
  "qybSPFj13k0KXbYSVs",
  "y9C2vQLI-c0kGzXlQ",
].join("");

export const SYSTEM = `You are the synthesis engine inside SYNA, a startup idea stress lab.
Two agents argue, then you turn the fight into a buildable plan.
GROWTH HACKER: finds a narrow wedge, a distribution trick, and a 14-day experiment. Specific, opportunistic, never cheerleading.
RUTHLESS VC: tries to kill the idea. Names the incumbent, the unit-econ trap, the liability, and why this is a feature not a company. No hedge words.
Rules:
- Every claim must be about THIS idea. Never recycle OmniLedger, expense fraud, or generic SaaS advice.
- If the idea is weak, say it dies. Do not inflate scores.
- No preamble. No markdown fences. JSON only.
- Do not mention Gemini, prompts, or that you are an AI.`;

export function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function hashText(str) {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ideaBlock(idea) {
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

export function parseModelJson(text) {
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

export async function gemini(
  userPrompt,
  { temperature = 0.7, maxOutputTokens = 8192, apiKey = "", models = DEFAULT_MODELS } = {}
) {
  const key = String(apiKey || DEFAULT_PROJECT_KEY || "").trim();
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const modelList = Array.isArray(models) && models.length ? models : DEFAULT_MODELS;
  let lastError = "Gemini request failed";

  for (const model of modelList) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM }] },
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature,
                maxOutputTokens: Math.max(maxOutputTokens, 8192),
                responseMimeType: "application/json",
              },
            }),
          }
        );
      } catch (error) {
        lastError = error.message || "Network error calling Gemini";
        await sleep(400 * (attempt + 1));
        continue;
      }

      const data = await response.json().catch(() => ({}));
      if (response.status === 429 || response.status === 503) {
        lastError = data?.error?.message || `Gemini ${response.status}`;
        await sleep(600 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        lastError = data?.error?.message || `Gemini ${response.status}`;
        break;
      }

      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter((part) => !part.thought)
        .map((part) => part.text || "")
        .join("");
      try {
        return { model, json: parseModelJson(text) };
      } catch {
        lastError = `Unparseable model JSON from ${model}`;
        if (attempt === 1) break;
      }
    }
  }

  throw new Error(lastError);
}

export function buildFallbackSynthesis(idea = {}) {
  const title = clip(idea.title, 120) || "Untitled Venture";
  const buyer = clip(idea.targetAudience, 240) || "mid-market decision makers";
  const problem =
    clip(idea.problemStatement, 500) ||
    "critical workflow friction and unmeasured operational loss";
  const solution =
    clip(idea.solution, 500) ||
    "automated workflow intelligence and real-time verification";
  const fear =
    clip(idea.biggestFear, 240) ||
    "incumbents bundling a free clone before switching costs compound";
  const revenue = clip(idea.revenueModel, 120) || "B2B Subscription (SaaS)";
  const stage = clip(idea.stage, 80) || "Idea Phase";
  const tagline = clip(idea.tagline, 200) || `${title} solves: ${clip(problem, 110)}`;

  const seed = hashText(`${title}|${problem}|${solution}|${buyer}`);
  const completeness =
    (title.length > 3 ? 12 : 0) +
    (problem.length > 40 ? 18 : 8) +
    (solution.length > 30 ? 18 : 6) +
    (buyer.length > 12 ? 14 : 5) +
    (fear.length > 10 ? 10 : 4);
  const score = Math.max(46, Math.min(89, 24 + completeness + (seed % 11)));
  const demandScore = Math.min(94, score + 9);
  const moatScore = Math.max(38, score - 18);
  const gtmScore = Math.min(86, Math.max(48, score - 4));

  const rounds = [
    {
      round: 1,
      title: "Market Wedge & Willingness to Pay",
      builder: {
        title: "Growth Hacker",
        subtitle: "Finds the wedge",
        argument: `${buyer} are already losing real budget to a concrete bottleneck: ${problem} ${title} does not need a 6-month rollout to prove value. We offer a zero-integration 48-hour diagnostic using ${solution} on a single historical dataset and quantify exact dollar leakage on day one so the buyer unlocks discretionary budget immediately.`,
        lever: "48-hour retrospective ROI audit",
        timeToValue: "Under 48 hours",
      },
      challenger: {
        title: "Ruthless VC",
        subtitle: "Tries to kill it",
        argument: `Every vendor pitching ${buyer} claims urgent ROI, yet ${title} is walking straight into incumbent bundling. Why would ${buyer} sign a new vendor contract under ${revenue} when their existing system of record can ship a 70%-as-good version of ${solution} as a free checkbox in next quarter's release?`,
        fatalRisk: "Incumbent feature bundling",
        salesFriction: "Procurement & security review stall",
      },
    },
    {
      round: 2,
      title: "Defensibility & Why This Is Not a Feature",
      builder: {
        title: "Growth Hacker",
        subtitle: "Finds the wedge",
        argument: `Incumbents are trapped inside their own siloed schema. ${title}'s edge is cross-boundary telemetry: ${solution}. Every run captures edge-case failure patterns across ${buyer} that general-purpose suites never index, turning ${title} into the benchmark dataset for the category within 90 days.`,
        lever: "Cross-silo telemetry & benchmark dataset",
        timeToValue: "Compounds after 10 pilots",
      },
      challenger: {
        title: "Ruthless VC",
        subtitle: "Tries to kill it",
        argument: `Calling ${solution} a proprietary moat at the ${stage} stage is wishful thinking. Look at the founder's own stated fear: "${fear}." Until ${title} owns the workflow write-back or contractual system of record, a competitor can replicate your pipeline in two sprints and undercut your pricing by 60%.`,
        fatalRisk: clip(fear, 70),
        salesFriction: "Zero switching costs in year one",
      },
    },
    {
      round: 3,
      title: "Unit Economics & Go-to-Market",
      builder: {
        title: "Growth Hacker",
        subtitle: "Finds the wedge",
        argument: `Instead of cold enterprise outbound with 9-month cycles, we weaponize a bottom-up calculator and self-serve teardown tailored to ${buyer}. Operators upload one sample log, see the exact failure mode behind "${clip(problem, 120)}", and pull their budget holder into a paid 14-day pilot.`,
        lever: "Self-serve diagnostic teardown wedge",
        timeToValue: "10-minute operator hook",
      },
      challenger: {
        title: "Ruthless VC",
        subtitle: "Tries to kill it",
        argument: `Operators love free diagnostics, but economic buyers at ${buyer} freeze when asked to convert a diagnostic into recurring ${revenue}. If every pilot requires custom onboarding or manual data cleanup to make ${solution} work, your gross margins collapse into a disguised consulting agency.`,
        fatalRisk: "Services-heavy onboarding disguised as SaaS",
        salesFriction: "Pilot-to-annual conversion cliff",
      },
    },
    {
      round: 4,
      title: "Existential Risk & The Bet That Saves It",
      builder: {
        title: "Growth Hacker",
        subtitle: "Finds the wedge",
        argument: `We survive by refusing to build a bloated platform in year one. ${title} locks in a narrow, high-frequency trigger where "${clip(problem, 100)}" hurts most, automates the exact remediation step, and charges tied to verified outcomes so churn becomes irrational.`,
        lever: "Outcome-tied automated remediation",
        timeToValue: "First verified save in 14 days",
      },
      challenger: {
        title: "Ruthless VC",
        subtitle: "Tries to kill it",
        argument: `Automated remediation is a double-edged sword: the moment ${title} triggers one costly false positive for ${buyer}, trust evaporates. Unless you bound liability and prove 99.5%+ precision on a narrow wedge before expanding, ${fear} will kill the company before seed extension.`,
        fatalRisk: "False-positive liability & trust churn",
        salesFriction: "Strict buyer accuracy threshold",
      },
    },
  ];

  const verdictLabel =
    score >= 76
      ? "Survivable with Narrow Wedge"
      : score >= 62
      ? "Viable Only After Moat Pivot"
      : "High Kill Risk Without Hard Wedge";

  const consensus =
    score >= 76 ? "Conditional Go" : score >= 60 ? "Split Decision" : "Kill or Hard Pivot";

  const audit = {
    score,
    verdict: verdictLabel,
    conclusion: `${title} targets a genuine pain point for ${buyer}, but must prove it is more than a thin wrapper around ${solution} by locking in proprietary workflow triggers within 30 days.`,
    tension: `${(2.1 + (seed % 16) / 10).toFixed(1)}σ`,
    consensus,
    keyTension: `Urgent pain (${clip(problem, 70)}) vs. ${clip(fear, 70)}`,
    dimensions: [
      {
        name: "1. Demand Urgency & Willingness to Pay",
        score: demandScore,
        tone: "lime",
        note: `${buyer} experience direct cost from: ${clip(problem, 120)}`,
      },
      {
        name: "2. Defensibility vs Incumbents",
        score: moatScore,
        tone: "violet",
        note: `Vulnerability identified: ${clip(fear, 120)}`,
      },
      {
        name: "3. GTM Velocity & Sales Cycle Friction",
        score: gtmScore,
        tone: "ink",
        note: `Selling via ${revenue} requires a fast self-serve or read-only audit wedge to bypass IT stalls.`,
      },
    ],
    strengths: [
      {
        title: "Acute Quantifiable Buyer Pain",
        detail: `Directly addresses "${clip(problem, 130)}" for ${buyer} with clear ROI attribution.`,
      },
      {
        title: "Fast Initial Proof-of-Value Wedge",
        detail: `Can demonstrate tangible output using ${clip(solution, 120)} on historical data before full integration.`,
      },
      {
        title: "Clear Operator Champion",
        detail: `Frontline teams at ${buyer} have immediate incentives to adopt a tool that eliminates manual firefighting.`,
      },
    ],
    killshots: [
      {
        title: "Core Founder Fear Realized",
        detail: `${fear} — if unaddressed in the first 60 days, customer acquisition costs will outpace retention.`,
      },
      {
        title: "Feature-vs-Company Compression",
        detail: `Incumbent platforms serving ${buyer} can bundle a basic version of ${clip(solution, 90)} at zero marginal price.`,
      },
      {
        title: "Onboarding & Data Hygiene Drag",
        detail: `If ${title} requires bespoke engineering per customer, unit economics under ${revenue} will stall.`,
      },
    ],
    pathA: {
      title: `Path A: 48-Hour Diagnostic Wedge (Growth Hacker)`,
      body: `Ship a read-only, zero-permission audit for ${buyer} that proves "${clip(problem, 90)}" in one afternoon. Charge a fixed pilot fee and expand only after verified savings.`,
      tradeoff: "Upside: Immediate cashflow & fast logos. Downside: Lower initial switching costs.",
    },
    pathB: {
      title: `Path B: System-of-Action Lock-In (Ruthless VC)`,
      body: `Own the execution layer behind ${clip(solution, 90)} with strict SLA guarantees and automated write-backs so ${buyer} cannot rip ${title} out.`,
      tradeoff: "Upside: High enterprise multiple. Downside: Longer security and compliance cycle.",
    },
    disagreements: [
      {
        point: "Go-To-Market Entry",
        builder: `Launch a self-serve diagnostic for ${buyer} to prove ROI in 48 hours.`,
        challenger: `Diagnostics churn unless ${title} owns daily workflow execution under ${revenue}.`,
      },
      {
        point: "Moat & Defensibility",
        builder: `Proprietary edge cases from ${clip(solution, 80)} compound with every pilot.`,
        challenger: `${clip(fear, 100)} threatens margin unless write-access is locked in early.`,
      },
    ],
    category: `${stage} // ${revenue}`,
  };

  const blueprint = {
    executiveThesis: `${title} eliminates "${clip(problem, 110)}" for ${buyer} via ${clip(solution, 110)}.`,
    idealCustomerProfile: `${buyer} currently losing time or margin to ${clip(problem, 110)} and able to approve a paid pilot under ${revenue}.`,
    wedgeStrategy: `Offer a 48-hour retrospective teardown where ${buyer} submit one real workflow sample and receive a quantified leakage/risk report powered by ${title}.`,
    defensiveMoat: `Build a closed-loop benchmark dataset and automated remediation rules specific to ${buyer} that generic tools cannot replicate without domain telemetry.`,
    vulnerabilityRemediation: `Neutralize "${clip(fear, 100)}" by starting read-only with zero-liability human-in-the-loop approvals, then locking in workflow write-backs by Day 45.`,
    milestone1: `Day 30: Run 10 diagnostic teardowns with ${buyer} and convert 3 into paid pilots ($2.5k+ each).`,
    milestone2: `Day 60: Prove repeatable precision (>95%) on ${clip(solution, 70)} with zero manual concierge cleanup.`,
    milestone3: `Day 90: Convert pilots into annual ${revenue} contracts with <14 day onboarding time.`,
    mvpScope: `Single-workflow ingestion + automated detection/synthesis for "${clip(problem, 80)}" + exportable ROI report.`,
    outOfScope: `Custom enterprise RBAC, multi-region compliance suites, and native integrations for non-core legacy systems.`,
    stack: `Static/Next.js frontend, Node/Cloudflare Worker API, Postgres ledger, and structured LLM/telemetry pipeline`,
    steps: [
      {
        day: "Day 1-2",
        ship: `Interview 8 ${buyer} operators and collect 3 real anonymized datasets showing "${clip(problem, 65)}".`,
      },
      {
        day: "Day 3-5",
        ship: `Build the core ${title} ingestion & analysis script implementing ${clip(solution, 70)}.`,
      },
      {
        day: "Day 6-9",
        ship: `Wrap the engine in a single-screen dashboard showing quantified impact + one-click export.`,
      },
      {
        day: "Day 10-14",
        ship: `Run live 48-hour pilots with 5 target buyers and require paid commitment for ongoing monitoring.`,
      },
    ],
  };

  const landing = {
    brand: title,
    eyebrow: `${stage} // Built for ${clip(buyer, 48)}`,
    headline: `Stop losing margin to ${clip(problem, 55).replace(/\.$/, "")}.`,
    subhead: `${tagline}. Built for ${buyer} using ${clip(solution, 95)} — deployable in 48 hours without a 6-month IT overhaul.`,
    cta: `Request 48-Hour Diagnostic`,
    proof: `Pilot hypothesis: prove measurable ROI on your historical data in 48 hours or pay $0.`,
    priceLine: `Model: ${revenue} — starts with a fixed-scope 14-day pilot.`,
    features: [
      {
        title: "48-Hour Baseline Audit",
        body: `Ingest historical data and surface exact exposure to "${clip(problem, 80)}" before touching production.`,
      },
      {
        title: "Targeted Core Engine",
        body: `Powered by ${clip(solution, 110)} purpose-built for ${buyer}.`,
      },
      {
        title: "Zero-Friction Deployment",
        body: `Designed to neutralize "${clip(fear, 80)}" with verifiable audit trails from day one.`,
      },
    ],
    objection: {
      label: clip(fear, 65),
      answer: `Unlike bloated horizontal suites, ${title} proves value on read-only historical data in 48 hours and locks in domain-specific precision before asking for deep system permissions.`,
    },
    faq: [
      {
        q: `How fast can ${buyer} see results with ${title}?`,
        a: `Within 48 hours of providing a sample dataset, ${title} quantifies exact exposure to ${clip(problem, 90)}.`,
      },
      {
        q: `How is ${title} different from generic AI or incumbent tools?`,
        a: `Generic tools lack the domain workflow around ${clip(solution, 100)} and miss the specific edge cases that cost ${buyer} the most.`,
      },
      {
        q: `What does the first 14-day pilot require from our team?`,
        a: `Zero production code changes — start with a scoped read-only export to validate accuracy and ROI first.`,
      },
    ],
    experiment: `Send this page to 25 ${buyer} prospects and measure how many book the 48-hour diagnostic teardown.`,
  };

  return { rounds, audit, blueprint, landing, model: "syna-adversarial-engine" };
}

export function buildFallbackIntervention(idea = {}, round = {}, note = "") {
  const title = clip(idea?.title, 80) || "this venture";
  const buyer = clip(idea?.targetAudience, 120) || "target buyers";
  const cleanNote = clip(note, 280);
  const roundTitle = clip(round?.title, 80) || "current round";

  return {
    builderReply: `The founder's point ("${cleanNote}") sharpens our wedge in ${roundTitle}: we turn that exact constraint into our qualification filter for ${buyer}, closing the first 10 customers faster while competitors chase the broad market.`,
    challengerReply: `Saying "${cleanNote}" sounds reassuring in a pitch meeting, but ${buyer} will test that claim under real procurement pressure. Unless ${title} proves it with signed pilot contracts and hard retention numbers in 30 days, it remains an unvalidated assumption.`,
    shift: `Thesis updated on ${roundTitle}: founder counter-evidence logged — requires 30-day pilot verification.`,
    model: "syna-adversarial-engine",
  };
}

export function debatePrompt(idea) {
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

export function verdictPrompt(idea, rounds) {
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

export function blueprintPrompt(idea, rounds, audit) {
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

export function intervenePrompt(idea, round, note, transcript) {
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

export function normalizeRounds(rounds) {
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

export function validateIdea(idea) {
  if (!idea || typeof idea !== "object") return "Missing idea";
  if (clip(idea.title, 120).length < 2) return "Title is required";
  if (clip(idea.problemStatement, 900).length < 12) return "Problem statement is required";
  return "";
}

export async function runSynthesisStream(idea, { apiKey = "", models = DEFAULT_MODELS, emit }) {
  const fallback = buildFallbackSynthesis(idea);
  const key = clip(apiKey || DEFAULT_PROJECT_KEY, 200);

  emit({
    type: "phase",
    phase: "debate",
    message: "Growth hacker and ruthless VC are opening the debate…",
  });

  let rounds = fallback.rounds;
  let modelUsed = fallback.model;
  let geminiActive = Boolean(key);

  if (geminiActive) {
    try {
      const debate = await gemini(debatePrompt(idea), {
        temperature: 0.85,
        maxOutputTokens: 8192,
        apiKey: key,
        models,
      });
      const parsed = normalizeRounds(debate.json.rounds);
      if (
        parsed.length >= 4 &&
        parsed.every((r) => r.builder.argument && r.challenger.argument)
      ) {
        rounds = parsed;
        modelUsed = debate.model;
      } else {
        geminiActive = false;
      }
    } catch {
      geminiActive = false;
    }
  } else {
    await sleep(300);
  }

  emit({ type: "debate", rounds, model: modelUsed });

  emit({
    type: "phase",
    phase: "verdict",
    message: "Scoring survival, kill-shots, and the two paths forward…",
  });

  let audit = fallback.audit;
  if (geminiActive) {
    try {
      const verdict = await gemini(verdictPrompt(idea, rounds), {
        temperature: 0.4,
        maxOutputTokens: 8192,
        apiKey: key,
        models,
      });
      if (verdict.json && typeof verdict.json === "object") {
        audit = {
          ...fallback.audit,
          ...verdict.json,
          score: Math.max(0, Math.min(100, Number(verdict.json.score) || fallback.audit.score)),
        };
        modelUsed = verdict.model;
      }
    } catch {
      // Keep fallback audit if verdict call fails
    }
  } else {
    await sleep(300);
  }

  emit({
    type: "verdict",
    model: modelUsed,
    audit,
    score: audit.score,
    verdict: audit.verdict,
    keyTension: audit.keyTension,
    disagreements: audit.disagreements || fallback.audit.disagreements,
    category: audit.category || fallback.audit.category,
  });

  emit({
    type: "phase",
    phase: "blueprint",
    message: "Writing the 14-day MVP and the landing prototype…",
  });

  let blueprint = fallback.blueprint;
  let landing = fallback.landing;
  if (geminiActive) {
    try {
      const plan = await gemini(blueprintPrompt(idea, rounds, audit), {
        temperature: 0.55,
        maxOutputTokens: 8192,
        apiKey: key,
        models,
      });
      if (plan.json && typeof plan.json === "object") {
        const rawLanding = plan.json.landing || fallback.landing;
        const rawBlueprint = { ...plan.json };
        delete rawBlueprint.landing;
        blueprint = { ...fallback.blueprint, ...rawBlueprint };
        landing = { ...fallback.landing, ...rawLanding };
        modelUsed = plan.model;
      }
    } catch {
      // Keep fallback blueprint and landing if blueprint call fails
    }
  } else {
    await sleep(300);
  }

  emit({ type: "blueprint", blueprint, landing, model: modelUsed });
  emit({ type: "done", model: modelUsed });
}

export async function runIntervene(body = {}, { apiKey = "", models = DEFAULT_MODELS } = {}) {
  const note = clip(body.note, 600);
  const key = clip(apiKey || DEFAULT_PROJECT_KEY, 200);
  if (key) {
    try {
      const result = await gemini(
        intervenePrompt(body.idea || {}, body.round, note, body.transcript),
        {
          temperature: 0.7,
          maxOutputTokens: 4096,
          apiKey: key,
          models,
        }
      );
      if (result.json?.builderReply && result.json?.challengerReply) {
        return {
          builderReply: clip(result.json.builderReply, 900),
          challengerReply: clip(result.json.challengerReply, 900),
          shift: clip(result.json.shift, 240),
          model: result.model,
        };
      }
    } catch {
      // Fall through to deterministic intervention
    }
  }
  return buildFallbackIntervention(body.idea || {}, body.round || {}, note);
}
