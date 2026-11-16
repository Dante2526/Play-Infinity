const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

async function compileParser() {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: {
      contents: `export * from './src/utils/voiceCommandParser.ts';`,
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false
  });

  const filename = path.join(root, 'tests/virtual-parser.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

test('detects wake word "Infinity" and phonetic variants', async () => {
  const { hasWakeWord } = await compileParser();
  assert.equal(hasWakeWord('Infinity'), true);
  assert.equal(hasWakeWord('Ei infiniti pause o vídeo'), true);
  assert.equal(hasWakeWord('Infinito aumentar volume'), true);
  assert.equal(hasWakeWord('Olá google'), false);
});

test('parses playback commands with and without wake-word', async () => {
  const { parseVoiceCommand } = await compileParser();

  // Pause
  assert.equal(parseVoiceCommand('Infinity pause')?.action, 'PAUSE');
  assert.equal(parseVoiceCommand('pausar')?.action, 'PAUSE');

  // Play
  assert.equal(parseVoiceCommand('Infinity play')?.action, 'PLAY');
  assert.equal(parseVoiceCommand('continuar')?.action, 'PLAY');
});

test('parses navigation and volume commands', async () => {
  const { parseVoiceCommand } = await compileParser();

  // Próximo episódio
  assert.equal(parseVoiceCommand('Infinity próximo episódio')?.action, 'NEXT_EPISODE');
  assert.equal(parseVoiceCommand('proximo ep')?.action, 'NEXT_EPISODE');

  // Pular abertura
  assert.equal(parseVoiceCommand('Infinity pular abertura')?.action, 'SKIP_INTRO');
  assert.equal(parseVoiceCommand('pula intro')?.action, 'SKIP_INTRO');

  // Volume
  assert.equal(parseVoiceCommand('Infinity aumentar volume')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('mais alto')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('Infinity diminuir volume')?.action, 'VOLUME_DOWN');
  assert.equal(parseVoiceCommand('mais baixo')?.action, 'VOLUME_DOWN');
  assert.equal(parseVoiceCommand('Infinity mudo')?.action, 'MUTE');
});

test('parses screen adjust and seek commands', async () => {
  const { parseVoiceCommand } = await compileParser();

  // Tela cheia e proporção
  assert.equal(parseVoiceCommand('Infinity tela cheia')?.action, 'FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity ajustar tela')?.action, 'ASPECT_RATIO');
  assert.equal(parseVoiceCommand('esticar')?.action, 'ASPECT_RATIO');

  // Avançar / Voltar
  assert.equal(parseVoiceCommand('avançar 10 segundos')?.action, 'SEEK_FORWARD');
  assert.equal(parseVoiceCommand('voltar 10 segundos')?.action, 'SEEK_REWIND');
});

test('ignores movie dialogue preceding wake-word in continuous segments', async () => {
  const { parseVoiceCommand, extractCommandAfterWakeWord, normalizeVoiceText } = await compileParser();

  assert.equal(
    extractCommandAfterWakeWord(normalizeVoiceText('para o carro agora infinity aumentar volume')),
    'aumentar volume'
  );
  assert.equal(parseVoiceCommand('para o carro agora infinity aumentar volume')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('pular cena infiniti pause')?.action, 'PAUSE');
  assert.equal(parseVoiceCommand('infinity'), null);
});

test('handles PT-BR natural variations, "pula 10" vs "pular abertura", and wake-resume wiring', async () => {
  const { hasWakeWord, parseVoiceCommand } = await compileParser();

  // Wake word phonetic variant "infinite" + accented "para aí"
  assert.equal(hasWakeWord('infinite pausar'), true);
  assert.equal(parseVoiceCommand('infinite pausar')?.action, 'PAUSE');
  assert.equal(parseVoiceCommand('para aí')?.action, 'PAUSE');
  assert.equal(parseVoiceCommand('segura')?.action, 'PAUSE');

  // "pula 10" / "pular 10" não pode cair em SKIP_INTRO
  assert.equal(parseVoiceCommand('pula 10 segundos')?.action, 'SEEK_FORWARD');
  assert.equal(parseVoiceCommand('pular 10')?.action, 'SEEK_FORWARD');
  assert.equal(parseVoiceCommand('pular para frente')?.action, 'SEEK_FORWARD');
  assert.equal(parseVoiceCommand('pular abertura')?.action, 'SKIP_INTRO');
  assert.equal(parseVoiceCommand('pula intro')?.action, 'SKIP_INTRO');

  // Play e Mudo naturais
  assert.equal(parseVoiceCommand('continua')?.action, 'PLAY');
  assert.equal(parseVoiceCommand('toca')?.action, 'PLAY');
  assert.equal(parseVoiceCommand('tirar do mudo')?.action, 'MUTE');
  assert.equal(parseVoiceCommand('ativar som')?.action, 'MUTE');
  assert.equal(parseVoiceCommand('voltar o som')?.action, 'MUTE');

  const root = path.resolve(__dirname, '..');
  const skinSrc = fs.readFileSync(path.join(root, 'src/components/NetflixPlayerSkin.tsx'), 'utf8');
  const hookSrc = fs.readFileSync(path.join(root, 'src/hooks/usePlayerVoiceAssistant.ts'), 'utf8');
  assert.match(skinSrc, /pausedByWakeRef/);
  assert.match(skinSrc, /onWakeExpired/);
  assert.match(hookSrc, /onWakeExpired/);
});

test('recognizes vocal pitch variations (deep/high/soft), ignores movie dialogue false triggers, and parses far-field short commands', async () => {
  const { hasWakeWord, parseVoiceCommand, parseBestVoiceAlternative } = await compileParser();

  // Variações de timbre grave, agudo e distante para "Infinity"
  assert.equal(hasWakeWord('infinita pausar'), true);
  assert.equal(parseVoiceCommand('infinita pausar')?.action, 'PAUSE');
  assert.equal(parseVoiceCommand('Infinito aumentar volume')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('in finity aumentar volume')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('finiti pula 10')?.action, 'SEEK_FORWARD');
  assert.equal(parseVoiceCommand('affinity mudo')?.action, 'MUTE');
  assert.equal(hasWakeWord('onfinity pause'), true);
  assert.equal(parseVoiceCommand('onfinity pause')?.action, 'PAUSE');
  assert.equal(hasWakeWord('ei infinito'), true);

  // Proteção anti-conflito: diálogos comuns de filmes em PT-BR NÃO podem acordar o assistente
  assert.equal(hasWakeWord('ao infinito e alem vamos continuar correndo'), false);
  assert.equal(parseVoiceCommand('ao infinito e alem vamos continuar correndo'), null);
  assert.equal(hasWakeWord('guerra infinita foi um filme incrivel'), false);
  assert.equal(parseVoiceCommand('guerra infinita foi um filme incrivel'), null);
  assert.equal(hasWakeWord('enfim continua a historia'), false);
  assert.equal(hasWakeWord('enfim para o carro agora'), false);

  // Comandos curtos em quarto distante
  assert.equal(parseVoiceCommand('sobe')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('tá muito baixo')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('tá muito alto')?.action, 'VOLUME_DOWN');
  assert.equal(parseVoiceCommand('dá uma pausa')?.action, 'PAUSE');
  assert.equal(parseVoiceCommand('tira a abertura')?.action, 'SKIP_INTRO');
  assert.equal(parseVoiceCommand('mais 10')?.action, 'SEEK_FORWARD');

  // Seleção da melhor alternativa quando a 1ª hipótese vem errada
  const best = parseBestVoiceAlternative([
    'em fim de semana',
    'infinidade nada a ver',
    'infinity aumentar volume'
  ]);
  assert.equal(best.wakeDetected, true);
  assert.equal(best.command?.action, 'VOLUME_UP');

  // Recuperação de cold-start: silaba inicial "In-" cortada após pausa longa
  assert.equal(hasWakeWord('finito pausar'), true);
  assert.equal(parseVoiceCommand('finito pausar')?.action, 'PAUSE');
  assert.equal(hasWakeWord('finite continuar'), true);
  assert.equal(parseVoiceCommand('finite continuar')?.action, 'PLAY');
  assert.equal(hasWakeWord('viniti aumentar volume'), true);
  assert.equal(parseVoiceCommand('viniti aumentar volume')?.action, 'VOLUME_UP');
  assert.equal(hasWakeWord('finita silenciar'), true);
  assert.equal(parseVoiceCommand('finita silenciar')?.action, 'MUTE');
  assert.equal(hasWakeWord('piniti avancar'), true);
  // Proteção anti-pausa fantasma: "finito/finita/finite" sozinhos ou em falas de filme NÃO acordam sem comando
  assert.equal(hasWakeWord('ele disse que tudo e finito'), false);
  assert.equal(hasWakeWord('finito'), false);
  assert.equal(hasWakeWord('recurso finito do planeta'), false);

  // Hipóteses secundárias com ruído fonético sem comando NÃO disparam wake
  const noiseBest = parseBestVoiceAlternative([
    'dialogo qualquer do filme tocando no alto falante',
    'algo parecido com infinity mas sem comando',
    'finiti'
  ]);
  assert.equal(noiseBest.wakeDetected, false, 'Secondary phonetic noise without command must NOT wake');
  assert.equal(noiseBest.command, null);
});

test('handles explicit FULLSCREEN (card -> fullscreen) and EXIT_FULLSCREEN without volume/rewind collisions', async () => {
  const { parseVoiceCommand } = await compileParser();

  // Entrar em tela cheia a partir do cartão (idempotente)
  assert.equal(parseVoiceCommand('Infinity tela cheia')?.action, 'FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinito tela cheia')?.action, 'FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity ir para tela cheia')?.action, 'FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity entrar em tela cheia')?.action, 'FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity colocar em tela cheia')?.action, 'FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity aumentar a tela')?.action, 'FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity tela grande')?.action, 'FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity modo cinema')?.action, 'FULLSCREEN');

  // Sair da tela cheia sem colidir com "tela cheia", "voltar" (SEEK_REWIND) ou "diminuir" (VOLUME_DOWN)
  assert.equal(parseVoiceCommand('Infinity sair da tela cheia')?.action, 'EXIT_FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity fechar tela cheia')?.action, 'EXIT_FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity minimizar')?.action, 'EXIT_FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity voltar para o cartao')?.action, 'EXIT_FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity diminuir a tela')?.action, 'EXIT_FULLSCREEN');
  assert.equal(parseVoiceCommand('Infinity tela normal')?.action, 'EXIT_FULLSCREEN');

  // Garante que comandos de volume e retrocesso originais seguem intactos
  assert.equal(parseVoiceCommand('Infinity aumentar volume')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('Infinity diminuir volume')?.action, 'VOLUME_DOWN');
  assert.equal(parseVoiceCommand('Infinity voltar 10')?.action, 'SEEK_REWIND');

  const root = path.resolve(__dirname, '..');
  const skinSrc = fs.readFileSync(path.join(root, 'src/components/NetflixPlayerSkin.tsx'), 'utf8');
  const modalSrc = fs.readFileSync(path.join(root, 'src/components/VideoPlayerModal.tsx'), 'utf8');
  assert.match(skinSrc, /case 'EXIT_FULLSCREEN':/);
  assert.match(skinSrc, /onSetFullscreen/);
  assert.match(modalSrc, /onSetFullscreen=\{\(expand\) => \{ void setPlayerExpanded\(expand\); \}\}/);
});

test('handles MINI_PLAYER and EXIT_MINI_PLAYER without colliding with PLAY or SEEK_REWIND', async () => {
  const { parseVoiceCommand } = await compileParser();

  // Entrar em Mini-Player (inclui variações fonéticas PT-BR do STT como "mini play")
  assert.equal(parseVoiceCommand('Infinity mini player')?.action, 'MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinito mini player')?.action, 'MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinity miniplayer')?.action, 'MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinity mini play')?.action, 'MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinity janela flutuante')?.action, 'MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinity pip')?.action, 'MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinity picture in picture')?.action, 'MINI_PLAYER');

  // Sair do Mini-Player sem cair em MINI_PLAYER ou SEEK_REWIND
  assert.equal(parseVoiceCommand('Infinity sair do mini player')?.action, 'EXIT_MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinity fechar mini player')?.action, 'EXIT_MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinity restaurar player')?.action, 'EXIT_MINI_PLAYER');
  assert.equal(parseVoiceCommand('Infinity voltar do mini player')?.action, 'EXIT_MINI_PLAYER');

  // "play" isolado e "voltar 10" continuam funcionando normalmente
  assert.equal(parseVoiceCommand('Infinity play')?.action, 'PLAY');
  assert.equal(parseVoiceCommand('Infinity dar play')?.action, 'PLAY');
  assert.equal(parseVoiceCommand('Infinity voltar 10')?.action, 'SEEK_REWIND');

  const root = path.resolve(__dirname, '..');
  const skinSrc = fs.readFileSync(path.join(root, 'src/components/NetflixPlayerSkin.tsx'), 'utf8');
  const modalSrc = fs.readFileSync(path.join(root, 'src/components/VideoPlayerModal.tsx'), 'utf8');
  assert.match(skinSrc, /case 'MINI_PLAYER':/);
  assert.match(skinSrc, /case 'EXIT_MINI_PLAYER':/);
  assert.match(modalSrc, /onSetMiniPlayer=\{setMiniPlayerEnabled\}/);
});

test('promotes widescreen -> native browser fullscreen on F, doubleClick or prompt pill without double keydown toggle', () => {
  const root = path.resolve(__dirname, '..');
  const modalSrc = fs.readFileSync(path.join(root, 'src/components/VideoPlayerModal.tsx'), 'utf8');
  const skinSrc = fs.readFileSync(path.join(root, 'src/components/NetflixPlayerSkin.tsx'), 'utf8');

  // Impede disparo duplicado da tecla F/S/N entre VideoPlayerModal e NetflixPlayerSkin
  assert.match(modalSrc, /const handleKeyDown = \(e: KeyboardEvent\) => \{\s*if \(e\.defaultPrevented\) return;/);
  // Propaga fallback de tela cheia nativa bloqueada sem gesto do usuário
  assert.match(modalSrc, /setNativeFsPending\(!nativeActive\)/);
  assert.match(modalSrc, /needsNativeFullscreenPrompt=\{nativeFsPending && isExpanded && !isFullscreen/);
  // Skin promove para tela cheia real do navegador em F, doubleClick ou clique no aviso
  assert.match(skinSrc, /if \(needsNativeFullscreenPrompt && onRequestNativeFullscreen\)/);
  assert.match(skinSrc, /Clique aqui ou aperte F para Tela Cheia real/);
});
