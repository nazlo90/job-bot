import type { Job } from "../types";

// LinkedIn's public guest job search API — no auth required.
// f_WT=2 = remote only, f_TPR=r86400 = last 24h, sortBy=DD = newest first.
// Without sortBy/f_TPR LinkedIn returns the same "relevant" (often months old) jobs every run.
const SEARCH_TERMS = ["Angular Developer", "React Developer", "Vue Developer", "Frontend Developer", "TypeScript Developer"];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extract(card: string, re: RegExp): string {
  return re.exec(card)?.[1]?.trim() ?? "";
}

// Job view pages (/jobs/view/...) return 999 authwall for guests, so use the guest posting API.
async function fetchDescription(jobId: string): Promise<string> {
  try {
    const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const m = /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    return m?.[1]
      ? m[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&[a-z#0-9]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500)
      : "";
  } catch {
    return "";
  }
}

async function fetchSearchTerm(searchTerm: string): Promise<Job[]> {
  const jobs: Job[] = [];
  try {
    const query = encodeURIComponent(searchTerm);
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${query}&location=Worldwide&f_WT=2&f_TPR=r86400&sortBy=DD&start=0`;

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
      const jobId = extract(card, /urn:li:jobPosting:(\d+)/);
      const location = extract(card, /class="[^"]*job-search-card__location[^"]*"[^>]*>([^<]+)</);

      if (!title || !company || !jobId) continue;

      jobs.push({
        // Canonical URL: same job comes back under different country subdomains (ua., de., in.)
        url: `https://www.linkedin.com/jobs/view/${jobId}`,
        title,
        company,
        // Search is already filtered to remote (f_WT=2); card location is just the company city
        location: location ? `Remote (${location})` : "Remote",
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
    job.description = await fetchDescription(job.url.split("/").pop()!);
    await new Promise((r) => setTimeout(r, 300));
  }

  return deduped;
}
