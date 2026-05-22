import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function isJobSeen(url: string): Promise<boolean> {
  const { data } = await supabase
    .from("seen_jobs")
    .select("url")
    .eq("url", url)
    .maybeSingle();
  return data !== null;
}

export async function markJobSeen(url: string, title: string, company: string): Promise<void> {
  await supabase.from("seen_jobs").upsert({ url, title, company });
}
