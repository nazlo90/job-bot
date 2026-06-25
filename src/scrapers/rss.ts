import { parseStringPromise } from "xml2js";
import type { Job } from "../types";

interface RssSource {
  url: string;
  company?: string;
  source: string;
  companyInTitle?: boolean; // title format: "Company: Job Title"
}

// DOU JS category RSS — covers Angular, React, Vue, TypeScript roles
// Djinni RSS for frontend and fullstack categories
// Remotive for international remote roles
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
  {
    url: "https://remotive.io/remote-jobs/feed/?category=software-dev",
    source: "Remotive",
  },
];

function extractText(val: unknown): string {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return extractText(val[0]);
  if (val && typeof val === "object" && "_" in val) return (val as { _: string })._;
  return "";
}

const locationFallbackRe = /[A-ZА-ЯІЇЄ][a-zа-яіїє]+(?:,\s*[A-ZА-ЯІЇЄ][a-zа-яіїє]+)*/;
const salaryRe = /\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?/;

function parseLocation(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("remote") || lower.includes("віддален") || lower.includes("anywhere")) return "Remote";
  if (lower.includes("lviv") || lower.includes("львів")) return "Lviv";
  const m = locationFallbackRe.exec(text);
  return m ? m[0] : "Unknown";
}

function parseSalary(text: string): string {
  const m = salaryRe.exec(text);
  return m ? m[0] : "";
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

      // Remotive exposes <company> and <location>; WWR exposes <region> and encodes company in title
      let jobTitle = title;
      let company = extractText(i.company ?? i["dc:creator"] ?? i.author ?? "");
      if (source.companyInTitle && !company) {
        const sep = title.indexOf(": ");
        if (sep !== -1) {
          company = title.slice(0, sep).trim();
          jobTitle = title.slice(sep + 2).trim();
        }
      }
      const rawLocation = extractText(i.location ?? i.region ?? "");
      const location = rawLocation ? parseLocation(rawLocation) : parseLocation(fullText);

      return {
        url,
        title: jobTitle,
        company,
        location,
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
