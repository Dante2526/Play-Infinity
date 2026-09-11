async function getEmbedPlayDirect(tmdbId, season, episode, isMovie) {
  const pageUrl = isMovie 
    ? `https://www.embedplay.one/filme/${tmdbId}`
    : `https://www.embedplay.one/serie/${tmdbId}/${season}/${episode}`;
    
  console.log("Fetching:", pageUrl);
  const pageRes = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  const html = await pageRes.text();
  const idMatch = html.match(/player_select_item["'][^>]*data-id=["'](\d+)["']/i);
  if (!idMatch) {
     console.log("No ID match!");
     return null;
  }
  const optionId = idMatch[1];
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
  return playerJson?.data?.video_url;
}

getEmbedPlayDirect("66732", 1, 1, false).then(url => console.log("Result:", url));
