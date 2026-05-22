import { fetchAllAtsJobs } from "./scrapers/ats";
import { fetchAllPlaywrightJobs } from "./scrapers/playwright";
import { isRelevant } from "./filters/relevance";
import { isJobSeen, markJobSeen } from "./db/client";
import { sendJobNotification } from "./notifiers/telegram";

async function main() {
  console.log(`[${new Date().toISOString()}] Company pages job run started`);

  const [atsJobs, playwrightJobs] = await Promise.all([
    fetchAllAtsJobs(),
    fetchAllPlaywrightJobs(),
  ]);

  const allJobs = [...atsJobs, ...playwrightJobs];
  console.log(`Fetched ${atsJobs.length} ATS jobs + ${playwrightJobs.length} Playwright jobs`);

  let sent = 0;

  for (const job of allJobs) {
    if (!job.url) continue;

    const seen = await isJobSeen(job.url);
    if (seen) continue;

    const relevant = await isRelevant(job);
    if (!relevant) {
      await markJobSeen(job.url, job.title, job.company);
      continue;
    }

    await sendJobNotification(job);
    await markJobSeen(job.url, job.title, job.company);
    sent++;

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`Done — sent ${sent} notifications`);
}

main().catch((err) => {
  console.error("Fatal error in run-companies:", err);
  process.exit(1);
});
