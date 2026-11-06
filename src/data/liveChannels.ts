export interface LiveChannel {
  id: string;
  name: string;
  category: 'Esportes' | 'TV Aberta' | 'Notícias' | 'Filmes & Séries' | 'Infantil' | 'Variedades';
  logo: string;
  currentProgram?: string;
  quality: '720p' | '1080p' | 'HD';
  isCustom?: boolean;
  servers: {
    name: string;
    url: string;
    isProxy?: boolean;
    isEmbed?: boolean;
  }[];
  description?: string;
  /**
   * Quando true, getPublicLiveChannels NAO anexa fontes embed do MinhaTela
   * nem reordena servidores — o canal fica travado nos servers definidos
   * abaixo (usado para canais cuja fonte foi curada manualmente, ex. o
   * Premiere Clubes com o servidor embedTV HLS assinado).
   */
  lockServers?: boolean;
}

export const INITIAL_LIVE_CHANNELS: LiveChannel[] = [
  // --- ESPORTES & PREMIERE ---
  {
    id: 'premiere-1',
    name: 'Premiere Clubes',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Campeonato Brasileiro - Série A & B Ao Vivo',
    quality: '720p',
    description: 'Transmissões completas e exclusivas dos jogos do futebol nacional.',
    // Fonte única curada: embedTV (mesmo operador do embedcanaisdetv.xyz),
    // playlist HLS live disfarçada de error.txt no host s25-cloudfront-net.lat
    // (Cloudflare WAF, CORS * na playlist; segmentos em lb02 sem CORS → proxy).
    // Proxy assinado injeta Referer https://w7.embedtv.cc/ + UA Chrome/126
    // (exigidos pelo WAF para IPs não-datacenter; a VPS passa até sem eles,
    // mas mantemos por fidelidade ao catálogo saimo). Sig = HMAC-SHA256 do
    // PROXY_SECRET sobre a URL upstream — determinístico, não expira; se o
    // PROXY_SECRET for rotacionado, regerar com scripts/vps_sign_premiere_fonte2.py.
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz%2Fpremiereclubes%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=29097558a041595382b50d7863f618fa91cd9fc953af0e3800a4856176463d4d',
        isProxy: false
      },
      {
        name: 'Servidor 2',
        url: '/api/saimo-source?channel=premiere-1&source=2',
        isProxy: false
      }
    ]
  },
  {
    id: 'premiere-2',
    name: 'Premiere 2 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Transmissão Ao Vivo - Rodada Esportiva',
    quality: '720p',
    description: 'Canal secundário Premiere para rodadas simultâneas de jogos.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz%2Fpremiere2%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=5a7516bcea811f03361788226111cd858a3083078f25df8a1c707ab15a690d0b',
        isProxy: false
      },
      {
        name: 'Servidor 2',
        url: '/api/saimo-source?channel=premiere-2&source=2',
        isProxy: false
      }
    ]
  },
  {
    id: 'premiere-3',
    name: 'Premiere 3 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Futebol Ao Vivo - Jogos Simultâneos',
    quality: '720p',
    description: 'Cobertura de todos os lances e partidas dos campeonatos estaduais e nacionais.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz%2Fpremiere3%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=eee4df7e7c09746806f882ccd5112601fcbfd8868dfe7a480ccac06e1170f1a1',
        isProxy: false
      }
    ]
  },
  {
    id: 'premiere-4',
    name: 'Premiere 4 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Copa do Brasil & Campeonatos Estaduais',
    quality: '720p',
    description: 'Canal complementar Premiere com cobertura de futebol 100% brasileira.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz%2Fpremiere4%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=27e409e5b90918d98f204e5aca24592efd363cab981b145fd1903d6a72b9abd7',
        isProxy: false
      }
    ]
  },
  {
    id: 'premiere-5',
    name: 'Premiere 5 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Futebol Ao Vivo - Jogos Simultâneos',
    quality: '720p',
    description: 'Canal Premiere 5 com cobertura de jogos ao vivo do futebol nacional.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz%2Fpremiere5%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=bfe4c0204b51232d2a036c506adbd0819d8dfd69c4b901c04cba8242ae282a33',
        isProxy: false
      }
    ]
  },
  {
    id: 'premiere-6',
    name: 'Premiere 6 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Futebol Ao Vivo - Jogos Simultâneos',
    quality: '720p',
    description: 'Canal Premiere 6 com cobertura de jogos ao vivo do futebol nacional.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz%2Fpremiere6%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=71e6cf1a8ca3a7f6c4f5c0817f1a2b843d600eab5e9749eafed519c448176030',
        isProxy: false
      }
    ]
  },
  {
    id: 'premiere-7',
    name: 'Premiere 7 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
    currentProgram: 'Futebol Ao Vivo - Jogos Simultâneos',
    quality: '720p',
    description: 'Canal Premiere 7 com cobertura de jogos ao vivo do futebol nacional.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz%2Fpremiere7%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=633511e2924dfc48845c85d52452939c4b8fbb6ce945055288e6a3062dcb68d9',
        isProxy: false
      }
    ]
  },
  {
    id: 'sportv',
    name: 'SporTV HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv-br.png',
    currentProgram: 'Tá na Área / Troca de Passes & Jogos Ao Vivo',
    quality: '720p',
    description: 'O canal campeão com debates, cobertura ao vivo, vôlei, basquete e futebol.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2F6d42cfb0a7106e953bc582f1b9a6763a%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=541140cf0017f08ae75d6142e4e541836f0e512391906fefaf7001d997d49a72',
        isProxy: false
      }
    ]
  },
  {
    id: 'sportv-2',
    name: 'SporTV 2 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv2-br.png',
    currentProgram: 'Eventos Olímpicos, Atletismo e Futebol Ao Vivo',
    quality: '720p',
    description: 'Transmissões esportivas variadas e grandes competições mundiais.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn10embed.xyz%2Fsportv2%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=03fa378345428f990a52b6e7cb600c9b453f1aa8eb0bdc79ce43fcc85b97176b',
        isProxy: false
      },
      {
        name: 'Servidor 2',
        url: '/api/saimo-source?channel=sportv-2&source=2',
        isProxy: false
      }
    ]
  },
  {
    id: 'sportv-3',
    name: 'SporTV 3 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv3-br.png',
    currentProgram: 'Automobilismo, Tênis e Ligas Internacionais',
    quality: '720p',
    description: 'Esportes radicais, automobilismo, lutas e futebol.',
    // Fonte única curada: embedTV (mesmo operador/host do Premiere Clubes),
    // Fonte 2 do catalogo saimo-tv para SporTV 3 — mesma cadeia: playlist HLS
    // live disfarçada de error.txt em s25-cloudfront-net.lat, segmentos .png
    // (MPEG-TS) em lb02 sem CORS → proxy. Referer https://w7.embedtv.cc/ +
    // UA Chrome/126 exigidos pelo WAF do Cloudflare. Sig = HMAC-SHA256 do
    // PROXY_SECRET (determinístico, não expira; regerar com
    // scripts/vps_sign_premiere_fonte2.py <url> se rotacionado).
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2Fe7e4de42b3bcdff4ea97933dcadf207f%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=5f07ea9f7348bee5516de7c98cca37a05642cb12f7907d2a8bbf5ba0ae1e5249',
        isProxy: false
      }
    ]
  },
  {
    id: 'espn-brasil',
    name: 'ESPN Brasil HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    currentProgram: 'SportsCenter / Premier League & Libertadores',
    quality: '720p',
    description: 'O líder mundial em esportes com Premier League, LaLiga, NFL, NBA e debates.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2Fedfeb9b7a050b21ff86fd4e14d4df830%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=21dbc1c8413f18e9816858459291570bdb5ccddb5d3cd07afefff569a369f3a7',
        isProxy: false
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
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2Fd1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz%2Fcazetv%2Findex.m3u8&referer=https%3A%2F%2Fembedcanaisdetv.xyz%2F&agente=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F126.0%20Safari%2F537.36&sig=c3d1aee563810717685f63558499a1a354aadb1169641d67ff348717e18b9beb',
        isProxy: false
      },
      {
        name: 'Servidor 2',
        url: '/api/saimo-source?channel=cazetv&source=2',
        isProxy: false
      }
    ]
  },
  {
    id: 'ge-fast',
    name: 'ge Fast (Globo Esporte)',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/ge-tv-br.png',
    currentProgram: 'Melhores Momentos, Gols da Rodada e Cobertura Esportiva 24h',
    quality: '720p',
    description: 'Canal oficial do Globo Esporte com notícias, análises e melhores momentos 24h.',
    servers: [
      {
        name: 'Servidor 1',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor 2',
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
        name: 'Servidor 1',
        url: 'https://e3be9ac5.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctYnJfRklGQVBsdXNQb3J0dWd1ZXNlX0hMUw/playlist.m3u8',
        isProxy: false
      },
      {
        name: 'Servidor 2',
        url: 'https://e3be9ac5.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctYnJfRklGQVBsdXNQb3J0dWd1ZXNlX0hMUw/playlist.m3u8',
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
        name: 'Servidor 1',
        url: '/api/external-channel?name=GE%20TV',
        isProxy: false
      },
      {
        name: 'Servidor 2',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
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
    quality: '720p',
    description: 'A maior emissora do país com jornalismo, novelas consagradas e futebol.',
    servers: [
      {
        name: 'Servidor 1',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
        isProxy: false
      },
      {
        name: 'Servidor 2',
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
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F8f246fdcdd11e03e7750ed4f8e050161.s25-cloudfront-net.lat%2Fstream%2F490cc63080757904d5fd8a95fd1f34f6%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=ab71a48d6e34750c0b7b1cc7d7359800e0e9e02d8318657a5e105cdd6f30addb',
        isProxy: false
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
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2Fee45560b3bf960ee39cc94fd34fa03d4%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=eadfd6fc1e40ae881a1387e0aa58d98afd2ffe12413a9b950b9b246e0030efb4',
        isProxy: false
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
    // Upstream embedTV morto (HTTP 404 desde nov/2026 — stream hash
    // 41f3ad648b8590ca219cf5e28b908b0b foi removido do s25-cloudfront-net.lat).
    // Substituído pela fonte Saimo (138.204.86.4:8080/BAND_HD/index.m3u8, 720p 30fps),
    // acessível via /api/saimo-source que assina a URL proxy server-side com o
    // PROXY_SECRET real (não depende do fallback). Site embedtv.cc também está
    // com player quebrado: as 145 páginas ww0.embedtv.cc/<id> servem todas o
    // mesmo stream de teste Akamai (cph-p2p-msl.akamaized.net/hls/live/2000341/test).
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/saimo-source?channel=band&source=2',
        isProxy: false
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
        name: 'Servidor 1',
        url: '/api/external-channel?name=Record%20News',
        isProxy: false
      },
      {
        name: 'Servidor 2',
        url: 'https://rnw-rn.otteravision.com/rnw/rn/rnw_rn.m3u8',
        isProxy: true
      },
      {
        name: 'Servidor 3',
        url: 'http://45.162.64.114/RECORD_NEWS/index.m3u8',
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
        name: 'Servidor 1',
        url: '/api/external-channel?name=CNN%20Brasil%20Money',
        isProxy: false
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
        name: 'Servidor 1',
        url: '/api/external-channel?name=Telecine%20Action',
        isProxy: false
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
        name: 'Servidor 1',
        url: '/api/external-channel?name=Cinemax',
        isProxy: false
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
        name: 'Servidor 1',
        url: '/api/external-channel?name=Telecine%20Fun',
        isProxy: false
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
        name: 'Servidor 1',
        url: '/api/external-channel?name=Cartoon%20Network',
        isProxy: false
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
        name: 'Servidor 1',
        url: '/api/external-channel?name=Discovery%20Kids',
        isProxy: false
      }
    ]
  },
  {
    id: 'espn-5',
    name: 'ESPN 5 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    currentProgram: 'Programação Esportiva e Eventos',
    quality: '720p',
    description: 'Mais opções esportivas, basquete, beisebol, futebol e debates.',
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/external-channel?name=ESPN%205',
        isProxy: false
      }
    ]
  },
  {
    id: 'espn-2',
    name: 'ESPN 2 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    currentProgram: 'NBA, MLB e Ligas Internacionais',
    quality: '720p',
    description: 'ESPN 2 com transmissões de esportes americanos e internacionais.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2F61c168a5c8e93c396f48e9c0d5d255c5%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=b022c523067fd4aff7588266d47518d41f6349f58785663ae9af04e604a869e5',
        isProxy: false
      }
    ]
  },
  {
    id: 'espn-3',
    name: 'ESPN 3 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    currentProgram: 'Futebol Internacional, ATP e Ligas',
    quality: '720p',
    description: 'ESPN 3 com transmissões de futebol internacional, tênis e mais.',
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/external-channel?name=ESPN%203',
        isProxy: false
      }
    ]
  },
  {
    id: 'espn-4',
    name: 'ESPN 4 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    currentProgram: 'NFL, NBA e Ligas Americanas',
    quality: '720p',
    description: 'ESPN 4 com cobertura dos principais campeonatos americanos.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2F510d20496dc6bb017304d125c737f16c%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=24ca543027e82ca53f1c45a594531dba7b8a5c762616e7aff235b99fa7cdeb94',
        isProxy: false
      }
    ]
  },
  {
    id: 'fox-sports',
    name: 'Fox Sports HD',
    category: 'Esportes',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Fox_Sports_1_logo.svg/512px-Fox_Sports_1_logo.svg.png',
    currentProgram: 'Libertadores, Sul-Americana e Eventos',
    quality: '720p',
    description: 'Fox Sports com transmissões de futebol sul-americano e esportes radicais.',
    servers: [
      {
        name: 'Servidor 1',
        // Fox Sports virou ESPN 4 no Brasil (2022) — fonte equivalente no catálogo externo
        url: '/api/external-channel?name=ESPN%204',
        isProxy: false
      }
    ]
  },
  {
    id: 'tnt-sports',
    name: 'TNT Sports HD',
    category: 'Esportes',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/TNT_Sports.svg/512px-TNT_Sports.svg.png',
    currentProgram: 'NBA, Champions e Premier League',
    quality: '720p',
    description: 'TNT Sports com transmissões de NBA, Champions League e Premier League.',
    servers: [
      {
        name: 'Servidor 1',
        // TNT Sports não existe no catálogo externo — ESPN 2 cobre NBA/ligas (conteúdo mais próximo)
        url: '/api/external-channel?name=ESPN%202',
        isProxy: false
      }
    ]
  },
  {
    id: 'band-sports',
    name: 'Band Sports HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/band-br.png',
    currentProgram: 'Programação Esportiva e Eventos Ao Vivo',
    quality: '720p',
    description: 'O canal de esportes do Grupo Bandeirantes.',
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/external-channel?name=BAND%20SPORTS%20HD',
        isProxy: false
      },
      {
        name: 'Servidor 2',
        url: 'https://amg00716-globo-amg00716c1-tcl-br-9495.playouts.now.amagi.tv/playlist.m3u8',
        isProxy: true
      }
    ]
  },
  {
    id: 'combate',
    name: 'Combate HD',
    category: 'Esportes',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Combate_canal.svg/512px-Combate_canal.svg.png',
    currentProgram: 'Lutas, MMA, Boxe, Eventos e Pesagens',
    quality: '720p',
    description: 'O maior canal de lutas e artes marciais do Brasil.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2F60436cfbd0a47c5ffcb9074298b97fbc%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=2f24ac5393d4427a287861acdd7ad67a2818bfa7c7bad3461c11d7039f0517d1',
        isProxy: false
      }
    ]
  },
  {
    id: 'discovery-channel',
    name: 'Discovery Channel HD',
    category: 'Variedades',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/discovery-channel-us.png',
    currentProgram: 'Documentários, Ciência e Exploração',
    quality: '720p',
    description: 'O canal pioneiro em documentários sobre ciência, tecnologia, história e natureza.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2Fe28bf0fed83f4889c7d23224dbecdfa1%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=eb4ae0b1587b7292e3c78ae29f615b754236c1c28756ad49a1239cf662edf5c0',
        isProxy: false
      }
    ]
  },
  {
    id: 'history',
    name: 'History HD',
    category: 'Variedades',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/History_Channel_Logo_2021.svg/512px-History_Channel_Logo_2021.svg.png',
    currentProgram: 'Programas Históricos e Realities',
    quality: '720p',
    description: 'A história do mundo, grandes eventos e teorias fascinantes.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2F81cd1c0411b55bbfbd05c17d4de8ed1b%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=34b525e6d2cf48a687f9e9d7f2c56227dd481d7f3806316dc40952819747a43e',
        isProxy: false
      }
    ]
  },
  {
    id: 'animal-planet',
    name: 'Animal Planet HD',
    category: 'Variedades',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/animal-planet-us.png',
    currentProgram: 'Vida Selvagem e Natureza',
    quality: '720p',
    description: 'Programas focados na relação entre humanos e animais e na vida selvagem.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2Fb9d136b917437d532bd57a8e05d536de%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=067be0661e735b670496328003e21adb4f41f97a149d8c6123a095a923a99426',
        isProxy: false
      }
    ]
  },
  {
    id: 'discovery-id',
    name: 'Discovery ID HD',
    category: 'Variedades',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/investigation-discovery-us.png',
    currentProgram: 'Crimes Reais e Investigações',
    quality: '720p',
    description: 'Mistérios da vida real, crimes chocantes e grandes investigações forenses.',
    lockServers: true,
    servers: [
      {
        name: 'Servidor 1',
        url: '/api/live-stream-proxy?url=https%3A%2F%2F92ef03b0a53c20499bcde22fe03440c5.s25-cloudfront-net.lat%2Fstream%2F18b4fefcddfce3fd86d84079bfca5ee1%2Ferror.txt&referer=https%3A%2F%2Fw7.embedtv.cc%2F&agente=Mozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0+Safari%2F537.36&sig=dab4a1285bf946dc1a5c342f69427124af2a9877c2666d59dbac3891de9d95ae',
        isProxy: false
      }
    ]
  }
];
