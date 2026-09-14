import { app } from "../server";

export default function handler(req: any, res: any) {
  try {
    return app(req, res);
  } catch (err: any) {
    console.error("Vercel Runtime Crash:", err);
    res.status(500).send("Vercel Express Wrapper Crash: " + err.message);
  }
}
