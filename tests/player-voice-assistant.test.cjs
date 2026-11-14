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

test('recognizes vocal pitch variations (deep/high/soft) and far-field short PT-BR commands', async () => {
  const { hasWakeWord, parseVoiceCommand, parseBestVoiceAlternative } = await compileParser();

  // Variações de timbre grave, agudo e distante para "Infinity"
  assert.equal(hasWakeWord('infinita pausar'), true);
  assert.equal(parseVoiceCommand('infinita pausar')?.action, 'PAUSE');
  assert.equal(parseVoiceCommand('in finity aumentar volume')?.action, 'VOLUME_UP');
  assert.equal(parseVoiceCommand('finiti pula 10')?.action, 'SEEK_FORWARD');
  assert.equal(parseVoiceCommand('affinity mudo')?.action, 'MUTE');
  assert.equal(parseVoiceCommand('infindo continuar')?.action, 'PLAY');

  // Quase-homófona grave apenas quando seguida de comando válido (não dispara com diálogo solto)
  assert.equal(hasWakeWord('enfim pausar'), true);
  assert.equal(parseVoiceCommand('enfim pausar')?.action, 'PAUSE');
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
});
