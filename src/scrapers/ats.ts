import type { Job } from "../types";

// Companies using Greenhouse public JSON API (no scraping, no auth)
const GREENHOUSE_COMPANIES: { boardToken: string; company: string }[] = [
  { boardToken: "canonical", company: "Canonical" },
  { boardToken: "automatticcareers", company: "Automattic" },
];

// Companies using Ashby public job board API (no auth required)
const ASHBY_COMPANIES: { orgSlug: string; company: string }[] = [
  { orgSlug: "skelar", company: "SKELAR" },
  { orgSlug: "kissmyapps", company: "Kiss My Apps" },
];

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  content: string;
  updated_at: string;
}

interface AshbyJob {
  id: string;
  title: string;
  department: string;
  location: string;
  jobUrl: string;
  publishedAt: string;
  descriptionHtml: string;
  isRemote: boolean;
}

async function fetchGreenhouse(boardToken: string, company: string): Promise<Job[]> {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { jobs: GreenhouseJob[] };

    return data.jobs.map((j) => ({
      url: j.absolute_url,
      title: j.title,
      company,
      location: j.location?.name ?? "Unknown",
      salary: "",
      description: (j.content ?? "").replace(/<[^>]+>/g, "").slice(0, 500),
      source: "Greenhouse",
      postedAt: j.updated_at,
    }));
  } catch (err) {
    console.error(`Greenhouse fetch failed for ${company}:`, err);
    return [];
  }
}

async function fetchAshby(orgSlug: string, company: string): Promise<Job[]> {
  try {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${orgSlug}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { jobs: AshbyJob[] };

    return data.jobs.map((j) => ({
      url: j.jobUrl,
      title: j.title,
      company,
      location: j.location ?? (j.isRemote ? "Remote" : "Unknown"),
      salary: "",
      description: (j.descriptionHtml ?? "").replace(/<[^>]+>/g, "").slice(0, 500),
      source: "Ashby",
      postedAt: j.publishedAt,
    }));
  } catch (err) {
    console.error(`Ashby fetch failed for ${company}:`, err);
    return [];
  }
}

export async function fetchAllAtsJobs(): Promise<Job[]> {
  const [greenhouseResults, ashbyResults] = await Promise.all([
    Promise.all(GREENHOUSE_COMPANIES.map((c) => fetchGreenhouse(c.boardToken, c.company))),
    Promise.all(ASHBY_COMPANIES.map((c) => fetchAshby(c.orgSlug, c.company))),
  ]);

  return [...greenhouseResults.flat(), ...ashbyResults.flat()];
}
