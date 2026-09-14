import { app } from "./server.ts";
import http from "http";
const server = http.createServer(app);
server.listen(3002, async () => {
  try {
    const res = await fetch("http://localhost:3002/api/myembed-stream?id=95350&type=tv&s=1&e=5");
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text.substring(0, 150));
  } catch (err) {
    console.error("Fetch error:", err);
  }
  process.exit(0);
});
