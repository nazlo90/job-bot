import { fetchAllAtsJobs } from "./scrapers/ats";
import { fetchAllPlaywrightJobs } from "./scrapers/playwright";
import { isRelevant } from "./filters/relevance";
import { getSeenUrls, markJobsSeenBatch } from "./db/client";
import { sendJobNotification } from "./notifiers/telegram";

async function main() {
  console.log(`[${new Date().toISOString()}] Company pages job run started`);

  const [atsJobs, playwrightJobs] = await Promise.all([
    fetchAllAtsJobs(),
    fetchAllPlaywrightJobs(),
  ]);

  const allJobs = [...atsJobs, ...playwrightJobs].filter((j) => !!j.url);
  console.log(`Fetched ${atsJobs.length} ATS jobs + ${playwrightJobs.length} Playwright jobs`);

  const seenUrls = await getSeenUrls(allJobs.map((j) => j.url));
  const newJobs = allJobs.filter((j) => !seenUrls.has(j.url));
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

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Error processing job "${job.title}":`, err);
    }
  }

  await markJobsSeenBatch(toMark);

  console.log(`Done — sent ${sent} notifications, marked ${toMark.length} jobs as seen`);
}

try {
  await main();
} catch (err) {
  console.error("Fatal error in run-companies:", err);
  process.exit(1);
}
