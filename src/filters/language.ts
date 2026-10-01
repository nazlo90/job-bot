import type { Job } from "../types";

// Working language must be English and/or Ukrainian.
// - Text in EN/UK with no other-language requirement -> ok
// - Text in another language, or EN text mentioning another language -> ask Grok
//   (a German posting may still say "working language is English")

const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "with", "you", "for", "our", "are", "will", "your", "experience", "team", "we", "to", "of", "in"],
  de: ["und", "der", "die", "das", "mit", "für", "wir", "sie", "ist", "ein", "eine", "bei", "auf", "zu", "den", "du", "dich", "deine", "kenntnisse"],
  fr: ["et", "le", "la", "les", "des", "une", "pour", "avec", "vous", "nous", "est", "dans", "sur", "du"],
  es: ["y", "el", "la", "los", "las", "con", "para", "una", "en", "del", "que", "por", "es", "nuestro"],
  pt: ["e", "o", "os", "com", "para", "uma", "em", "do", "da", "que", "por", "é", "você", "não"],
  it: ["e", "il", "la", "con", "per", "una", "di", "che", "sono", "nel", "della", "lavoro"],
  pl: ["i", "w", "z", "na", "do", "jest", "się", "oraz", "dla", "nasz", "praca", "znajomość"],
  nl: ["en", "de", "het", "met", "voor", "wij", "je", "een", "van", "op", "bij", "jouw"],
};

const OTHER_LANGS =
  "german|deutsch|french|dutch|spanish|portuguese|italian|polish|czech|slovak|swedish|danish|norwegian|finnish|hungarian|romanian|bulgarian|greek|turkish|hebrew|arabic|japanese|chinese|mandarin|cantonese|korean|vietnamese|thai|russian|lithuanian|latvian|estonian";

// e.g. "fluent German", "German (C1)", "German is required", "Deutschkenntnisse"
const OTHER_LANG_REQ = new RegExp(
  `\\b(${OTHER_LANGS})\\b[^.\\n]{0,40}\\b(required|mandatory|must|fluent|native|c1|c2|b2|proficien\\w*)\\b` +
    `|\\b(fluent|native|business[- ]level|proficien\\w*|excellent|very good|strong|advanced)\\b[^.\\n]{0,30}\\b(${OTHER_LANGS})\\b` +
    `|deutschkenntnisse|sehr gute deutsch|flie(ß|ss)end(es)? deutsch`,
  "i"
);

export type Lang = "en" | "uk" | "ru" | "other";

export function detectLanguage(text: string): Lang {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters) return "en";

  // Non-Latin, non-Cyrillic scripts (CJK, Arabic, Hebrew, Thai, Korean, Greek...)
  const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  const cyr = (text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  if ((latin + cyr) / letters.length < 0.7) return "other";

  if (cyr > latin) {
    const uk = (text.match(/[іїєґ]/gi) ?? []).length;
    const ru = (text.match(/[ыэъё]/gi) ?? []).length;
    return uk >= ru ? "uk" : "ru";
  }

  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const scores: Record<string, number> = {};
  for (const [lang, sw] of Object.entries(STOPWORDS)) {
    const set = new Set(sw);
    scores[lang] = words.filter((w) => set.has(w)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]!;
  if (best[1] === 0) return "en";
  return best[0] === "en" ? "en" : "other";
}

async function askGrokLanguage(job: Job): Promise<boolean> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content:
              'You check job postings for language requirements. Reply ONLY with JSON like {"ok": true}. ' +
              "ok=true only if a candidate who speaks ONLY English and Ukrainian (no other languages) can do this job, " +
              "i.e. the working/communication language is English or Ukrainian, or the posting explicitly says so. " +
              "ok=false if the posting requires (or clearly expects) another language, e.g. a German posting with no mention of English as working language. " +
              'Another language being only "a plus" / "nice to have" is fine.',
          },
          { role: "user", content: `${job.title}\n${job.company}\n${job.location}\n\n${job.description.slice(0, 3500)}` },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content.match(/\{.*\}/s)?.[0] ?? "{}") as { ok?: boolean };
    return parsed.ok === true;
  } catch {
    return false;
  }
}

export async function isLanguageOk(job: Job): Promise<{ ok: boolean; reason: string }> {
  const text = `${job.title}\n${job.description}`;
  const lang = detectLanguage(text);
  const otherReq = OTHER_LANG_REQ.test(text);

  if ((lang === "en" || lang === "uk") && !otherReq) return { ok: true, reason: lang };

  const ok = await askGrokLanguage(job);
  return { ok, reason: `lang=${lang}${otherReq ? " +other-lang mention" : ""} grok=${ok}` };
}
