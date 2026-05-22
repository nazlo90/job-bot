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
