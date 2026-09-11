async function getEmbedPlayDirectFull(tmdbId, season, episode, isMovie) {
  const pageUrl = isMovie 
    ? `https://www.embedplay.one/filme/${tmdbId}`
    : `https://www.embedplay.one/serie/${tmdbId}/${season}/${episode}`;
    
  console.log("Fetching:", pageUrl);
  const pageRes = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  const html = await pageRes.text();
  
  let optionId = null;
  let contentId = null;

  if (isMovie) {
     const idMatch = html.match(/player_select_item["'][^>]*data-id=["'](\d+)["']/i);
     if (idMatch) optionId = idMatch[1];
  } else {
     const activeMatch = html.match(/class=["'][^"']*episodeOption\s+active[^"']*["'][^>]*data-contentid=["'](\d+)["']/i) || 
                         html.match(/data-contentid=["'](\d+)["'][^>]*data-epi-num=["']${episode}["']/i);
                         
     if (activeMatch) contentId = activeMatch[1];
     
     if (contentId) {
        console.log("Found ContentID:", contentId);
        const optRes = await fetch("https://www.embedplay.one/api", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "Mozilla/5.0",
            "Referer": pageUrl,
            "X-Requested-With": "XMLHttpRequest"
          },
          body: `action=getOptions&contentid=${contentId}`
        });
        const optJson = await optRes.json();
        console.log("Options:", optJson);
        if (optJson?.data?.options?.length > 0) {
           const dubOpt = optJson.data.options.find(o => String(o.target) === "1" || /dub/i.test(o.type || ""));
           optionId = String((dubOpt || optJson.data.options[0]).ID);
        }
     }
  }

  if (!optionId) return null;
  console.log("Option ID:", optionId);
  
  const playerRes = await fetch("https://www.embedplay.one/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0",
      "Referer": pageUrl,
      "X-Requested-With": "XMLHttpRequest"
    },
    body: `action=getPlayer&video_id=${optionId}`
  });
  const playerJson = await playerRes.json();
  console.log("Player JSON:", playerJson);
  return playerJson?.data?.video_url;
}

getEmbedPlayDirectFull("46260", 1, 1, false).then(url => console.log("Result:", url));
