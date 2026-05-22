import { chromium, type Page } from "playwright";
import type { Job } from "../types";

interface CareerPageConfig {
  company: string;
  url: string;
  scrape: (page: Page, company: string) => Promise<Job[]>;
}

// Generic job list scraper — extracts links that look like job postings
async function genericJobLinks(
  page: Page,
  company: string,
  source: string,
  baseUrl: string,
  linkSelector: string,
  titleSelector?: string
): Promise<Job[]> {
  const jobs: Job[] = [];
  const anchors = await page.$$(linkSelector);

  for (const anchor of anchors) {
    const href = await anchor.getAttribute("href");
    const text = await anchor.innerText();
    if (!href || !text.trim()) continue;

    const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
    const title = titleSelector
      ? (await (await anchor.$(titleSelector))?.innerText()) ?? text.trim()
      : text.trim();

    jobs.push({
      url,
      title: title.trim(),
      company,
      location: "Remote",
      salary: "",
      description: "",
      source,
    });
  }
  return jobs;
}

const CAREER_PAGES: CareerPageConfig[] = [
  {
    company: "MacPaw",
    url: "https://macpaw.com/careers-all",
    scrape: async (page, company) => {
      await page.waitForSelector("a[href*='/careers/']", { timeout: 15_000 });
      return genericJobLinks(page, company, "MacPaw careers", "https://macpaw.com", "a[href*='/careers/']:not([href='/careers'])");
    },
  },
  {
    company: "Petcube",
    url: "https://petcube.com/careers/",
    scrape: async (page, company) => {
      await page.waitForSelector("a[href*='jobs.dou.ua'], a[href*='petcube.com/careers']", { timeout: 15_000 }).catch(() => {});
      return genericJobLinks(page, company, "Petcube careers", "https://petcube.com", "a[href*='jobs.dou.ua'], a[href*='lever.co'], a[href*='greenhouse.io']");
    },
  },
  {
    company: "Preply",
    url: "https://preply.com/en/careers",
    scrape: async (page, company) => {
      await page.waitForSelector("a[href*='/careers/']", { timeout: 20_000 }).catch(() => {});
      return genericJobLinks(page, company, "Preply careers", "https://preply.com", "a[href*='/careers/']:not([href='/en/careers'])");
    },
  },
  {
    company: "SoftServe",
    url: "https://career.softserveinc.com/en-us/vacancies/country-ukraine/direction-software-development",
    scrape: async (page, company) => {
      await page.waitForSelector("a[href*='/vacancies/']", { timeout: 20_000 }).catch(() => {});
      return genericJobLinks(page, company, "SoftServe careers", "https://career.softserveinc.com", "a[href*='/vacancies/'][href*='javascript'], a[href*='/vacancies/'][href*='frontend'], a[href*='/vacancies/'][href*='react'], a[href*='/vacancies/'][href*='angular']");
    },
  },
  {
    company: "Genesis",
    url: "https://gen-tech.breezy.hr",
    scrape: async (page, company) => {
      await page.waitForSelector("a[href*='/p/']", { timeout: 15_000 }).catch(() => {});
      return genericJobLinks(page, company, "Genesis careers", "https://gen-tech.breezy.hr", "a[href*='/p/']");
    },
  },
  {
    company: "Langate Software",
    url: "https://langate.com/careers",
    scrape: async (page, company) => {
      await page.waitForSelector("a[href*='job'], a[href*='career']", { timeout: 15_000 }).catch(() => {});
      return genericJobLinks(page, company, "Langate careers", "https://langate.com", "a[href*='job'], a[href*='career']");
    },
  },
  {
    company: "Codeminders",
    url: "https://www.codeminders.com/careers",
    scrape: async (page, company) => {
      await page.waitForSelector("a[href*='job'], a[href*='career']", { timeout: 15_000 }).catch(() => {});
      return genericJobLinks(page, company, "Codeminders careers", "https://www.codeminders.com", "a[href*='job'], a[href*='career']");
    },
  },
];

export async function fetchAllPlaywrightJobs(): Promise<Job[]> {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const allJobs: Job[] = [];

  try {
    for (const config of CAREER_PAGES) {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      try {
        await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const jobs = await config.scrape(page, config.company);
        // Deduplicate and filter out navigation links (too short titles)
        const valid = jobs.filter((j) => j.title.length > 5 && j.url.length > 10);
        console.log(`  ${config.company}: ${valid.length} jobs found`);
        allJobs.push(...valid);
      } catch (err) {
        console.error(`Playwright scrape failed for ${config.company}:`, err);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return allJobs;
}
