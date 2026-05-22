import type { Job } from "../types";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatMessage(job: Job): string {
  const lines: string[] = [];

  lines.push(`<b>${escapeHtml(job.title)}</b>`);
  lines.push(`🏢 ${escapeHtml(job.company)}`);

  if (job.location) lines.push(`📍 ${escapeHtml(job.location)}`);
  if (job.salary)   lines.push(`💰 ${escapeHtml(job.salary)}`);

  lines.push(`🔗 <a href="${job.url}">View job</a>`);
  lines.push(`<i>${escapeHtml(job.source)}</i>`);

  return lines.join("\n");
}

async function sendMessage(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

export async function sendJobNotification(job: Job): Promise<void> {
  await sendMessage(formatMessage(job));
}
