export default async function handler(req: any, res: any) {
  try {
    const upstreamRes = await fetch("https://v1.watchplay.shop/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://v1.watchplay.shop/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: new URLSearchParams(req.body as Record<string, string>),
    });
    const data = await upstreamRes.json();
    return res.json(data);
  } catch (err: any) {
    console.error("[Vercel WatchPlay Proxy API Error]:", err.message);
    return res.status(500).json({ errors: "1", message: err.message });
  }
}
