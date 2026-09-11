const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const epRoute = `
  // API 7: Extrator Direto da EmbedPlayAPI (Bypassa o Menu)
  app.get("/api/embedplay-direct", async (req, res) => {
    try {
      const { tmdb, s, e, type } = req.query;
      const isMovie = type === "movie";
      const pageUrl = isMovie 
        ? \`https://www.embedplay.one/filme/\${tmdb}\`
        : \`https://www.embedplay.one/serie/\${tmdb}/\${s}/\${e}\`;
        
      const pageRes = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
      const html = await pageRes.text();
      
      let optionId = null;
      let contentId = null;

      if (isMovie) {
         const idMatch = html.match(/player_select_item["'][^>]*data-id=["'](\\d+)["']/i);
         if (idMatch) optionId = idMatch[1];
      } else {
         const activeMatch = html.match(/class=["'][^"']*episodeOption\\s+active[^"']*["'][^>]*data-contentid=["'](\\d+)["']/i) || 
                             html.match(/data-contentid=["'](\\d+)["'][^>]*data-epi-num=["']\${e}["']/i);
                             
         if (activeMatch) contentId = activeMatch[1];
         
         if (contentId) {
            const optRes = await fetch("https://www.embedplay.one/api", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": "Mozilla/5.0",
                "Referer": pageUrl,
                "X-Requested-With": "XMLHttpRequest"
              },
              body: \`action=getOptions&contentid=\${contentId}\`
            });
            const optJson = await optRes.json().catch(()=>null);
            if (optJson?.data?.options?.length > 0) {
               const dubOpt = optJson.data.options.find((o:any) => String(o.target) === "1" || /dub/i.test(o.type || ""));
               optionId = String((dubOpt || optJson.data.options[0]).ID);
            }
         }
      }

      if (!optionId) {
        // Fallback to autoembed
        return res.redirect(isMovie ? \`https://player.autoembed.cc/embed/movie/\${tmdb}\` : \`https://player.autoembed.cc/embed/tv/\${tmdb}/\${s}/\${e}\`);
      }
      
      const playerRes = await fetch("https://www.embedplay.one/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Mozilla/5.0",
          "Referer": pageUrl,
          "X-Requested-With": "XMLHttpRequest"
        },
        body: \`action=getPlayer&video_id=\${optionId}\`
      });
      const playerJson = await playerRes.json().catch(()=>null);
      const finalUrl = playerJson?.data?.video_url;
      
      if (finalUrl) {
         return res.redirect(finalUrl);
      } else {
         return res.redirect(isMovie ? \`https://player.autoembed.cc/embed/movie/\${tmdb}\` : \`https://player.autoembed.cc/embed/tv/\${tmdb}/\${s}/\${e}\`);
      }
    } catch (err) {
       console.error("[EmbedPlay Direct Error]:", err);
       return res.status(500).send("Erro interno");
    }
  });
`;

if (!code.includes('/api/embedplay-direct')) {
  code = code.replace(/\/\/ Fallback catch-all/g, epRoute + "\n\n  // Fallback catch-all");
  fs.writeFileSync('server.ts', code);
  console.log("Injected /api/embedplay-direct route!");
} else {
  console.log("Already has it.");
}
