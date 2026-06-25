import type { Job } from "../types";

// LinkedIn's public guest job search API — no auth required.
// f_WT=2 = remote only.
const SEARCH_TERMS = ["Angular Developer", "React Developer", "Vue Developer", "Frontend Developer", "TypeScript Developer"];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extract(card: string, re: RegExp): string {
  return re.exec(card)?.[1]?.trim() ?? "";
}

async function fetchDescription(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const m =
      /<div[^>]*class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html) ??
      /<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i.exec(html);
    return m?.[1] ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) : "";
  } catch {
    return "";
  }
}

async function fetchSearchTerm(searchTerm: string): Promise<Job[]> {
  const jobs: Job[] = [];
  try {
    const query = encodeURIComponent(searchTerm);
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${query}&location=Worldwide&f_WT=2&start=0`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const cards = html.match(/<li[^>]*>([\s\S]*?)<\/li>/g) ?? [];

    for (const card of cards) {
      const title = extract(card, /class="[^"]*base-search-card__title[^"]*"[^>]*>([^<]+)</);
      const company = extract(
        card,
        /class="[^"]*base-search-card__subtitle[^"]*"[^>]*>\s*<[^>]*>\s*([^<]+)/
      );
      const url = extract(card, /href="([^"]*linkedin\.com\/jobs[^"]*)/);
      const location = extract(card, /class="[^"]*job-search-card__location[^"]*"[^>]*>([^<]+)</);

      if (!title || !company || !url) continue;

      jobs.push({
        url: url.split("?")[0]!,
        title,
        company,
        location: location || "Remote",
        salary: "",
        description: "",
        source: "LinkedIn",
      });
    }
  } catch (err) {
    console.error(`LinkedIn fetch failed for "${searchTerm}":`, err);
  }
  return jobs;
}

export async function fetchAllLinkedInJobs(): Promise<Job[]> {
  const results = await Promise.all(SEARCH_TERMS.map(fetchSearchTerm));
  const all = results.flat();

  const seen = new Set<string>();
  const deduped = all.filter((job) => {
    if (!job.url || seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });

  // Fetch descriptions for relevance filtering — sequential with a small delay to avoid rate limiting
  for (const job of deduped) {
    job.description = await fetchDescription(job.url);
    await new Promise((r) => setTimeout(r, 300));
  }

  return deduped;
}
