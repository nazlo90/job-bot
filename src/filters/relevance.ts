import type { Job } from "../types";

// Companies from the PDF — apply looser keyword filter for these
const WHITELISTED_COMPANIES = new Set([
  "macpaw",
  "genesis",
  "preply",
  "jooble",
  "petcube",
  "skelar",
  "kiss my apps",
  "kissmyapps",
  "grammarly",
  "softserve",
  "langate",
  "langate software",
  "codeminders",
  "canonical",
  "automattic",
  "efficiency leaders",
  "hygge",
]);

const ALLOW_KEYWORDS = [
  "angular",
  "react",
  "vue",
  "typescript",
  "frontend",
  "front-end",
  "front end",
  "fullstack",
  "full-stack",
  "full stack",
  "javascript",
  "next.js",
  "nuxt",
  "svelte",
  "фронтенд",
  "фронт-енд",
];

const BLOCK_KEYWORDS = [
  "ios",
  "android",
  "mobile developer",
  "react native",
  "flutter",
  "swift",
  "kotlin",
  " java ",
  "java developer",
  "java engineer",
  ".net",
  "c#",
  "php",
  "ruby",
  "python developer",
  "django",
  "embedded",
  "firmware",
  "fpga",
  "junior",
  "джуніор",
  "стажер",
  "intern",
  " qa ",
  "тестувальник",
  "devops",
  "sysadmin",
  "data scientist",
  "data engineer",
  "machine learning",
  "designer",
  "product manager",
  "project manager",
  "sales",
  "marketing",
  "hr ",
  "recruiter",
  "scrum master",
];

const LOCATION_ALLOW = [
  "remote",
  "віддален",
  "lviv",
  "львів",
  "worldwide",
  "anywhere",
  "home-based",
  "distributed",
];

function normalize(text: string): string {
  return ` ${text.toLowerCase()} `;
}

function hasAny(text: string, keywords: string[]): boolean {
  const n = normalize(text);
  return keywords.some((kw) => n.includes(kw));
}

function isWhitelisted(company: string): boolean {
  return WHITELISTED_COMPANIES.has(company.toLowerCase().trim());
}

function isLocationOk(job: Job): boolean {
  // Whitelisted companies assumed to have remote roles — skip location check
  if (isWhitelisted(job.company)) return true;
  const text = `${job.title} ${job.location} ${job.description}`;
  return hasAny(text, LOCATION_ALLOW);
}

type FilterResult = { pass: true } | { pass: false; reason: string } | { pass: "ambiguous"; text: string };

function keywordFilter(job: Job): FilterResult {
  const searchText = `${job.title} ${job.description}`;

  // Always block these regardless of company
  if (hasAny(searchText, BLOCK_KEYWORDS)) {
    return { pass: false, reason: "blocked keyword" };
  }

  if (!isLocationOk(job)) {
    return { pass: false, reason: "location mismatch" };
  }

  // Whitelisted company — pass if not blocked
  if (isWhitelisted(job.company)) {
    return { pass: true };
  }

  // Needs at least one allow keyword
  if (hasAny(searchText, ALLOW_KEYWORDS)) {
    return { pass: true };
  }

  // No clear signal — send to Grok for scoring
  return { pass: "ambiguous", text: `${job.title}\n${job.description.slice(0, 400)}` };
}

async function scoreWithGrok(text: string): Promise<number> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return 0;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a job relevance classifier. Reply ONLY with a JSON object like {\"score\": 8}. Score 0-10 where 10 = perfect match.",
          },
          {
            role: "user",
            content: `Is this job relevant for a Senior Frontend Developer specializing in Angular/React/Vue/TypeScript who wants remote work?\n\n${text}`,
          },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return 0;
    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content.match(/\{.*\}/s)?.[0] ?? "{}") as { score?: number };
    return parsed.score ?? 0;
  } catch {
    return 0;
  }
}

export async function isRelevant(job: Job): Promise<boolean> {
  const result = keywordFilter(job);

  if (result.pass === true) return true;
  if (result.pass === false) return false;

  // Ambiguous — ask Grok
  const score = await scoreWithGrok(result.text);
  return score >= 7;
}
