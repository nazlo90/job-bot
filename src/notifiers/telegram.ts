import type { Job } from "../types";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

function formatMessage(job: Job): string {
  const lines: string[] = [];

  lines.push(`*${escapeMarkdown(job.title)}*`);
  lines.push(`Company: ${escapeMarkdown(job.company)}`);

  if (job.location) {
    lines.push(`Location: ${escapeMarkdown(job.location)}`);
  }

  if (job.salary) {
    lines.push(`Salary: ${escapeMarkdown(job.salary)}`);
  }

  lines.push(`Source: ${escapeMarkdown(job.source)}`);
  lines.push(`\n[View job](${job.url})`);

  return lines.join("\n");
}

// Escape special MarkdownV2 chars
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&");
}

export async function sendJobNotification(job: Job): Promise<void> {
  const text = formatMessage(job);

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Telegram send failed for "${job.title}":`, err);
  }
}

export async function sendStartupMessage(message: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "MarkdownV2",
    }),
  });
}
