import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/api/hooks", async (req, res) => {
  try {
    const topic = (req.body?.topic || "").trim();
    const style = (req.body?.style || "neugierig").trim();
    const platform = (req.body?.platform || "tiktok").trim();
    const count = Math.min(Math.max(parseInt(req.body?.count || 3, 10), 3), 10);

    if (!topic) return res.status(400).json({ error: "topic fehlt" });

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

    const text = (resp.output_text || "").trim();

    let hooks;
    try {
      hooks = JSON.parse(text);
    } catch {
      hooks = text
        .split("\n")
        .map((s) => s.replace(/^[\-\d\.\)\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, count);
    }

    return res.json({ hooks });
  } catch (err) {
    console.error("❌ OpenAI/API Error:", err);
    const status = err?.status || 500;
    const message = err?.error?.message || err?.message || "Unbekannter Fehler";
    return res.status(status).json({ error: message });
  }
});
} catch (err) {
  console.error("❌ OpenAI/API Error:", err);

  // OpenAI SDK errors haben oft status + message
  const status = err?.status || 500;
  const message =
    err?.error?.message ||
    err?.message ||
    "Unbekannter Fehler";

  return res.status(status).json({ error: message });
}
});

app.get("/", (req, res) => {
  res.send("Server läuft. Öffne index.html im Browser.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server läuft auf http://localhost:${PORT}`));