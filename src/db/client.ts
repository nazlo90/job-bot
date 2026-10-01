import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

const CHUNK_SIZE = 100;

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function getSeenUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const seen = new Set<string>();
  for (const batch of chunks(urls, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("seen_jobs")
      .select("url")
      .in("url", batch);
    if (error) throw error;
    for (const r of data ?? []) seen.add(r.url);
  }
  return seen;
}

export async function markJobsSeenBatch(
  jobs: { url: string; title: string; company: string }[]
): Promise<void> {
  if (jobs.length === 0) return;
  const unique = [...new Map(jobs.map((j) => [j.url, j])).values()];
  for (const batch of chunks(unique, CHUNK_SIZE)) {
    const { error } = await supabase.from("seen_jobs").upsert(batch, { onConflict: "url" });
    if (error) throw error;
  }
}

// Same job is often posted many times under different URLs (LinkedIn: one posting per city,
// reposts with new IDs). Normalized title+company catches those.
export function jobKey(job: { title: string; company: string }): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ") // (m/w/d), (all genders), (Remote)...
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return `${norm(job.title)}|${norm(job.company)}`;
}

const KEY_LOOKBACK_DAYS = 30;

export async function getSeenJobKeys(jobs: { title: string; company: string }[]): Promise<Set<string>> {
  const companies = [...new Set(jobs.map((j) => j.company).filter(Boolean))];
  if (companies.length === 0) return new Set();
  const since = new Date(Date.now() - KEY_LOOKBACK_DAYS * 86_400_000).toISOString();
  const keys = new Set<string>();
  for (const batch of chunks(companies, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("seen_jobs")
      .select("title, company")
      .in("company", batch)
      .gte("created_at", since);
    if (error) throw error;
    for (const r of data ?? []) keys.add(jobKey({ title: r.title ?? "", company: r.company ?? "" }));
  }
  return keys;
}

// Drops jobs already seen (by URL or by title+company) and duplicates within the batch.
export async function filterNewJobs<T extends { url: string; title: string; company: string }>(
  jobs: T[]
): Promise<{ fresh: T[]; dupes: T[] }> {
  const [seenUrls, seenKeys] = await Promise.all([getSeenUrls(jobs.map((j) => j.url)), getSeenJobKeys(jobs)]);
  const fresh: T[] = [];
  const dupes: T[] = [];
  for (const job of jobs) {
    if (seenUrls.has(job.url)) continue;
    const key = jobKey(job);
    if (seenKeys.has(key)) {
      dupes.push(job);
      continue;
    }
    seenKeys.add(key);
    fresh.push(job);
  }
  return { fresh, dupes };
}
