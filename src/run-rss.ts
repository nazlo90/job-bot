import { fetchAllRssJobs } from "./scrapers/rss";
import { isRelevant } from "./filters/relevance";
import { getSeenUrls, markJobsSeenBatch } from "./db/client";
import { sendJobNotification } from "./notifiers/telegram";

async function main() {
  console.log(`[${new Date().toISOString()}] RSS job run started`);

  const jobs = await fetchAllRssJobs();
  console.log(`Fetched ${jobs.length} total RSS jobs`);

  const validJobs = jobs.filter((j) => !!j.url);

  // Single DB round-trip to find which URLs we've already processed
  const seenUrls = await getSeenUrls(validJobs.map((j) => j.url));
  const newJobs = validJobs.filter((j) => !seenUrls.has(j.url));
  console.log(`${newJobs.length} new (unseen) jobs to process`);

  const toMark: { url: string; title: string; company: string }[] = [];
  let sent = 0;

  for (const job of newJobs) {
    try {
      const relevant = await isRelevant(job);
      toMark.push({ url: job.url, title: job.title, company: job.company });

      if (!relevant) continue;

      await sendJobNotification(job);
      sent++;

      // Stay under Telegram's 30 msg/sec rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Error processing job "${job.title}":`, err);
    }
  }

  // Single DB round-trip to mark everything processed
  await markJobsSeenBatch(toMark);

  console.log(`Done — sent ${sent} notifications, marked ${toMark.length} jobs as seen`);
}

main().catch((err) => {
  console.error("Fatal error in run-rss:", err);
  process.exit(1);
});
