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
    if (!topic) return res.status(400).json({ error: "topic fehlt" });

    const prompt = `
Du bist ein viraler Hook-Generator für TikTok/Reels.
Erzeuge GENAU 3 kurze deutsche Hooks zum Thema: "${topic}".
Regeln:
- 1 Satz pro Hook
- maximal 14 Wörter
- keine Emojis
- keine Nummerierung
- keine Anführungszeichen
Gib NUR die 3 Hooks als JSON-Array von Strings zurück.
Beispiel: ["Hook 1", "Hook 2", "Hook 3"]
`;

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    // resp.output_text enthält den Text der Antwort
    const text = (resp.output_text || "").trim();

    let hooks;
    try {
      hooks = JSON.parse(text);
    } catch {
      // Falls das Modell doch kein perfektes JSON liefert:
      hooks = text
        .split("\n")
        .map(s => s.replace(/^[\-\d\.\)\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 3);
    }

    return res.json({ hooks });
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