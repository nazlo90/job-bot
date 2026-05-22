# Job Bot — Setup Guide

## Overview

This bot monitors DOU, Djinni, and company career pages for relevant Frontend/Fullstack jobs and sends real-time Telegram notifications.

**Architecture:** GitHub Actions (cron) → Bun/TypeScript scripts → Supabase (dedup) → Telegram

---

## Step 1 — Create a Telegram Bot

1. Open Telegram and message `@BotFather`
2. Send `/newbot`
3. Follow prompts — choose a name and username (e.g. `NazarJobBot`)
4. Copy the **bot token** (format: `123456789:ABCdef...`)

**Get your personal Chat ID:**

1. Message your new bot anything (e.g. "hello")
2. Open this URL in a browser (replace `TOKEN` with your token):
   ```
   https://api.telegram.org/botTOKEN/getUpdates
   ```
3. Find `"chat":{"id":XXXXXXXX}` — that number is your `TELEGRAM_CHAT_ID`

---

## Step 2 — Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New project (free tier)
2. After creation, go to **SQL Editor** and run this:

```sql
create table if not exists seen_jobs (
  url        text primary key,
  title      text,
  company    text,
  created_at timestamptz default now()
);
```

3. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (under "Project API keys") → `SUPABASE_SERVICE_KEY`

---

## Step 3 — Get a Grok API Key (free)

1. Go to [console.x.ai](https://console.x.ai)
2. Create an account and generate an API key
3. The free tier is sufficient for ~500 ambiguous job classifications per month

---

## Step 4 — Push to GitHub (public repo)

```bash
git init
git remote add origin https://github.com/YOUR_USERNAME/job-bot.git
git add .
git commit -m "initial commit"
git push -u origin main
```

> **Must be a public repo** for unlimited free GitHub Actions minutes.

---

## Step 5 — Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these 5 secrets:

| Secret name | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |
| `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather |
| `TELEGRAM_CHAT_ID` | Your personal chat ID |
| `GROK_API_KEY` | Your xAI Grok API key |

---

## Step 6 — Enable GitHub Actions

1. Go to your repo → **Actions** tab
2. If prompted, click **"I understand my workflows, go ahead and enable them"**
3. You'll see two workflows:
   - **RSS Poll** — runs every 15 minutes
   - **Company Pages Poll** — runs every hour

**Trigger a manual run to test:**

Go to Actions → RSS Poll → Run workflow → Run workflow

Check your Telegram — you should receive job notifications within ~2 minutes.

---

## Local Development

Create a `.env` file (never commit this):

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_ID=123456789
GROK_API_KEY=xai-...
```

Run locally:

```bash
# Install Chromium for Playwright (one-time)
bun run install:browsers

# Test RSS polling
bun run rss

# Test company page scraping
bun run companies
```

---

## Cron Schedule

| Workflow | Schedule | Purpose |
|---|---|---|
| `rss.yml` | Every 15 min | DOU + Djinni RSS feeds |
| `companies.yml` | Every hour | ATS APIs + career page scraping |

---

## Adding/Removing Companies

- **ATS companies** (Greenhouse/Breezy): edit `src/scrapers/ats.ts`
- **Playwright companies**: edit `src/scrapers/playwright.ts`
- **Relevance whitelist**: edit `WHITELISTED_COMPANIES` in `src/filters/relevance.ts`
- **Keyword filters**: edit `ALLOW_KEYWORDS` / `BLOCK_KEYWORDS` in `src/filters/relevance.ts`
