import type { Job } from "../types";

// Sources that are already geographically filtered — skip location check
const TRUSTED_SOURCES = new Set(["DOU", "Djinni"]);

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
  "віддален",    // відdaleno
  "дистанційн",  // dystantsiyno
  "lviv",
  "львів",
  "worldwide",
  "anywhere",
  "home-based",
  "distributed",
  "по всій україн", // "across Ukraine" = effectively remote
  "ukraine",
  "україн",
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
  // DOU/Djinni are Ukrainian boards — location already scoped, skip check
  if (TRUSTED_SOURCES.has(job.source)) return true;
  // Whitelisted companies assumed remote
  if (isWhitelisted(job.company)) return true;
  const text = `${job.title} ${job.location} ${job.description}`;
  return hasAny(text, LOCATION_ALLOW);
}

type FilterResult =
  | { pass: true }
  | { pass: false; reason: string }
  | { pass: "ambiguous"; text: string };

function keywordFilter(job: Job): FilterResult {
  const searchText = `${job.title} ${job.description}`;

  if (hasAny(searchText, BLOCK_KEYWORDS)) {
    return { pass: false, reason: `blocked keyword in "${job.title}"` };
  }

  if (!isLocationOk(job)) {
    return { pass: false, reason: `location mismatch — location: "${job.location}"` };
  }

  if (isWhitelisted(job.company)) {
    return { pass: true };
  }

  if (hasAny(searchText, ALLOW_KEYWORDS)) {
    return { pass: true };
  }

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
              'You are a job relevance classifier. Reply ONLY with a JSON object like {"score": 8}. Score 0-10 where 10 = perfect match.',
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
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content.match(/\{.*\}/s)?.[0] ?? "{}") as { score?: number };
    return parsed.score ?? 0;
  } catch {
    return 0;
  }
}

export async function isRelevant(job: Job, verbose = false): Promise<boolean> {
  const result = keywordFilter(job);

  if (result.pass === false) {
    if (verbose) console.log(`  SKIP — ${result.reason}`);
    return false;
  }

  if (result.pass === true) {
    if (verbose) console.log(`  PASS — keyword match: "${job.title}" @ ${job.company}`);
    return true;
  }

  // Ambiguous — ask Grok
  const score = await scoreWithGrok(result.text);
  if (verbose) console.log(`  GROK score ${score}/10 — "${job.title}" @ ${job.company}`);
  return score >= 7;
}
