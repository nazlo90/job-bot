import { parseStringPromise } from "xml2js";
import type { Job } from "../types";

interface RssSource {
  url: string;
  company?: string;
  source: string;
}

// DOU JS category RSS — covers Angular, React, Vue, TypeScript roles
// Djinni RSS for frontend and fullstack categories
const RSS_SOURCES: RssSource[] = [
  {
    url: "https://jobs.dou.ua/vacancies/feeds/?category=Javascript",
    source: "DOU",
  },
  {
    url: "https://jobs.dou.ua/vacancies/feeds/?category=Full+Stack",
    source: "DOU",
  },
  {
    url: "https://djinni.co/jobs/rss/?primary_keyword=JavaScript",
    source: "Djinni",
  },
  {
    url: "https://djinni.co/jobs/rss/?primary_keyword=TypeScript",
    source: "Djinni",
  },
  {
    url: "https://djinni.co/jobs/rss/?primary_keyword=React",
    source: "Djinni",
  },
  {
    url: "https://djinni.co/jobs/rss/?primary_keyword=Angular",
    source: "Djinni",
  },
  {
    url: "https://djinni.co/jobs/rss/?primary_keyword=Vue.js",
    source: "Djinni",
  },
];

function extractText(val: unknown): string {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return extractText(val[0]);
  if (val && typeof val === "object" && "_" in (val as object)) return (val as { _: string })._;
  return "";
}

function parseLocation(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("remote") || lower.includes("віддален")) return "Remote";
  if (lower.includes("lviv") || lower.includes("львів")) return "Lviv";
  const locationMatch = text.match(/[A-ZА-ЯІЇЄ][a-zа-яіїє]+(?:,\s*[A-ZА-ЯІЇЄ][a-zа-яіїє]+)*/);
  return locationMatch ? locationMatch[0] : "Unknown";
}

function parseSalary(text: string): string {
  const match = text.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?/);
  return match ? match[0] : "";
}

async function fetchRss(source: RssSource): Promise<Job[]> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "job-bot/1.0 (personal job tracker)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: true });

    const items: unknown[] = parsed?.rss?.channel?.[0]?.item ?? [];

    return items.map((item: unknown) => {
      const i = item as Record<string, unknown>;
      const title = extractText(i.title);
      const url = extractText(i.link ?? i.guid);
      const description = extractText(i.description ?? i["content:encoded"] ?? "");
      const fullText = `${title} ${description}`;

      return {
        url,
        title,
        company: extractText(i["dc:creator"] ?? i.author ?? ""),
        location: parseLocation(fullText),
        salary: parseSalary(fullText),
        description: description.replace(/<[^>]+>/g, "").slice(0, 500),
        source: source.source,
        postedAt: extractText(i.pubDate ?? ""),
      };
    });
  } catch (err) {
    console.error(`RSS fetch failed for ${source.url}:`, err);
    return [];
  }
}

export async function fetchAllRssJobs(): Promise<Job[]> {
  const results = await Promise.all(RSS_SOURCES.map(fetchRss));
  const all = results.flat();

  // Deduplicate by URL within this batch
  const seen = new Set<string>();
  return all.filter((job) => {
    if (!job.url || seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });
}
