export default async function handler(req: any, res: any) {
  try {
    const { path, ...queryParams } = req.query || {};
    const subPath = Array.isArray(path) ? path.join("/") : (path || "");
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(queryParams)) {
      if (key !== "path" && value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }

    const apiKey = process.env.TMDB_API_KEY || (process.env as any).VITE_TMDB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server Configuration Error: TMDB_API_KEY is missing." });
    }
    query.set("api_key", apiKey);

    const url = `https://api.themoviedb.org/3/${subPath}?${query.toString()}`;
    const response = await fetch(url, {
      headers: { "accept": "application/json" }
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err: any) {
    console.error("[Vercel TMDB Proxy Error]:", err?.message);
    return res.status(500).json({ error: "Erro interno no proxy do TMDB." });
  }
}
