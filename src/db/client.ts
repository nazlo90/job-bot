import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Fetch all seen URLs in one query — use this to filter a batch locally
export async function getSeenUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const { data, error } = await supabase
    .from("seen_jobs")
    .select("url")
    .in("url", urls);
  if (error) throw error;
  return new Set((data ?? []).map((r: { url: string }) => r.url));
}

// Upsert all newly processed jobs in one batch call
export async function markJobsSeenBatch(
  jobs: { url: string; title: string; company: string }[]
): Promise<void> {
  if (jobs.length === 0) return;
  const { error } = await supabase.from("seen_jobs").upsert(jobs);
  if (error) throw error;
}
