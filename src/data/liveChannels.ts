export interface LiveChannel {
  id: string;
  name: string;
  category: 'Esportes' | 'TV Aberta' | 'Notícias' | 'Filmes & Séries' | 'Infantil' | 'Variedades' | 'Adultos';
  logo: string;
  currentProgram?: string;
  quality: '1080p' | '720p' | 'HD';
  isCustom?: boolean;
  servers: {
    name: string;
    url: string;
    isProxy?: boolean;
  }[];
  description?: string;
}

export const INITIAL_LIVE_CHANNELS: LiveChannel[] = [
  // --- ESPORTES & PREMIERE ---
  {
    id: 'premiere-clubes',
    name: 'Premiere Clubes HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Futebol Ao Vivo - Rodada do Brasileirão & Estaduais',
    quality: '1080p',
    description: 'O melhor do futebol brasileiro 24 horas por dia com cobertura de jogos exclusivos.',
    servers: [
      {
        name: 'Servidor 1 (FHD)',
        url: 'http://up.kiwi/351921603109/34939156/896',
        isProxy: true
      },
      {
        name: 'Servidor 2 (HD)',
        url: 'http://up.kiwi/351921603109/34939156/898',
        isProxy: true
      }
    ]
  },
  {
    id: 'premiere-1',
    name: 'Premiere 1',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Campeonato Brasileiro - Série A & B Ao Vivo',
    quality: '1080p',
    description: 'Transmissões completas e exclusivas dos jogos do futebol nacional.',
    servers: [
      {
        name: 'Servidor 1 (FHD)',
        url: 'http://up.kiwi/351921603109/34939156/896',
        isProxy: true
      },
      {
        name: 'Servidor 2 (HD)',
        url: 'http://up.kiwi/351921603109/34939156/898',
        isProxy: true
      }
    ]
  },
  {
    id: 'premiere-2',
    name: 'Premiere 2',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Transmissão Ao Vivo - Rodada Esportiva',
    quality: '1080p',
    description: 'Canal secundário Premiere para rodadas simultâneas de jogos.',
    servers: [
      {
        name: 'Servidor 1 (FHD)',
        url: 'http://up.kiwi/351921603109/34939156/859',
        isProxy: true
      },
      {
        name: 'Servidor 2 (HD)',
        url: 'http://up.kiwi/351921603109/34939156/861',
        isProxy: true
      }
    ]
  },
  {
    id: 'premiere-3',
    name: 'Premiere 3',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Futebol Ao Vivo - Jogos Simultâneos',
    quality: '1080p',
    description: 'Cobertura de todos os lances e partidas dos campeonatos estaduais e nacionais.',
    servers: [
      {
        name: 'Servidor 1 (FHD)',
        url: 'http://up.kiwi/351921603109/34939156/865',
        isProxy: true
      },
      {
        name: 'Servidor 2 (HD)',
        url: 'http://up.kiwi/351921603109/34939156/867',
        isProxy: true
      },
      {
        name: 'Servidor 3 (HD Backup)',
        url: 'http://up.kiwi/351921603109/34939156/296309',
        isProxy: true
      }
    ]
  },
  {
    id: 'premiere-4',
    name: 'Premiere 4',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Copa do Brasil & Campeonatos Estaduais',
    quality: '1080p',
    description: 'Canal complementar Premiere com cobertura de futebol 100% brasileira.',
    servers: [
      {
        name: 'Servidor 1 (FHD)',
        url: 'http://up.kiwi/351921603109/34939156/296311',
        isProxy: true
      },
      {
        name: 'Servidor 2 (HD)',
        url: 'http://up.kiwi/351921603109/34939156/296312',
        isProxy: true
      }
    ]
  },
  {
    id: 'sportv',
    name: 'SporTV HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv-br.png',
    currentProgram: 'Tá na Área / Troca de Passes & Jogos Ao Vivo',
    quality: '1080p',
    description: 'O canal campeão com debates, cobertura ao vivo, vôlei, basquete e futebol.',
    servers: [
      {
        name: 'Servidor 1 (FHD)',
        url: 'http://up.kiwi/351921603109/34939156/1229',
        isProxy: true
      },
      {
        name: 'Servidor 2 (HD)',
        url: 'http://up.kiwi/351921603109/34939156/1231',
        isProxy: true
      },
      {
        name: 'Servidor 3 (FHD Backup)',
        url: 'http://up.kiwi/351921603109/34939156/305202',
        isProxy: true
      }
    ]
  },
  {
    id: 'sportv-2',
    name: 'SporTV 2 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv2-br.png',
    currentProgram: 'Eventos Olímpicos, Atletismo e Futebol Ao Vivo',
    quality: '1080p',
    description: 'Transmissões esportivas variadas e grandes competições mundiais.',
    servers: [
      {
        name: 'Servidor 1 (FHD)',
        url: 'http://up.kiwi/351921603109/34939156/296210',
        isProxy: true
      },
      {
        name: 'Servidor 2 (HD)',
        url: 'http://up.kiwi/351921603109/34939156/1221',
        isProxy: true
      },
      {
        name: 'Servidor 3 (HD Backup)',
        url: 'http://up.kiwi/351921603109/34939156/296209',
        isProxy: true
      }
    ]
  },
  {
    id: 'sportv-3',
    name: 'SporTV 3 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv3-br.png',
    currentProgram: 'Automobilismo, Tênis e Ligas Internacionais',
    quality: '1080p',
    description: 'Esportes radicais, automobilismo, lutas e futebol.',
    servers: [
      {
        name: 'Servidor 1 (FHD)',
        url: 'http://up.kiwi/351921603109/34939156/1224',
        isProxy: true
      },
      {
        name: 'Servidor 2 (HD)',
        url: 'http://up.kiwi/351921603109/34939156/1226',
        isProxy: true
      },
      {
        name: 'Servidor 3 (HD Backup)',
        url: 'http://up.kiwi/351921603109/34939156/296212',
        isProxy: true
      }
    ]
  },
  {
    id: 'espn-brasil',
    name: 'ESPN Brasil HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    currentProgram: 'SportsCenter / Premier League & Libertadores',
    quality: '1080p',
    description: 'O líder mundial em esportes com Premier League, LaLiga, NFL, NBA e debates.',
    servers: [
      {
        name: 'Servidor 1 (Kiwi FHD)',
        url: 'http://up.kiwi/351921603109/34939156/296354',
        isProxy: true
      },
      {
        name: 'Servidor 2 (Kiwi HD)',
        url: 'http://up.kiwi/351921603109/34939156/506',
        isProxy: true
      },
      {
        name: 'Servidor 3 (Kiwi HD²)',
        url: 'http://up.kiwi/351921603109/34939156/296355',
        isProxy: true
      }
    ]
  },
  {
    id: 'cazetv',
    name: 'CazéTV Ao Vivo',
    category: 'Esportes',
    logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100" width="240" height="100"><rect width="240" height="100" rx="16" fill="%23FFE600"/><text x="120" y="52" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-style="italic" font-size="44" fill="%23111111" text-anchor="middle" letter-spacing="-1.5">CAZÉ</text><rect x="85" y="64" width="70" height="24" rx="6" fill="%23111111"/><text x="120" y="81" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="16" fill="%23FFE600" text-anchor="middle" letter-spacing="4">TV</text></svg>',
    currentProgram: 'Transmissão Ao Vivo com Casimiro e Equipe',
    quality: '1080p',
    description: 'O fenômeno do YouTube e transmissões ao vivo de grandes eventos do esporte.',
    servers: [
      {
        name: 'Servidor 1 (Amagi FAST)',
        url: 'http://up.kiwi/351921603109/34939156/296538',
        isProxy: true
      },
      {
        name: 'Servidor 2 (FIFA+ Ao Vivo)',
        url: 'https://e3be9ac5.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctYnJfRklGQVBsdXNQb3J0dWd1ZXNlX0hMUw/playlist.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'ge-fast',
    name: 'ge Fast (Globo Esporte)',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/ge-tv-br.png',
    currentProgram: 'Melhores Momentos, Gols da Rodada e Cobertura Esportiva 24h',
    quality: '1080p',
    description: 'Canal oficial do Globo Esporte com notícias, análises e melhores momentos 24h.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'fifa-plus',
    name: 'FIFA+ Brasil',
    category: 'Esportes',
    logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100" width="240" height="100"><rect width="240" height="100" rx="16" fill="%230B1426"/><text x="96" y="62" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="42" fill="%23FFFFFF" text-anchor="middle" letter-spacing="2">FIFA</text><text x="170" y="64" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="52" fill="%2300FF87" text-anchor="middle">+</text></svg>',
    currentProgram: 'Copas do Mundo, Documentários e Jogos Históricos',
    quality: '720p',
    description: 'Transmissões oficiais da entidade máxima do futebol mundial em português.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://e3be9ac5.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctYnJfRklGQVBsdXNQb3J0dWd1ZXNlX0hMUw/playlist.m3u8',
        isProxy: false
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://e3be9ac5.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctYnJfRklGQVBsdXNQb3J0dWd1ZXNlX0hMUw/playlist.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'n-sports',
    name: 'N Sports',
    category: 'Esportes',
    logo: 'https://i.imgur.com/7QnJojr.png',
    currentProgram: 'Vôlei, Futsal, Basquete e Ligas Nacionais',
    quality: '1080p',
    description: 'Canal focado no esporte olímpico e universitário brasileiro.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://ogc-nsprt-tcl-roku-syndication.otteravision.com/ogc/nsprt/nsprt.m3u8',
        isProxy: false
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://ogc-nsprt-tcl-roku-syndication.otteravision.com/ogc/nsprt/nsprt.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'red-bull-tv',
    name: 'Red Bull TV Esportes',
    category: 'Esportes',
    logo: 'https://images.pluto.tv/channels/5e7cb84a172a0f0007da69e4/colorLogoPNG.png',
    currentProgram: 'Esportes Radicais, Automobilismo e Aventura',
    quality: '1080p',
    description: 'Adrenalina pura, eventos ao vivo de BMX, skate, Fórmula 1 e surfe.',
    servers: [
      {
        name: 'Servidor Oficial (Pluto HLS 1080p)',
        url: 'https://jmp2.uk/plu-5e7cb84a172a0f0007da69e4.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://jmp2.uk/plu-5e7cb84a172a0f0007da69e4.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Backup (N Sports)',
        url: 'https://ogc-nsprt-tcl-roku-syndication.otteravision.com/ogc/nsprt/nsprt.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'pluto-esportes',
    name: 'Pluto TV Esportes',
    category: 'Esportes',
    logo: 'https://images.pluto.tv/channels/5f32d2db0af67400077f29c4/colorLogoPNG.png',
    currentProgram: 'Programas de Esporte e Competições',
    quality: '720p',
    description: 'Canal gratuito com os melhores momentos, clássicos e competições de esportes.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://jmp2.uk/plu-5f32d2db0af67400077f29c4.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://jmp2.uk/plu-5f32d2db0af67400077f29c4.m3u8',
        isProxy: true
      }
    ]
  },

  // --- TV ABERTA ---
  {
    id: 'globo',
    name: 'Rede Globo HD',
    category: 'TV Aberta',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/globo-br.png',
    currentProgram: 'Jornal Nacional / Novela das Nove / Futebol',
    quality: '1080p',
    description: 'A maior emissora do país com jornalismo, novelas consagradas e futebol.',
    servers: [
      {
        name: 'Servidor 1 (ge Fast Globo)',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor 2 (Proxy Play Infinity)',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'sbt',
    name: 'SBT HD',
    category: 'TV Aberta',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sbt-br.png',
    currentProgram: 'Programa Silvio Santos / Novelas & UEFA Champions League',
    quality: '720p',
    description: 'A TV mais querida do Brasil com auditório, novelas e grandes torneios esportivos.',
    servers: [
      {
        name: 'Servidor Oficial HLS',
        url: 'https://cdn.jmvstream.com/w/LVW-10801/LVW10801_Xvg4R0u57n/playlist.m3u8',
        isProxy: false
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://cdn.jmvstream.com/w/LVW-10801/LVW10801_Xvg4R0u57n/playlist.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'record-tv',
    name: 'Record TV HD',
    category: 'TV Aberta',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/record-br.png',
    currentProgram: 'Jornal da Record / Novelas Bíblicas & Paulistão / Brasileirão',
    quality: '720p',
    description: 'Jornalismo de credibilidade, reality shows e os maiores campeonatos de futebol.',
    servers: [
      {
        name: 'Servidor 1 (Record Satélite Direto)',
        url: 'https://media.cdntvms.com.br/record_nacional_sat/index.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor 2 (Record News 720p)',
        url: 'https://rnw-rn.otteravision.com/rnw/rn/rnw_rn.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor 3 (Record Transmissão BR)',
        url: 'http://45.162.64.114/RECORD_NEWS/index.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'band',
    name: 'Rede Bandeirantes (Band)',
    category: 'TV Aberta',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/band-br.png',
    currentProgram: 'Jogo Aberto / Os Donos da Bola / Fórmula 1',
    quality: '720p',
    description: 'O canal do esporte com o Craque Neto, Renata Fan e as melhores coberturas.',
    servers: [
      {
        name: 'Servidor 1 (ge Fast Esportes)',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor 2 (Pluto Esportes)',
        url: 'https://jmp2.uk/plu-5f32d2db0af67400077f29c4.m3u8',
        isProxy: true
      }
    ]
  },

  // --- NOTÍCIAS ---
  {
    id: 'record-news',
    name: 'Record News',
    category: 'Notícias',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/record-news-br.png',
    currentProgram: 'JR News / Notícias do Brasil e do Mundo em Tempo Real',
    quality: '720p',
    description: 'A primeira TV de notícias em canal aberto do Brasil com cobertura 24 horas.',
    servers: [
      {
        name: 'Servidor 1 (Record News HD 720p)',
        url: 'https://rnw-rn.otteravision.com/rnw/rn/rnw_rn.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor 2 (Transmissão Ao Vivo)',
        url: 'http://45.162.64.114/RECORD_NEWS/index.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor 3 (Record Satélite)',
        url: 'https://media.cdntvms.com.br/record_nacional_sat/index.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'bmc-news',
    name: 'BM&C News',
    category: 'Notícias',
    logo: 'https://images.pluto.tv/channels/666c9c60a7efd40008f552f0/colorLogoPNG.png',
    currentProgram: 'Mercado Financeiro, Economia e Negócios Ao Vivo',
    quality: '720p',
    description: 'Canal especializado em finanças, cotações da bolsa, dólar e investimentos.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://jmp2.uk/plu-666c9c60a7efd40008f552f0.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://jmp2.uk/plu-666c9c60a7efd40008f552f0.m3u8',
        isProxy: true
      }
    ]
  },

  // --- FILMES & SÉRIES ---
  {
    id: 'adrenalina-pura',
    name: 'Adrenalina Pura TV',
    category: 'Filmes & Séries',
    logo: 'https://images.pluto.tv/channels/61b790b985706b00072cb797/colorLogoPNG.png',
    currentProgram: 'Filmes de Ação, Explosão e Artes Marciais',
    quality: '720p',
    description: 'Grandes sucessos do cinema de ação internacional sem pausas.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://jmp2.uk/plu-61b790b985706b00072cb797.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://jmp2.uk/plu-61b790b985706b00072cb797.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'filmes-suspense',
    name: 'Filmes Suspense & Mistério',
    category: 'Filmes & Séries',
    logo: 'https://images.pluto.tv/channels/5f171d3442a0500007362f22/colorLogoPNG.png',
    currentProgram: 'Cinema de Suspense, Terror e Thriller Psicológico',
    quality: '720p',
    description: 'As produções mais instigantes do cinema de mistério e investigação criminal.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://jmp2.uk/plu-5f171d3442a0500007362f22.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://jmp2.uk/plu-5f171d3442a0500007362f22.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'comedy-central',
    name: 'Comedy Central Ao Vivo',
    category: 'Filmes & Séries',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/comedy-central-us.png',
    currentProgram: 'South Park, Stand-up e Comédias Hilárias',
    quality: '720p',
    description: 'O melhor canal de comédia do mundo com animações e shows de humor.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://jmp2.uk/plu-5f357e91b18f0b00073583d2.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://jmp2.uk/plu-5f357e91b18f0b00073583d2.m3u8',
        isProxy: true
      }
    ]
  },

  // --- INFANTIL & ANIME ---
  {
    id: 'anime-tv',
    name: 'Pluto TV Anime Brasil',
    category: 'Infantil',
    logo: 'https://images.pluto.tv/channels/5f4fb4cf605ddf000748e16f/colorLogoPNG.png',
    currentProgram: 'Naruto, Bleach, Yu-Gi-Oh! & Animes Clássicos Dublados',
    quality: '720p',
    description: 'Canal 100% focado em animes japoneses de sucesso dublados em português.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://jmp2.uk/plu-5f4fb4cf605ddf000748e16f.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://jmp2.uk/plu-5f4fb4cf605ddf000748e16f.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'kids-junior',
    name: 'Pluto TV Junior & Kids',
    category: 'Infantil',
    logo: 'https://images.pluto.tv/channels/5ffcc5130fd98c0007f2e216/colorLogoPNG.png',
    currentProgram: 'Desenhos Animados, Clássicos e Aventuras',
    quality: '720p',
    description: 'Programação segura e educativa para crianças e toda a família.',
    servers: [
      {
        name: 'Servidor Oficial Direto',
        url: 'https://jmp2.uk/plu-5ffcc5130fd98c0007f2e216.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor Proxy Play Infinity',
        url: 'https://jmp2.uk/plu-5ffcc5130fd98c0007f2e216.m3u8',
        isProxy: true
      }
    ]
  }
,
  {
    id: 'espn-5',
    name: 'ESPN 5 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    currentProgram: 'Programação Esportiva e Eventos',
    quality: '1080p',
    description: 'Mais opções esportivas, basquete, beisebol, futebol e debates.',
    servers: [
      {
        name: 'Servidor 1 (Kiwi HD Principal)',
        url: 'http://up.kiwi/351921603109/34939156/296556',
        isProxy: true
      },
      {
        name: 'Servidor 2 (Kiwi HD Backup)',
        url: 'http://up.kiwi/351921603109/34939156/497',
        isProxy: true
      },
      {
        name: 'Servidor 3 (Kiwi FHD H265)',
        url: 'http://up.kiwi/351921603109/34939156/493',
        isProxy: true
      },
      {
        name: 'Servidor 4 (Kiwi SD Backup)',
        url: 'http://up.kiwi/351921603109/34939156/296557',
        isProxy: true
      }
    ]
  },
  {
    id: 'band-sports',
    name: 'Band Sports HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/band-br.png',
    currentProgram: 'Programação Esportiva e Eventos Ao Vivo',
    quality: '1080p',
    description: 'O canal de esportes do Grupo Bandeirantes.',
    servers: [
      {
        name: 'Servidor 1 (Kiwi HD Principal)',
        url: 'http://up.kiwi/351921603109/34939156/147',
        isProxy: true
      },
      {
        name: 'Servidor 2 (Kiwi FHD Backup)',
        url: 'http://up.kiwi/351921603109/34939156/145',
        isProxy: true
      },
      {
        name: 'Servidor 3 (Kiwi HD² Backup)',
        url: 'http://up.kiwi/351921603109/34939156/296480',
        isProxy: true
      }
    ]
  },
  {
    id: 'combate',
    name: 'Combate HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/combate-br.png',
    currentProgram: 'Lutas, MMA, Boxe, Eventos e Pesagens',
    quality: '1080p',
    description: 'O maior canal de lutas e artes marciais do Brasil.',
    servers: [
      {
        name: 'Servidor 1 (Kiwi HD Principal)',
        url: 'http://up.kiwi/351921603109/34939156/280',
        isProxy: true
      },
      {
        name: 'Servidor 2 (Kiwi FHD Backup)',
        url: 'http://up.kiwi/351921603109/34939156/278',
        isProxy: true
      },
      {
        name: 'Servidor 3 (Kiwi HD² Backup)',
        url: 'http://up.kiwi/351921603109/34939156/296482',
        isProxy: true
      }
    ]
  },
  {
    id: 'discovery-channel',
    name: 'Discovery Channel HD',
    category: 'Variedades',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/discovery-channel-us.png',
    currentProgram: 'Documentários, Ciência e Exploração',
    quality: '1080p',
    description: 'O canal pioneiro em documentários sobre ciência, tecnologia, história e natureza.',
    servers: [
      { name: 'Servidor 1 (Kiwi FHD)', url: 'http://up.kiwi/351921603109/34939156/340', isProxy: true },
      { name: 'Servidor 2 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/342', isProxy: true },
      { name: 'Servidor 3 (Kiwi HD²)', url: 'http://up.kiwi/351921603109/34939156/296584', isProxy: true }
    ]
  },
  {
    id: 'history',
    name: 'History HD',
    category: 'Variedades',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/history-us.png',
    currentProgram: 'Programas Históricos e Realities',
    quality: '1080p',
    description: 'A história do mundo, grandes eventos e teorias fascinantes.',
    servers: [
      { name: 'Servidor 1 (Kiwi FHD)', url: 'http://up.kiwi/351921603109/34939156/669', isProxy: true },
      { name: 'Servidor 2 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/671', isProxy: true },
      { name: 'Servidor 3 (Kiwi HD²)', url: 'http://up.kiwi/351921603109/34939156/296604', isProxy: true }
    ]
  },
  {
    id: 'animal-planet',
    name: 'Animal Planet HD',
    category: 'Variedades',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/animal-planet-us.png',
    currentProgram: 'Vida Selvagem e Natureza',
    quality: '1080p',
    description: 'Programas focados na relação entre humanos e animais e na vida selvagem.',
    servers: [
      { name: 'Servidor 1 (Kiwi FHD)', url: 'http://up.kiwi/351921603109/34939156/28', isProxy: true },
      { name: 'Servidor 2 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/30', isProxy: true },
      { name: 'Servidor 3 (Kiwi HD²)', url: 'http://up.kiwi/351921603109/34939156/296564', isProxy: true }
    ]
  },
  {
    id: 'discovery-id',
    name: 'Discovery ID HD',
    category: 'Variedades',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/investigation-discovery-us.png',
    currentProgram: 'Crimes Reais e Investigações',
    quality: '1080p',
    description: 'Mistérios da vida real, crimes chocantes e grandes investigações forenses.',
    servers: [
      { name: 'Servidor 1 (Kiwi FHD)', url: 'http://up.kiwi/351921603109/34939156/351', isProxy: true },
      { name: 'Servidor 2 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/353', isProxy: true },
      { name: 'Servidor 3 (Kiwi HD²)', url: 'http://up.kiwi/351921603109/34939156/296570', isProxy: true }
    ]
  },
  {
    id: 'xxx-hardcore',
    name: 'XXX HARDCORE',
    category: 'Adultos',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/playboy-tv-us.png',
    currentProgram: 'Conteúdo Adulto (18+)',
    quality: '1080p',
    description: 'Canal de TV focado em conteúdo adulto explícito.',
    servers: [
      { name: 'Servidor 1 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/1730', isProxy: true }
    ]
  },
  {
    id: 'xxx-live-cams',
    name: 'XXX LIVE CAMS',
    category: 'Adultos',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/playboy-tv-us.png',
    currentProgram: 'Câmeras Ao Vivo (18+)',
    quality: '1080p',
    description: 'Transmissões ao vivo ininterruptas de webcams adultas.',
    servers: [
      { name: 'Servidor 1 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/1742', isProxy: true }
    ]
  },
  {
    id: 'xxx-anal',
    name: 'XXX ANAL',
    category: 'Adultos',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/playboy-tv-us.png',
    currentProgram: 'Conteúdo Adulto (18+)',
    quality: '1080p',
    description: 'Canal de TV focado em conteúdo adulto explícito.',
    servers: [
      { name: 'Servidor 1 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/1695', isProxy: true }
    ]
  },
  {
    id: 'of-juliana-bonde',
    name: 'OF - JULIANA BONDE',
    category: 'Adultos',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/playboy-tv-us.png',
    currentProgram: 'Conteúdo Exclusivo (18+)',
    quality: '1080p',
    description: 'Canal dedicado ao conteúdo OnlyFans da Juliana Bonde.',
    servers: [
      { name: 'Servidor 1 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/300324', isProxy: true }
    ]
  },
  {
    id: 'of-elisa-sanches',
    name: 'OF - ELISA SANCHES',
    category: 'Adultos',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/playboy-tv-us.png',
    currentProgram: 'Conteúdo Exclusivo (18+)',
    quality: '1080p',
    description: 'Canal dedicado ao conteúdo OnlyFans da Elisa Sanches.',
    servers: [
      { name: 'Servidor 1 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/300318', isProxy: true }
    ]
  },
  {
    id: 'of-mc-pipokinha',
    name: 'OF - MC PIPOKINHA',
    category: 'Adultos',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/playboy-tv-us.png',
    currentProgram: 'Conteúdo Exclusivo (18+)',
    quality: '1080p',
    description: 'Canal dedicado ao conteúdo OnlyFans da MC Pipokinha.',
    servers: [
      { name: 'Servidor 1 (Kiwi HD)', url: 'http://up.kiwi/351921603109/34939156/300341', isProxy: true }
    ]
  }
];