const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const Module = require('node:module');

async function compileEncontreiHelpers() {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: {
      contents: `export {
        encSlugMatchesTitle,
        parseVideoboxSearchLinks,
        isEncontreiHtmlChallenge,
        pickMixdrop
      } from './server/routes/encontreiLookup.ts';`,
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false
  });

  const filename = path.join(root, 'tests/virtual-encontrei-helpers.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

test('encSlugMatchesTitle matches VisionQuest against hyphenated and unhyphenated slugs', async () => {
  const { encSlugMatchesTitle } = await compileEncontreiHelpers();
  assert.equal(encSlugMatchesTitle('visionquest-dublado', 'VisionQuest'), true);
  assert.equal(encSlugMatchesTitle('vision-quest-dublado', 'VisionQuest'), true);
  assert.equal(encSlugMatchesTitle('visionquest-dublado', 'Vision Quest'), true);
  assert.equal(encSlugMatchesTitle('carrie-a-estranha-dublado', 'Carrie'), true);
  assert.equal(encSlugMatchesTitle('the-witcher-dublado', 'VisionQuest'), false);
});

test('parseVideoboxSearchLinks extracts unique series and movie ids from buscarContent html', async () => {
  const { parseVideoboxSearchLinks } = await compileEncontreiHelpers();
  const sampleHtml = `
    <a href="https://www.vizer.food/series/online/visionquest-dublado-84307/">VisionQuest</a>
    <a href="/series/online/visionquest-dublado-84307/">Duplicado</a>
    <a href="https://www.vizer.food/series/online/carrie-a-estranha-dublado-82940/">Carrie</a>
    <a href="https://www.vizer.food/filmes/online/sobrenatural-agora-entre-nos-dublado-78472/">Sobrenatural</a>
  `;
  assert.deepEqual(parseVideoboxSearchLinks(sampleHtml, 'series'), [
    { slug: 'visionquest-dublado', id: 84307 },
    { slug: 'carrie-a-estranha-dublado', id: 82940 }
  ]);
  assert.deepEqual(parseVideoboxSearchLinks(sampleHtml, 'movies'), [
    { slug: 'sobrenatural-agora-entre-nos-dublado', id: 78472 }
  ]);
});

test('isEncontreiHtmlChallenge detects Discord wcchallenge page without affecting JSON APIs', async () => {
  const { isEncontreiHtmlChallenge } = await compileEncontreiHelpers();
  assert.equal(
    isEncontreiHtmlChallenge(`<body data-pageController='wcchallenge'><a id="dcgSkip" href="?discordSkip=1">Recusar (60s)</a></body>`),
    true
  );
  assert.equal(isEncontreiHtmlChallenge(`<title>Entre no nosso Discord - ETV</title>`), true);
  assert.equal(isEncontreiHtmlChallenge(`<a href="/series/online/visionquest-dublado-84307/">OK</a>`), false);
});

test('pickMixdrop strictly prioritizes PT-BR servers_dub over servers_leg and extracts byse', async () => {
  const { pickMixdrop } = await compileEncontreiHelpers();
  const res = pickMixdrop({
    servers_dub: 'mixdrop=nll00rlqtlw469&amp;streamtape=kLepWOKQ8ptOVQb&amp;byse=d2klzroxhaww&amp;doodstream=82rlxmh1zash',
    servers_leg: 'mixdrop=r66wgq7vhlxvxn&streamtape=v2KKMr6Ybyi41me&byse=kulb8irj41ci'
  });
  assert.deepEqual(res, {
    mixdrop: 'nll00rlqtlw469',
    streamtape: 'kLepWOKQ8ptOVQb',
    doodstream: '82rlxmh1zash',
    byse: 'd2klzroxhaww',
    audio: 'Dublado'
  });

  // Nunca mistura mixdrop legendado quando streamtape/byse dublado existe
  const dubPartial = pickMixdrop({
    servers_dub: 'streamtape=onlyDubStape&byse=onlyDubByse',
    servers_leg: 'mixdrop=legMix'
  });
  assert.equal(dubPartial?.audio, 'Dublado');
  assert.equal(dubPartial?.mixdrop, '');
  assert.equal(dubPartial?.byse, 'onlyDubByse');
  assert.equal(dubPartial?.streamtape, 'onlyDubStape');

  // Fallback para legendado somente se servers_dub estiver vazio
  const legOnly = pickMixdrop({
    servers_dub: '',
    servers_leg: 'mixdrop=legMix&byse=legByse'
  });
  assert.deepEqual(legOnly, {
    mixdrop: 'legMix',
    streamtape: null,
    doodstream: null,
    byse: 'legByse',
    audio: 'Legendado'
  });
});

test('playback-candidates checks catalogue hosters explicitly (not Saimo alone) and grants > 800ms discovery window', () => {
  const root = path.resolve(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'server/routes/playbackHealth.ts'), 'utf8');
  assert.match(src, /srv_byse.*srv_mixdrop.*srv_streamtape/);
  assert.doesNotMatch(src, /new Promise<any\[\]>\(r=>\{timer=setTimeout\(\(\)=>r\(\[\]\),800\)\}\)/);
});
