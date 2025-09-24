// /api/slide.js  (Vercel serverless function)
const ALLOW_ORIGIN = "*";

async function readJson(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body || {};
}

module.exports = async (req, res) => {
  // CORS + methods
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { imageDataUrl } = await readJson(req);
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image")) {
    return res.status(400).json({ error: "imageDataUrl must be a data:image/*;base64,... string" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  // Allow you to switch models from your Vercel env (recommended)
  // If you have Codex API access, set:  MODEL=gpt-5-codex
  // Otherwise it will use a sensible default like gpt-4o-mini
  const model = process.env.MODEL || "gpt-4o-mini";

  const system = `You convert a hand-drawn slide/photo into a clean slide outline.
Return STRICT JSON ONLY in this schema:
{
  "title": "string (<=80 chars)",
  "bullets": ["3-6 concise bullet points"],
  "notes": "short speaker notes (optional)"
}
Rules:
- Preserve the author's intent.
- If handwriting is unclear, keep it short and add "(?)".
- No extra commentary beyond JSON.`;

  const userText = `Extract a presentation-ready slide from this sketch. Keep output compact and readable.`;

  try {
    // Standard OpenAI REST call
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: imageDataUrl }
            ]
          }
        ]
      })
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return res.status(resp.status).json({ error: `OpenAI error: ${errTxt}` });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let spec;
    try { spec = JSON.parse(content); } catch { spec = {}; }

    const cleaned = {
      title: spec.title || "Untitled",
      bullets: Array.isArray(spec.bullets) ? spec.bullets.slice(0, 8) : [],
      notes: spec.notes || ""
    };

    return res.status(200).json(cleaned);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Unexpected server error" });
  }
};
