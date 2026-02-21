import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --------- Simple daily limit (MVP) ----------
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || "10", 10);
const usage = new Map(); // key -> { day: "YYYY-MM-DD", count: number }

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getRequesterKey(req) {
  // "Login" light: use userId if provided, else IP
  const userId = (req.body?.userId || req.query?.userId || "").trim();
  const ip =
    (req.headers["x-forwarded-for"]?.toString().split(",")[0] || "").trim() ||
    req.socket.remoteAddress ||
    "unknown";
  return userId ? `u:${userId}` : `ip:${ip}`;
}

function checkLimit(req) {
  const key = getRequesterKey(req);
  const day = todayKey();
  const entry = usage.get(key);

  if (!entry || entry.day !== day) {
    usage.set(key, { day, count: 0 });
    return { ok: true, remaining: DAILY_LIMIT };
  }

  if (entry.count >= DAILY_LIMIT) {
    return { ok: false, remaining: 0 };
  }

  return { ok: true, remaining: DAILY_LIMIT - entry.count };
}

function incLimit(req) {
  const key = getRequesterKey(req);
  const day = todayKey();
  const entry = usage.get(key);
  if (!entry || entry.day !== day) {
    usage.set(key, { day, count: 1 });
    return DAILY_LIMIT - 1;
  }
  entry.count += 1;
  usage.set(key, entry);
  return Math.max(DAILY_LIMIT - entry.count, 0);
}

// ---------- Helpers ----------
const styleMap = {
  provokant: "provokant, kontrovers, direkt, polarisiert ohne beleidigend zu sein",
  neugierig: "neugierig machend, geheimnisvoll, cliffhanger",
  story: "wie ein Mini-Story-Start (ich/du), emotional, relatable",
  fakten: "mit Zahlen/Beobachtung, sachlich aber spannend",
};

const platformMap = {
  tiktok: "TikTok/Reels (kurz, schnell, maximal 12–14 Wörter)",
  reels: "Instagram Reels (kurz, punchy, maximal 12–14 Wörter)",
  youtube: "YouTube Shorts (klar, stark, maximal 14 Wörter)",
};

// ---------- Routes ----------
app.get("/", (req, res) => {
  res.send("OK: crazytool backend läuft");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, day: todayKey(), limit: DAILY_LIMIT });
});

app.post("/api/hooks", async (req, res) => {
  try {
    const topic = (req.body?.topic || "").trim();
    const style = (req.body?.style || "neugierig").trim();
    const platform = (req.body?.platform || "tiktok").trim();
    const count = Math.min(Math.max(parseInt(req.body?.count || 3, 10), 3), 10);

    if (!topic) return res.status(400).json({ error: "topic fehlt" });

    const lim = checkLimit(req);
    if (!lim.ok) {
      return res.status(429).json({
        error: `Tageslimit erreicht (${DAILY_LIMIT}/Tag). Komm morgen wieder 🙂`,
        remaining: 0,
        limit: DAILY_LIMIT,
      });
    }

    const prompt = `
Du bist ein viraler Hook-Generator.
Erzeuge GENAU ${count} deutsche Hooks zum Thema: "${topic}".

Stil: ${styleMap[style] || styleMap.neugierig}
Plattform: ${platformMap[platform] || platformMap.tiktok}

Regeln:
- 1 Satz pro Hook
- max 14 Wörter
- keine Emojis
- keine Nummerierung
- keine Anführungszeichen
Gib NUR ein JSON-Array von Strings zurück.
`;

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw = (resp.output_text || "").trim();

// 1) Entferne ```json ... ``` oder ``` ... ```
const cleaned = raw
  .replace(/```json/gi, "```")
  .replace(/```/g, "")
  .trim();

// 2) Versuche: erstes JSON-Array aus dem Text extrahieren
function extractJSONArray(str) {
  const start = str.indexOf("[");
  const end = str.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return str.slice(start, end + 1);
}

let hooks = null;
const maybeArray = extractJSONArray(cleaned);

try {
  hooks = JSON.parse(maybeArray || cleaned);
} catch {
  // Fallback: Zeilen splitten und säubern
  hooks = cleaned
    .split("\n")
    .map((s) => s.replace(/^[\-\d\.\)\s]+/, "").trim())
    .filter(Boolean)
    .filter((s) => s !== "[" && s !== "]" && s.toLowerCase() !== "json")
    .slice(0, count);
}

// final absichern
if (!Array.isArray(hooks)) hooks = [];
hooks = hooks.map(String).map(s => s.trim()).filter(Boolean).slice(0, count);
    }

    const remaining = incLimit(req);

    return res.json({ hooks, remaining, limit: DAILY_LIMIT });
  } catch (err) {
    console.error("❌ /api/hooks Error:", err);
    const status = err?.status || 500;
    const message = err?.error?.message || err?.message || "Unbekannter Fehler";
    return res.status(status).json({ error: message });
  }
});

app.post("/api/script", async (req, res) => {
  try {
    const hook = (req.body?.hook || "").trim();
    const topic = (req.body?.topic || "").trim();
    const platform = (req.body?.platform || "tiktok").trim();
    const tone = (req.body?.tone || "direkt").trim();

    if (!hook && !topic) return res.status(400).json({ error: "hook oder topic fehlt" });

    const lim = checkLimit(req);
    if (!lim.ok) {
      return res.status(429).json({
        error: `Tageslimit erreicht (${DAILY_LIMIT}/Tag). Komm morgen wieder 🙂`,
        remaining: 0,
        limit: DAILY_LIMIT,
      });
    }

    const base = hook ? `Hook: "${hook}"` : `Thema: "${topic}"`;

    const prompt = `
Schreibe ein deutsches Kurzvideo-Script (30–45 Sekunden) für ${platformMap[platform] || platformMap.tiktok}.
${base}

Ton: ${tone} (klar, modern, nicht cringe)

Struktur:
1) Hook (1 Satz)
2) 3 schnelle Punkte (kurze Sätze)
3) Mini-Fazit + Call-to-Action (1 Satz)

Regeln:
- Keine Emojis
- Keine Hashtags
- Keine Aufzählungszeichen, nur normale Zeilen
Gib NUR den Script-Text zurück.
`;

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const script = (resp.output_text || "").trim();
    const remaining = incLimit(req);

    return res.json({ script, remaining, limit: DAILY_LIMIT });
  } catch (err) {
    console.error("❌ /api/script Error:", err);
    const status = err?.status || 500;
    const message = err?.error?.message || err?.message || "Unbekannter Fehler";
    return res.status(status).json({ error: message });
  }
});

// Render/Heroku style port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Server läuft auf Port", PORT));