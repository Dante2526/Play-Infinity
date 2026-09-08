export type CatalogItem = {
  id: number;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  imageUrl: string;
  posterUrl?: string;
  backdropUrl?: string;
  type: 'movie' | 'series';
  genres: string[];
  synopsis?: string;
  year?: number;
  rating?: string;
  duration?: string;
  match?: number;
  playerUrl?: string;
  quality?: 'CAM' | 'TS' | 'HD' | '4K' | 'FULL HD';
};

/** Verifica se um item possui qualidade CAM (gravação de cinema) */
export function checkIsCam(title?: string, quality?: string): boolean {
  if (quality === 'CAM' || quality === 'TS') return true;
  if (!title) return false;
  const upper = title.toUpperCase();
  if (upper.includes('CAM') || upper.includes('CINEMA') || upper.includes('TS')) return true;
  if (upper.includes('HOMEM-ARANHA: UM NOVO DIA') || upper.includes('HOMEM-ARANHA 4')) return true;
  return false;
}

export const featured = {
  id: 969681,
  tmdbId: 969681,
  imdbId: "tt22084616",
  title: "HOMEM-ARANHA: UM NOVO DIA",
  year: "2026",
  duration: "2h 23min",
  rating: 4.9,
  quality: "CAM" as const,
  genres: ["Ação", "Aventura", "Ficção científica"],
  description:
    "Peter Parker enfrenta um novo capítulo em sua vida após os eventos mundiais. Sem suas antigas memórias com seus entes queridos, uma nova ameaça surge em Nova York, forçando o herói a equilibrar o fardo de sua responsabilidade com novos aliados e perigos inimagináveis.",
  imageUrl:
    "https://image.tmdb.org/t/p/original/qeQJx07rK2xm8SD2sJxFKhE7gs0.jpg",
  posterUrl:
    "https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg",
  logoText: "HOMEM-ARANHA\nUM NOVO DIA",
  playerUrl: "https://v1.watchplay.shop/movie/tt22084616",
};

export const providers = [
  "NETFLIX",
  "Disney+",
  "Max",
  "Prime Video",
  "Apple TV+",
];

export const continueWatching = [
  {
    id: 66732,
    tmdbId: 66732,
    imdbId: "tt4574334",
    title: "STRANGER THINGS",
    episode: "T4:E1 - O Clube Hellfire",
    progress: 75,
    imageUrl:
      "https://image.tmdb.org/t/p/w500/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    playerUrl: "https://v1.watchplay.shop/tvshow/66732/4/1",
  },
  {
    id: 533535,
    tmdbId: 533535,
    title: "DEADPOOL & WOLVERINE",
    episode: "Continuar do min 45",
    progress: 42,
    imageUrl:
      "https://image.tmdb.org/t/p/w500/by8z9Fe8y7p4jo2YlW2SZDnptyT.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/533535",
  },
];

export const top10 = [
  {
    id: 969681,
    tmdbId: 969681,
    imdbId: "tt22084616",
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
    imageUrl:
      "https://image.tmdb.org/t/p/w500/lHKNS35r4RTa9GO72vdadMLxoiV.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/1022789",
  },
  {
    id: 94997,
    tmdbId: 94997,
    title: "A CASA DO DRAGÃO",
    imageUrl:
      "https://image.tmdb.org/t/p/w500/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
    playerUrl: "https://v1.watchplay.shop/tvshow/94997/1/1",
  },
];

export const releases = [
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
];

export const newest = [
  {
    id: 125988,
    tmdbId: 125988,
    title: "SILO",
    imageUrl:
      "https://image.tmdb.org/t/p/w500/tVR4q9FazxJuCEpaYxiCijUlvM3.jpg",
    playerUrl: "https://v1.watchplay.shop/tvshow/125988/1/1",
  },
  {
    id: 76479,
    tmdbId: 76479,
    title: "THE BOYS",
    imageUrl:
      "https://image.tmdb.org/t/p/w500/in1R2dDc421JxsoRWaIIAqVI2KE.jpg",
    playerUrl: "https://v1.watchplay.shop/tvshow/76479/1/1",
  },
  {
    id: 100088,
    tmdbId: 100088,
    title: "THE LAST OF US",
    imageUrl:
      "https://image.tmdb.org/t/p/w500/el1KQzwdIm17I3A6cYPfsVIWhfX.jpg",
    playerUrl: "https://v1.watchplay.shop/tvshow/100088/1/1",
  },
];

export const mostWatched = [
  {
    id: 299534,
    tmdbId: 299534,
    title: "VINGADORES: ULTIMATO",
    imageUrl:
      "https://image.tmdb.org/t/p/w500/9fRX8UKlIW7Lb9GqNsJVakWWFCi.jpg",
    playerUrl: "https://v1.watchplay.shop/movie/299534",
  },
  {
    id: 66732,
    tmdbId: 66732,
    title: "STRANGER THINGS",
    imageUrl:
      "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
    playerUrl: "https://v1.watchplay.shop/tvshow/66732/1/1",
  },
];

export const providerCatalogs: Record<string, CatalogItem[]> = {
  "NETFLIX": [
    {
      id: 66732,
      tmdbId: 66732,
      imdbId: "tt4574334",
      title: "STRANGER THINGS",
      imageUrl: "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
      type: "series",
      genres: ["Ficção Científica", "Drama", "Mistério"],
      synopsis: "Quando um garoto desaparece, uma pequena cidade descobre um mistério envolvendo experimentos secretos, forças sobrenaturais aterrorizantes e uma garota muito estranha com poderes telecinéticos.",
      year: 2024,
      rating: "16",
      duration: "4 Temporadas",
      match: 99,
      playerUrl: "https://v1.watchplay.shop/tvshow/66732/1/1",
    },
    {
      id: 119051,
      tmdbId: 119051,
      title: "WANDINHA",
      imageUrl: "https://image.tmdb.org/t/p/w500/7rxiQrZjrer0RB9qNA8rHYFo53R.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
      type: "series",
      genres: ["Comédia", "Fantasia", "Mistério"],
      synopsis: "Inteligente, sarcástica e um pouco apática, Wandinha Addams investiga uma onda de assassinatos enquanto faz novos amigos — e inimigos — na Academia Nunca Mais.",
      year: 2023,
      rating: "14",
      duration: "1 Temporada",
      match: 96,
      playerUrl: "https://v1.watchplay.shop/tvshow/119051/1/1",
    },
    {
      id: 93405,
      tmdbId: 93405,
      title: "ROUND 6 (SQUID GAME)",
      imageUrl: "https://image.tmdb.org/t/p/w500/6gcHdboppvplmBWxvROc96NJnmm.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
      type: "series",
      genres: ["Ação", "Mistério", "Drama"],
      synopsis: "Centenas de jogadores falidos aceitam um estranho convite para competir em jogos infantis por um prêmio tentador, mas as consequências são mortais.",
      year: 2024,
      rating: "18",
      duration: "2 Temporadas",
      match: 98,
      playerUrl: "https://v1.watchplay.shop/tvshow/93405/1/1",
    },
  ],
  "Disney+": [
    {
      id: 969681,
      tmdbId: 969681,
      imdbId: "tt22084616",
      title: "HOMEM-ARANHA: UM NOVO DIA",
      quality: "CAM" as const,
      imageUrl: "https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/qeQJx07rK2xm8SD2sJxFKhE7gs0.jpg",
      type: "movie",
      genres: ["Ação", "Aventura", "Ficção científica"],
      synopsis: "Peter Parker enfrenta um novo capítulo em sua vida após os eventos mundiais. Sem suas antigas memórias com seus entes queridos, uma nova ameaça surge em Nova York, forçando o herói a equilibrar o fardo de sua responsabilidade com novos aliados.",
      year: 2026,
      rating: "14",
      duration: "2h 23m",
      match: 99,
      playerUrl: "https://v1.watchplay.shop/movie/tt22084616",
    },
    {
      id: 533535,
      tmdbId: 533535,
      title: "DEADPOOL & WOLVERINE",
      imageUrl: "https://image.tmdb.org/t/p/w500/cJFqqiDYprqExaXatu4AaoMzDG2.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/by8z9Fe8y7p4jo2YlW2SZDnptyT.jpg",
      type: "movie",
      genres: ["Ação", "Comédia", "Ficção científica"],
      synopsis: "Um apático Wade Wilson labuta na vida civil com seus dias como o mercenário moralmente flexível Deadpool para trás. Mas quando seu planeta natal enfrenta uma ameaça existencial, Wade precisa convencer um relutante Wolverine a ajudá-lo.",
      year: 2024,
      rating: "18",
      duration: "2h 08m",
      match: 97,
      playerUrl: "https://v1.watchplay.shop/movie/533535",
    },
    {
      id: 1022789,
      tmdbId: 1022789,
      title: "DIVERTIDA MENTE 2",
      imageUrl: "https://image.tmdb.org/t/p/w500/lHKNS35r4RTa9GO72vdadMLxoiV.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/p5ozvmdgsmbWe0H8Xk7Rc8SCwAB.jpg",
      type: "movie",
      genres: ["Animação", "Família", "Aventura"],
      synopsis: "Com a chegada da adolescência de Riley, a sala de controle mental passa por uma demolição repentina para dar espaço a algo totalmente inesperado: novas emoções! Alegria, Tristeza, Raiva, Medo e Nojinho não têm certeza de como reagir à Ansiedade.",
      year: 2024,
      rating: "L",
      duration: "1h 36m",
      match: 98,
      playerUrl: "https://v1.watchplay.shop/movie/1022789",
    },
    {
      id: 299534,
      tmdbId: 299534,
      title: "VINGADORES: ULTIMATO",
      imageUrl: "https://image.tmdb.org/t/p/w500/9fRX8UKlIW7Lb9GqNsJVakWWFCi.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
      type: "movie",
      genres: ["Ação", "Ficção científica", "Aventura"],
      synopsis: "Após os eventos devastadores de 'Guerra Infinita', o universo está em ruínas. Com a ajuda dos aliados restantes, os Vingadores se reúnem mais uma vez para desfazer as ações de Thanos e restaurar a ordem no universo.",
      year: 2019,
      rating: "14",
      duration: "3h 01m",
      match: 99,
      playerUrl: "https://v1.watchplay.shop/movie/299534",
    },
  ],
  "Max": [
    {
      id: 94997,
      tmdbId: 94997,
      title: "A CASA DO DRAGÃO",
      imageUrl: "https://image.tmdb.org/t/p/w500/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
      type: "series",
      genres: ["Drama", "Ação", "Fantasia"],
      synopsis: "Duzentos anos antes dos eventos de Game of Thrones, a dinastia Targaryen governa Westeros no auge de seu poder com mais de 15 dragões sob seu comando. Uma guerra civil implacável pela sucessão do Trono de Ferro ameaça destruir a família.",
      year: 2024,
      rating: "18",
      duration: "2 Temporadas",
      match: 98,
      playerUrl: "https://v1.watchplay.shop/tvshow/94997/1/1",
    },
    {
      id: 693134,
      tmdbId: 693134,
      title: "DUNA: PARTE DOIS",
      imageUrl: "https://image.tmdb.org/t/p/w500/8LJJjLjAzAwXS40S5mx79PJ2jSs.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg",
      type: "movie",
      genres: ["Ficção científica", "Aventura"],
      synopsis: "Paul Atreides se une a Chani e aos Fremen enquanto busca vingança contra os conspiradores que destruíram sua família. Diante de uma escolha entre o amor de sua vida e o destino do universo conhecido, ele luta para evitar um futuro terrível que só ele pode prever.",
      year: 2024,
      rating: "14",
      duration: "2h 46m",
      match: 99,
      playerUrl: "https://v1.watchplay.shop/movie/693134",
    },
    {
      id: 100088,
      tmdbId: 100088,
      title: "THE LAST OF US",
      imageUrl: "https://image.tmdb.org/t/p/w500/el1KQzwdIm17I3A6cYPfsVIWhfX.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg",
      type: "series",
      genres: ["Drama", "Ação", "Ficção científica"],
      synopsis: "Vinte anos após uma pandemia de fungos destruir a civilização, Joel, um sobrevivente endurecido, é contratado para contrabandear Ellie, uma garota de 14 anos que pode ser a chave para a cura, para fora de uma zona de quarentena opressiva.",
      year: 2023,
      rating: "18",
      duration: "1 Temporada",
      match: 98,
      playerUrl: "https://v1.watchplay.shop/tvshow/100088/1/1",
    },
  ],
  "Prime Video": [
    {
      id: 76479,
      tmdbId: 76479,
      title: "THE BOYS",
      imageUrl: "https://image.tmdb.org/t/p/w500/in1R2dDc421JxsoRWaIIAqVI2KE.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/n6vVs6z8obNbExdD3QHTr4Utu1Z.jpg",
      type: "series",
      genres: ["Ação", "Comédia", "Ficção científica"],
      synopsis: "Uma visão divertida e irreverente sobre o que acontece quando os super-heróis — populares como celebridades e influentes como políticos — abusam de seus superpoderes em vez de usá-los para o bem. Um grupo de vigilantes se une para expor a verdade sobre Os Sete.",
      year: 2024,
      rating: "18",
      duration: "4 Temporadas",
      match: 99,
      playerUrl: "https://v1.watchplay.shop/tvshow/76479/1/1",
    },
    {
      id: 84773,
      tmdbId: 84773,
      title: "O SENHOR DOS ANÉIS: OS ANÉIS DE PODER",
      imageUrl: "https://image.tmdb.org/t/p/w500/b5pl6GmQmTCHmZKEBhXPN0gmoAq.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/o2wg8QiSCQrhj91tBfxunE3O5Ba.jpg",
      type: "series",
      genres: ["Fantasia", "Aventura", "Ação"],
      synopsis: "Ambientada na lendária Segunda Era da Terra-média, a série acompanha um elenco de personagens que enfrentam o ressurgimento do temido mal em terras pacíficas.",
      year: 2024,
      rating: "14",
      duration: "2 Temporadas",
      match: 91,
      playerUrl: "https://v1.watchplay.shop/tvshow/84773/1/1",
    },
  ],
  "Apple TV+": [
    {
      id: 125988,
      tmdbId: 125988,
      title: "SILO",
      imageUrl: "https://image.tmdb.org/t/p/w500/tVR4q9FazxJuCEpaYxiCijUlvM3.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/4XccmjsOmQZw8S2iW1wvlvmb5v1.jpg",
      type: "series",
      genres: ["Ficção científica", "Drama", "Mistério"],
      synopsis: "Em um futuro tóxico e em ruínas, milhares vivem em um silo subterrâneo gigante. Após o xerife quebrar uma regra fundamental e misteriosas mortes acontecerem, a engenheira Juliette começa a desvendar segredos chocantes e a verdade sobre o silo.",
      year: 2024,
      rating: "16",
      duration: "2 Temporadas",
      match: 97,
      playerUrl: "https://v1.watchplay.shop/tvshow/125988/1/1",
    },
    {
      id: 93740,
      tmdbId: 93740,
      title: "RUPTURA (SEVERANCE)",
      imageUrl: "https://image.tmdb.org/t/p/w500/6qRIQqWwnxVemvvDfFuK3kkIqpS.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/7NNNXo0qG2SqH4JoG7GPvJ2hzes.jpg",
      type: "series",
      genres: ["Drama", "Mistério", "Ficção científica"],
      synopsis: "Mark lidera uma equipe de funcionários de escritório cujas memórias foram cirurgicamente divididas entre a vida profissional e a pessoal. Quando um misterioso colega de trabalho aparece fora do trabalho, inicia-se uma jornada para descobrir a verdade sobre seu trabalho.",
      year: 2025,
      rating: "16",
      duration: "2 Temporadas",
      match: 99,
      playerUrl: "https://v1.watchplay.shop/tvshow/93740/1/1",
    },
  ]
};

