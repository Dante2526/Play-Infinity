const { test } = require('node:test');
const assert = require('node:assert/strict');
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
