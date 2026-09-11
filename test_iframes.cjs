const fs = require("fs");
fetch("https://player.videasy.net/movie/299534", { headers: { "User-Agent": "Mozilla/5.0" } })
  .then(res => res.text())
  .then(html => {
     const matches = html.match(/iframe[^>]*src=["']([^"']+)["']/gi) || [];
     console.log("iframes:", matches);
  });
