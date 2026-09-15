const fs = require('fs');
const path = 'src/data.ts';
let content = fs.readFileSync(path, 'utf8');

const regexReleases = /export const releases = \[(?:[\s\S]*?)\];/;
const replacementReleases = `export const releases = [
  {
    id: 969681,
    tmdbId: 969681,
    title: "HOMEM-ARANHA: UM NOVO DIA",
    quality: "CAM" as const,
    imageUrl:
      "https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/tt22084616",
  },
  {
    id: 533535,
    tmdbId: 533535,
    title: "DEADPOOL & WOLVERINE",
    imageUrl:
      "https://image.tmdb.org/t/p/w500/cJFqqiDYprqExaXatu4AaoMzDG2.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/533535",
  },
  {
    id: 693134,
    tmdbId: 693134,
    title: "DUNA: PARTE DOIS",
    imageUrl:
      "https://image.tmdb.org/t/p/w500/8LJJjLjAzAwXS40S5mx79PJ2jSs.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/693134",
  },
  {
    id: 1022789,
    tmdbId: 1022789,
    title: "DIVERTIDA MENTE 2",
    imageUrl: "https://image.tmdb.org/t/p/w500/lHKNS35r4RTa9GO72vdadMLxoiV.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/1022789",
  },
  {
    id: 823464,
    tmdbId: 823464,
    title: "GODZILLA E KONG: O NOVO IMPÉRIO",
    imageUrl: "https://image.tmdb.org/t/p/w500/fWSGD2yrzz6hscocnMD8AEXIThk.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/823464",
  },
  {
    id: 1011985,
    tmdbId: 1011985,
    title: "KUNG FU PANDA 4",
    imageUrl: "https://image.tmdb.org/t/p/w500/aNK6MA5EApIo0UJE7ZWSYcZBJKy.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/1011985",
  },
  {
    id: 786892,
    tmdbId: 786892,
    title: "FURIOSA: UMA SAGA MAD MAX",
    imageUrl: "https://image.tmdb.org/t/p/w500/7qOSKoOAPgemYhBwbJgBWcCxPWZ.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/786892",
  },
  {
    id: 519182,
    tmdbId: 519182,
    title: "MEU MALVADO FAVORITO 4",
    imageUrl: "https://image.tmdb.org/t/p/w500/s8BefU3RIJrfipTpsDtOiatlp8j.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/519182",
  },
  {
    id: 558449,
    tmdbId: 558449,
    title: "GLADIADOR 2",
    imageUrl: "https://image.tmdb.org/t/p/w500/342bly9MqveL65TnEFzx8TTUxcL.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/558449",
  }
];`;
content = content.replace(regexReleases, replacementReleases);

const regexNewest = /export const newest = \[(?:[\s\S]*?)\];/;
const replacementNewest = `export const newest = [
  {
    id: 125988,
    tmdbId: 125988,
    title: "SILO",
    type: "series" as const,
    imageUrl:
      "https://image.tmdb.org/t/p/w500/tVR4q9FazxJuCEpaYxiCijUlvM3.jpg",
    playerUrl: "https://v1.watchplay.shop/series/125988/1/1",
  },
  {
    id: 76479,
    tmdbId: 76479,
    title: "THE BOYS",
    type: "series" as const,
    imageUrl:
      "https://image.tmdb.org/t/p/w500/in1R2dDc421JxsoRWaIIAqVI2KE.jpg",
    playerUrl: "https://v1.watchplay.shop/series/76479/1/1",
  },
  {
    id: 100088,
    tmdbId: 100088,
    title: "THE LAST OF US",
    type: "series" as const,
    imageUrl:
      "https://image.tmdb.org/t/p/w500/el1KQzwdIm17I3A6cYPfsVIWhfX.jpg",
    playerUrl: "https://v1.watchplay.shop/series/100088/1/1",
  },
  {
    id: 106379,
    tmdbId: 106379,
    title: "FALLOUT",
    type: "series" as const,
    imageUrl: "https://image.tmdb.org/t/p/w500/tQRX6GbYooU7kUaarKf5YXDTONy.jpg",
    playerUrl: "https://v1.watchplay.shop/series/106379/1/1",
  },
  {
    id: 108545,
    tmdbId: 108545,
    title: "O PROBLEMA DOS 3 CORPOS",
    type: "series" as const,
    imageUrl: "https://image.tmdb.org/t/p/w500/rqMYUtyrRJrZ1zKQvBfLgPh1c0T.jpg",
    playerUrl: "https://v1.watchplay.shop/series/108545/1/1",
  },
  {
    id: 103540,
    tmdbId: 103540,
    title: "PERCY JACKSON E OS OLIMPIANOS",
    type: "series" as const,
    imageUrl: "https://image.tmdb.org/t/p/w500/4sLiVmCiRiX9abW4niJyNZx15bK.jpg",
    playerUrl: "https://v1.watchplay.shop/series/103540/1/1",
  },
  {
    id: 126308,
    tmdbId: 126308,
    title: "XÓGUM: A GLORIOSA SAGA DO JAPÃO",
    type: "series" as const,
    imageUrl: "https://image.tmdb.org/t/p/w500/gaOb9hyCDUcbZiTYcHy7mIFmNo.jpg",
    playerUrl: "https://v1.watchplay.shop/series/126308/1/1",
  },
  {
    id: 194764,
    tmdbId: 194764,
    title: "PINGUIM",
    type: "series" as const,
    imageUrl: "https://image.tmdb.org/t/p/w500/pPUNmQZUh7h6w2423VvtzUeg1LD.jpg",
    playerUrl: "https://v1.watchplay.shop/series/194764/1/1",
  },
  {
    id: 138502,
    tmdbId: 138502,
    title: "X-MEN '97",
    type: "series" as const,
    imageUrl: "https://image.tmdb.org/t/p/w500/yvqC5hw3rkW9vputtZ8PlwYhJRp.jpg",
    playerUrl: "https://v1.watchplay.shop/series/138502/1/1",
  }
];`;
content = content.replace(regexNewest, replacementNewest);

fs.writeFileSync(path, content);
