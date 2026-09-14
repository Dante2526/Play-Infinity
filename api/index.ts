import { app } from "../server";

export default async function handler(req: any, res: any) {
  return new Promise((resolve, reject) => {
    try {
      app(req, res);
      res.on('finish', resolve);
      res.on('error', reject);
    } catch (err: any) {
      console.error("Vercel Runtime Crash:", err);
      res.status(500).send("Vercel Express Wrapper Crash: " + err.message);
      resolve(undefined);
    }
  });
}
