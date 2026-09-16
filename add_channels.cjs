const fs = require('fs');

const path = 'src/data/liveChannels.ts';
let content = fs.readFileSync(path, 'utf8');

const newChannels = `  {
    id: 'espn-5',
    name: 'ESPN 5 HD',
    category: 'Esportes',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    currentProgram: 'Programação Esportiva e Eventos',
    quality: '1080p',
    description: 'Mais opções esportivas, basquete, beisebol, futebol e debates.',
    servers: [
      {
        name: 'Servidor 1 (Stream Primário)',
        url: 'http://up.kiwi/351921603109/34939156/296556',
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
        name: 'Servidor 1 (Stream Primário)',
        url: 'http://up.kiwi/351921603109/34939156/147',
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
        name: 'Servidor 1 (Stream Primário)',
        url: 'http://up.kiwi/351921603109/34939156/280',
        isProxy: true
      }
    ]
  }
];`;

content = content.replace(/\];\s*$/, ',\n' + newChannels);
fs.writeFileSync(path, content);
