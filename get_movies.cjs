const https = require('https');

function search(query, type) {
  return new Promise((resolve) => {
    const url = `https://api.themoviedb.org/3/search/${type}?api_key=e0cc43e590a5c5c0d03f920bd4fe9424&query=${encodeURIComponent(query)}&language=pt-BR`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const results = JSON.parse(data).results;
          if(results && results.length > 0) {
            const item = results[0];
            console.log(`  {
    id: ${item.id},
    tmdbId: ${item.id},
    title: "${(item.title || item.name).toUpperCase()}",
    ${type === 'tv' ? 'type: "series" as const,' : ''}
    imageUrl: "https://image.tmdb.org/t/p/w500${item.poster_path}",
    playerUrl: "https://v1.watchplay.shop/${type === 'tv' ? 'series' : 'movie'}/${item.id}${type==='tv' ? '/1/1' : ''}",
  },`);
          } else {
            console.log(`No results for ${query}`);
          }
        } catch(e) {
            console.error(e);
        }
        resolve();
      });
    });
  });
}

async function run() {
  await search('Divertida Mente 2', 'movie');
  await search('Godzilla e Kong: O Novo Império', 'movie');
  await search('Kung Fu Panda 4', 'movie');
  await search('Furiosa: Uma Saga Mad Max', 'movie');
  await search('Meu Malvado Favorito 4', 'movie');
  await search('Gladiador 2', 'movie');
  await search('Fallout', 'tv');
  await search('O Problema dos 3 Corpos', 'tv');
  await search('Percy Jackson e os Olimpianos', 'tv');
  await search('Shogun', 'tv');
  await search('Pinguim', 'tv');
  await search('X-Men 97', 'tv');
}
run();
