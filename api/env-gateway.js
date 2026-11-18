/**
 * BAO ANH LAM V6 - API SHIELD SERVERLESS GATEWAY (VERCEL ENVIRONMENT VARIABLES)
 * Don vi chu quan: CONG TY TNHH TMDV VA SAN XUAT BAO ANH LAM (MST: 3401289271)
 * Moi khoa API nhay cam (GEMINI_API_KEY, VERCEL_API_KEY, FIREBASE_API_KEY)
 * chi duoc doc tu process.env tren may chu Vercel, tuyet doi khong hard-code o client.
 */

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const geminiKey = process.env.GEMINI_API_KEY || "";
  const vercelKey = process.env.VERCEL_API_KEY || process.env.VERCEL_TOKEN || "";
  const firebaseKey = process.env.FIREBASE_API_KEY || "";

  if (req.method === "GET") {
    return res.status(200).json({
      service: "BAL_V6_API_SHIELD_GATEWAY",
      mst: "3401289271",
      securityMode: "VERCEL_ENV_ONLY",
      envConfigured: {
        GEMINI_API_KEY: Boolean(geminiKey),
        VERCEL_API_KEY: Boolean(vercelKey),
        FIREBASE_API_KEY: Boolean(firebaseKey)
      }
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (body.action === "gemini_generate") {
      if (!geminiKey) {
        return res.status(503).json({
          error: "GEMINI_API_KEY chua duoc cau hinh trong Vercel Environment Variables."
        });
      }
      const model = body.model === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
      const prompt = String(body.prompt || "").trim();
      if (!prompt) {
        return res.status(400).json({ error: "Thieu noi dung prompt." });
      }
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 800 }
          })
        }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    return res.status(400).json({ error: "Unsupported gateway action." });
  } catch (err) {
    return res.status(500).json({ error: "Gateway execution error", detail: err.message });
  }
};
