import type { Job } from "../types";

// Companies using Greenhouse public JSON API (no scraping, no auth)
const GREENHOUSE_COMPANIES: { boardToken: string; company: string }[] = [
  { boardToken: "canonical", company: "Canonical" },
  { boardToken: "grammarly", company: "Grammarly" },
  { boardToken: "automatticcareers", company: "Automattic" },
];

// Companies using Breezy HR public API
const BREEZY_COMPANIES: { companySlug: string; company: string }[] = [
  { companySlug: "gen-tech", company: "Genesis" },
];

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  content: string;
  updated_at: string;
}

interface BreezyJob {
  id: string;
  name: string;
  friendly_id: string;
  location: { name: string };
  description: string;
  published_at: string;
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

async function fetchBreezy(companySlug: string, company: string): Promise<Job[]> {
  try {
    // Breezy HR public positions endpoint
    const res = await fetch(
      `https://api.breezy.hr/v3/company/${companySlug}/positions?state=published`,
      {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const jobs = await res.json() as BreezyJob[];

    return jobs.map((j) => ({
      url: `https://${companySlug}.breezy.hr/p/${j.friendly_id}`,
      title: j.name,
      company,
      location: j.location?.name ?? "Unknown",
      salary: "",
      description: (j.description ?? "").replace(/<[^>]+>/g, "").slice(0, 500),
      source: "Breezy HR",
      postedAt: j.published_at,
    }));
  } catch (err) {
    console.error(`Breezy HR fetch failed for ${company}:`, err);
    return [];
  }
}

export async function fetchAllAtsJobs(): Promise<Job[]> {
  const [greenhouseResults, breezyResults] = await Promise.all([
    Promise.all(GREENHOUSE_COMPANIES.map((c) => fetchGreenhouse(c.boardToken, c.company))),
    Promise.all(BREEZY_COMPANIES.map((c) => fetchBreezy(c.companySlug, c.company))),
  ]);

  return [...greenhouseResults.flat(), ...breezyResults.flat()];
}
