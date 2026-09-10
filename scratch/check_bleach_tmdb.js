const TMDB_KEY = "e0cc43e590a5c5c0d03f920bd4fe9424";

async function checkBleachTmdb() {
  const res = await fetch(`https://api.themoviedb.org/3/tv/30984?api_key=${TMDB_KEY}&language=pt-BR`);
  const data = await res.json();
  console.log("Bleach no TMDB:");
  console.log("Número de temporadas:", data.number_of_seasons);
  console.log("Número de episódios:", data.number_of_episodes);
  console.log("Seasons no TMDB:");
  for (const s of data.seasons) {
    console.log(`  S${s.season_number}: ${s.name} (${s.episode_count} eps)`);
  }
}

checkBleachTmdb();
