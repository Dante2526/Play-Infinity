export const featured = {
  title: "BEM-VINDOS A DERRY",
  year: "2025",
  duration: "56min",
  rating: 4.5,
  genres: ["Drama", "Mistério"],
  description:
    "Durante as férias de 1958, em uma pacata cidadezinha chamada Derry, um grupo de sete amigos começa a investigar uma série de eventos inexplicáveis e desaparecimentos...",
  imageUrl:
    "https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?q=80&w=2073&auto=format&fit=crop", // Moody dramatic placeholder
  logoText: "BEM-VINDOS A\nDERRY",
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
    id: 1,
    title: "STRANGER THINGS",
    episode: "S4:E3 - O Monstro e a Super-Heroína",
    progress: 65,
    imageUrl:
      "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: 2,
    title: "O PACTO",
    episode: "S1:E1 - O Início de Tudo",
    progress: 30,
    imageUrl:
      "https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=1000&auto=format&fit=crop",
  },
];

export const top10 = [
  {
    id: 1,
    title: "DIA D",
    imageUrl:
      "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: 2,
    title: "OBSESSÃO",
    imageUrl:
      "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: 3,
    title: "O PACTO",
    imageUrl:
      "https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=1000&auto=format&fit=crop",
  },
];

export const releases = [
  {
    id: 1,
    title: "QUINZE DIAS",
    imageUrl:
      "https://images.unsplash.com/photo-1543333995-a225a07204eb?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: 2,
    title: "I WILL FIND YOU",
    imageUrl:
      "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: 3,
    title: "FANTASIA 5",
    imageUrl:
      "https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?q=80&w=1000&auto=format&fit=crop",
  },
];

export const newest = [
  {
    id: 1,
    title: "PERIGO NAS ALTURAS",
    imageUrl:
      "https://images.unsplash.com/photo-1518623489648-a173ef7824f3?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: 2,
    title: "INVESTIGAÇÃO",
    imageUrl:
      "https://images.unsplash.com/photo-1584905066893-7d5c142ba4e1?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: 3,
    title: "MILLION DOLLAR",
    imageUrl:
      "https://images.unsplash.com/photo-1522869635100-9f4c5e86faa3?q=80&w=1000&auto=format&fit=crop",
  },
];

export const mostWatched = [
  {
    id: 1,
    title: "CAÇADOR",
    imageUrl:
      "https://images.unsplash.com/photo-1578681994506-b8f463449011?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: 2,
    title: "ANIMAIS DA CIDADE",
    imageUrl:
      "https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?q=80&w=1000&auto=format&fit=crop",
  },
];

// Mock catalogs for different providers
export type CatalogItem = {
  id: number;
  title: string;
  imageUrl: string;
  type: 'movie' | 'series';
  genres: string[];
  synopsis?: string;
  year?: number;
  rating?: string;
  duration?: string;
  match?: number;
};

export const providerCatalogs: Record<string, CatalogItem[]> = {
  "NETFLIX": [
    { id: 101, title: "O LADO OBSCURO", imageUrl: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Suspense", "Ficção Científica"], synopsis: "Em uma cidade onde o sol nunca nasce, um grupo de sobreviventes luta para descobrir a verdade por trás do céu escuro perene.", year: 2024, rating: "16", duration: "1 Temporada", match: 98 },
    { id: 102, title: "CYBER CITY", imageUrl: "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=1000&auto=format&fit=crop", type: "movie", genres: ["Ação", "Ficção Científica"], synopsis: "No ano de 2088, gangues cibernéticas dominam as ruas de neon, e uma detetive implacável é forçada a se aliar ao seu maior inimigo para deter um colapso iminente.", year: 2023, rating: "18", duration: "2h 15m", match: 95 },
    { id: 103, title: "REUNIÃO MORTAL", imageUrl: "https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=1000&auto=format&fit=crop", type: "movie", genres: ["Terror", "Mistério"], synopsis: "Um encontro de antigos colegas do colégio em uma cabana isolada vira um pesadelo sangrento quando segredos do passado voltam para assombrá-los.", year: 2025, rating: "16", duration: "1h 45m", match: 89 },
    { id: 104, title: "ALÉM DO VAZIO", imageUrl: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Drama", "Mistério"], synopsis: "Após uma anomalia espacial afetar a Terra, investigadores tentam encontrar a origem do silêncio ensurdecedor que contaminou milhões.", year: 2022, rating: "14", duration: "3 Temporadas", match: 97 },
  ],
  "Disney+": [
    { id: 201, title: "GALAXIA DISTANTE", imageUrl: "https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?q=80&w=1000&auto=format&fit=crop", type: "movie", genres: ["Ficção Científica", "Ação"], synopsis: "Acompanhe uma equipe de piratas espaciais buscando o tesouro mais raro da galáxia enquanto fogem de um império implacável.", year: 2024, rating: "10", duration: "2h 30m", match: 92 },
    { id: 202, title: "HERÓIS DA TERRA", imageUrl: "https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Ação", "Aventura"], synopsis: "Indivíduos com habilidades extraordinárias precisam se unir para defender o planeta contra uma invasão de outra dimensão.", year: 2021, rating: "12", duration: "5 Temporadas", match: 99 },
    { id: 203, title: "MAGIA ETERNA", imageUrl: "https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?q=80&w=1000&auto=format&fit=crop", type: "movie", genres: ["Fantasia", "Animação"], synopsis: "Em um reino mágico, uma jovem aprendiz de feiticeira precisa provar seu valor para salvar a árvore da vida.", year: 2023, rating: "L", duration: "1h 50m", match: 94 },
  ],
  "Max": [
    { id: 301, title: "TRONO DE SANGUE", imageUrl: "https://images.unsplash.com/photo-1578681994506-b8f463449011?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Fantasia", "Drama"], synopsis: "Nobres lutam em uma guerra épica cheia de intrigas políticas e traições implacáveis pelo poder de um reino dividido.", year: 2019, rating: "18", duration: "8 Temporadas", match: 96 },
    { id: 302, title: "A CIDADE FRIA", imageUrl: "https://images.unsplash.com/photo-1518623489648-a173ef7824f3?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Policial", "Suspense"], synopsis: "Uma investigação sombria sobre uma série de assassinatos em uma pequena cidade isolada no Alasca, onde ninguém está a salvo.", year: 2024, rating: "16", duration: "1 Temporada", match: 91 },
  ],
  "Prime Video": [
    { id: 401, title: "OS GAROTOS", imageUrl: "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Ação", "Comédia Negra"], synopsis: "Quando super-heróis abusam dos seus poderes em vez de usá-los para o bem, um grupo de vigilantes propõe deter os super-heróis corrompidos.", year: 2020, rating: "18", duration: "4 Temporadas", match: 99 },
    { id: 402, title: "ANÉIS DE PODER", imageUrl: "https://images.unsplash.com/photo-1543333995-a225a07204eb?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Fantasia", "Aventura"], synopsis: "Ambientada milhares de anos antes da lendária jornada, acompanhamos lendas forjarem os anéis e o antigo mal renascer.", year: 2022, rating: "14", duration: "2 Temporadas", match: 86 },
  ],
  "Apple TV+": [
    { id: 501, title: "SEPARAÇÃO", imageUrl: "https://images.unsplash.com/photo-1522869635100-9f4c5e86faa3?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Drama", "Ficção Científica"], synopsis: "Funcionários em uma empresa misteriosa têm suas memórias divididas entre trabalho e vida pessoal com resultados perturbadores.", year: 2022, rating: "16", duration: "2 Temporadas", match: 98 },
    { id: 502, title: "A MANHÃ DEPOIS", imageUrl: "https://images.unsplash.com/photo-1584905066893-7d5c142ba4e1?q=80&w=1000&auto=format&fit=crop", type: "series", genres: ["Drama"], synopsis: "O cotidiano caótico e os dramas entre os apresentadores e a equipe de bastidores de um noticiário matinal de sucesso nacional.", year: 2019, rating: "16", duration: "3 Temporadas", match: 93 },
  ]
};
