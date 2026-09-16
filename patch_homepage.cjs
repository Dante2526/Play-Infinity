const fs = require('fs');
const path = 'src/pages/HomePage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Removemos a busca de filmes/séries/kids descontrolada e deixamos 
// as seções renderizarem apenas os dados estáticos homologados 
// (que são as consts no arquivo data.ts: releases, newest, kidsContent, etc).
// Animes e Doramas são mantidos no TMDB pois já filtram estritamente por ID.

const startRegex = /\/\/\s*Sincronização automática de lançamentos reais \(filmes, séries, animes, doramas e kids\) no TMDB\n\s*const fetchReleases = async \(\) => {[\s\S]*?(?=try {)/;
const tryBlockStart = /try {\n\s*const \[moviesRes, seriesRes, animesRes, doramasRes, kidsRes, kidsSeriesRes\] = await Promise\.all\(\[\n\s*getMovieReleases\(\),\n\s*getSeriesReleases\(\),\n\s*getAnimes\(\),\n\s*getDoramas\(\),\n\s*getKidsContent\(\),\n\s*getKidsSeries\(\)\n\s*\]\);/;

const replacementTry = `try {
        const [animesRes, doramasRes] = await Promise.all([
          getAnimes(),
          getDoramas()
        ]);`;

content = content.replace(tryBlockStart, replacementTry);

const ifMoviesBlock = /\n\s*if \(isMounted && moviesRes\?\.results && moviesRes\.results\.length > 0\) {[\s\S]*?setMovieReleases\(formattedMovies\);\n\s*}\n\s*}/;
content = content.replace(ifMoviesBlock, "");

const ifSeriesBlock = /\n\s*if \(isMounted && seriesRes\?\.results && seriesRes\.results\.length > 0\) {[\s\S]*?setSeriesReleases\(formattedSeries\);\n\s*}\n\s*}/;
content = content.replace(ifSeriesBlock, "");

const ifKidsMoviesBlock = /\n\s*\/\/ Filmes Infantis Dinâmicos \(Área Kids\)\n\s*if \(isMounted && kidsRes\?\.results && kidsRes\.results\.length > 0\) {[\s\S]*?setKidsReleases\(formattedKidsMovies\);\n\s*}\n\s*}/;
content = content.replace(ifKidsMoviesBlock, "");

const ifKidsSeriesBlock = /\n\s*\/\/ Séries e Desenhos Infantis Dinâmicos \(Área Kids\)\n\s*if \(isMounted && kidsSeriesRes\?\.results && kidsSeriesRes\.results\.length > 0\) {[\s\S]*?setKidsSeriesReleases\(formattedKidsSeries\);\n\s*}\n\s*}/;
content = content.replace(ifKidsSeriesBlock, "");

fs.writeFileSync(path, content);
