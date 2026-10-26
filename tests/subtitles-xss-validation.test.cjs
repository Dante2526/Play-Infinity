/**
 * [relatório #12] Dois bugs de segurança cobertos:
 *
 * 1. XSS em NetflixPlayerSkin.tsx (linha 1718): activeCue (vindo de legendas
 *    externas do SubtitleCat parseadas por parseVtt) era renderizado via
 *    dangerouslySetInnerHTML={{ __html: activeCue }} sem sanitização. O regex
 *    antigo de parseVtt (<\d{2}:\d{2}[^>]*>) só stripava timestamps VTT
 *    <00:00:01.000>, deixando <script>, <img onerror=...>, <i>, <b> etc.
 *    intactos. Qualquer um pode subir uma legenda maliciosa no SubtitleCat
 *    (repositório público) e atingir todos os usuários que a selecionarem.
 *
 * 2. Validação ausente em subtitlesRoutes.ts /api/subtitles: tmdb, type,
 *    season, episode, lang eram só checados como truthy, sem regex. Como
 *    cacheKey vira filename via path.join(CACHE_DIR, cacheKey) e path.join
 *    normaliza '..', lang='../../etc/passwd' escapava CACHE_DIR. Combinado
 *    com fs.writeFileSync(cachePath, vttText) na linha 212, permitia escrita
 *    arbitrária após SubtitleCat retornar legenda válida.
 *
 * Fix: parseVtt extraído para src/utils/vttParser.ts (puro, sem deps
 * React/Firebase) com regex ampliado para /<[^>]+>/g (stripa TODAS as tags).
 * NetflixPlayerSkin agora renderiza activeCue como texto puro (React escapa
 * automaticamente). Validação extraída para server/utils/subtitleValidation.ts
 * com regex estrito por campo + defense-in-depth (path.resolve check).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function loadModuleFromBundle(stdoutContents, filename) {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(stdoutContents, filename);
  return compiled.exports;
}

async function loadVttParser() {
  const output = await esbuild.build({
    stdin: { contents: "export {parseVtt, VttCue} from './src/utils/vttParser';", resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  return loadModuleFromBundle(output.outputFiles[0].text, path.join(root, 'tests/virtual-vtt-parser.cjs'));
}

async function loadSubtitleValidation() {
  const output = await esbuild.build({
    stdin: { contents: "export {validateSubtitleParams} from './server/utils/subtitleValidation';", resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  return loadModuleFromBundle(output.outputFiles[0].text, path.join(root, 'tests/virtual-subtitle-validation.cjs'));
}

// ============================================================
// Testes funcionais: parseVtt stripa TODAS as tags HTML
// ============================================================

test('parseVtt stripa <script>...</script> do texto do cue', async () => {
  const { parseVtt } = await loadVttParser();
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<script>alert(1)</script>visible text';
  const cues = parseVtt(vtt);
  assert.equal(cues.length, 1, 'deve ter 1 cue');
  assert.equal(cues[0].text, 'alert(1)visible text', 'tags <script> removidas, conteúdo interno preservado como texto');
  assert.ok(!cues[0].text.includes('<script>'), 'nao pode conter literal <script>');
  assert.ok(!cues[0].text.includes('</script>'), 'nao pode conter literal </script>');
});

test('parseVtt stripa <img onerror=alert(1)> (vetor XSS clássico)', async () => {
  const { parseVtt } = await loadVttParser();
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<img src=x onerror=alert(1)>visible';
  const cues = parseVtt(vtt);
  assert.equal(cues[0].text, 'visible', 'tag <img> removida');
  assert.ok(!cues[0].text.includes('<img'), 'nao pode conter <img');
  assert.ok(!cues[0].text.includes('onerror'), 'nao pode conter onerror');
});

test('parseVtt stripa <iframe srcdoc=...> (outro vetor XSS)', async () => {
  const { parseVtt } = await loadVttParser();
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<iframe srcdoc="<script>alert(1)</script>">text</iframe>';
  const cues = parseVtt(vtt);
  assert.ok(!cues[0].text.includes('<iframe'), 'iframe removido');
  assert.ok(!cues[0].text.includes('srcdoc'), 'srcdoc removido');
});

test('parseVtt stripa tags de formatação VTT <i>, <b>, <u>', async () => {
  const { parseVtt } = await loadVttParser();
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<i>italic</i> <b>bold</b> <u>underline</u>';
  const cues = parseVtt(vtt);
  assert.equal(cues[0].text, 'italic bold underline', 'tags de formatação removidas, texto preservado');
});

test('parseVtt stripa tags de timestamp VTT <00:00:01.500> (regex antigo)', async () => {
  const { parseVtt } = await loadVttParser();
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<00:00:01.500>synced text';
  const cues = parseVtt(vtt);
  assert.equal(cues[0].text, 'synced text', 'timestamp VTT interno removido');
});

test('parseVtt preserva texto sem < > (sem falsos positivos)', async () => {
  const { parseVtt } = await loadVttParser();
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nplain text no tags at all';
  const cues = parseVtt(vtt);
  assert.equal(cues[0].text, 'plain text no tags at all', 'texto puro preservado');
});

test('parseVtt lida com múltiplas cues e preserva start/end', async () => {
  const { parseVtt } = await loadVttParser();
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\ncue 1\n\n00:00:02.500 --> 00:00:03.500\ncue 2';
  const cues = parseVtt(vtt);
  assert.equal(cues.length, 2, '2 cues parseadas');
  assert.equal(cues[0].start, 1, 'start cue 1 = 1s');
  assert.equal(cues[0].end, 2, 'end cue 1 = 2s');
  assert.equal(cues[0].text, 'cue 1');
  assert.equal(cues[1].start, 2.5, 'start cue 2 = 2.5s');
  assert.equal(cues[1].text, 'cue 2');
});

test('parseVtt rejeita bloco sem --> (não é cue válido)', async () => {
  const { parseVtt } = await loadVttParser();
  const vtt = 'WEBVTT\n\nNOTE this is a comment\n\n00:00:01.000 --> 00:00:02.000\nreal cue';
  const cues = parseVtt(vtt);
  assert.equal(cues.length, 1, 'NOTE block não vira cue');
  assert.equal(cues[0].text, 'real cue');
});

// ============================================================
// Testes funcionais: validateSubtitleParams (validação estrita)
// ============================================================

test('validateSubtitleParams aceita movie + tmdb numérico + lang pt', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '123', type: 'movie', lang: 'pt' });
  assert.equal(r.ok, true);
  assert.equal(r.params.tmdbId, '123');
  assert.equal(r.params.mediaType, 'movie');
  assert.equal(r.params.season, '1', 'default season');
  assert.equal(r.params.episode, '1', 'default episode');
  assert.equal(r.params.lang, 'pt');
});

test('validateSubtitleParams aceita tv com season/episode explícitos + lang pt-BR', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '123', type: 'tv', season: '2', episode: '5', lang: 'pt-BR' });
  assert.equal(r.ok, true);
  assert.equal(r.params.mediaType, 'tv');
  assert.equal(r.params.season, '2');
  assert.equal(r.params.episode, '5');
  assert.equal(r.params.lang, 'pt-BR');
});

test('validateSubtitleParams REJEITA path traversal em tmdb (../../etc/passwd)', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '../../etc/passwd', type: 'movie', lang: 'pt' });
  assert.equal(r.ok, false);
  assert.match(r.error, /tmdb/);
});

test('validateSubtitleParams REJEITA path traversal em lang (../../etc/passwd)', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '123', type: 'movie', lang: '../../etc/passwd' });
  assert.equal(r.ok, false);
  assert.match(r.error, /lang/);
});

test('validateSubtitleParams REJEITA type diferente de movie/tv', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '123', type: 'evil', lang: 'pt' });
  assert.equal(r.ok, false);
  assert.match(r.error, /type/);
});

test('validateSubtitleParams REJEITA season não-numérico', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '123', type: 'tv', season: 'abc', lang: 'pt' });
  assert.equal(r.ok, false);
  assert.match(r.error, /season/);
});

test('validateSubtitleParams REJEITA episode com mais de 3 dígitos (path expansion)', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '123', type: 'tv', episode: '12345', lang: 'pt' });
  assert.equal(r.ok, false);
  assert.match(r.error, /episode/);
});

test('validateSubtitleParams REJEITA lang com extensão .vtt (filename collision)', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '123', type: 'movie', lang: 'pt.vtt' });
  assert.equal(r.ok, false);
  assert.match(r.error, /lang/);
});

test('validateSubtitleParams REJEITA lang com subtag muito longa (es-4199)', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '123', type: 'movie', lang: 'es-4199' });
  assert.equal(r.ok, false);
  assert.match(r.error, /lang/);
});

test('validateSubtitleParams REJEITA campos obrigatórios ausentes', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  assert.equal(validateSubtitleParams({}).ok, false, 'todos ausentes');
  assert.equal(validateSubtitleParams({ type: 'movie', lang: 'pt' }).ok, false, 'tmdb ausente');
  assert.equal(validateSubtitleParams({ tmdb: '1', lang: 'pt' }).ok, false, 'type ausente');
  assert.equal(validateSubtitleParams({ tmdb: '1', type: 'movie' }).ok, false, 'lang ausente');
});

test('validateSubtitleParams aceita tmdb com até 10 dígitos', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '1234567890', type: 'movie', lang: 'en' });
  assert.equal(r.ok, true);
});

test('validateSubtitleParams REJEITA tmdb com 11+ dígitos', async () => {
  const { validateSubtitleParams } = await loadSubtitleValidation();
  const r = validateSubtitleParams({ tmdb: '12345678901', type: 'movie', lang: 'en' });
  assert.equal(r.ok, false);
});

// ============================================================
// Source guards: garante que os fixes não regrediram
// ============================================================

test('guarda de fonte: NetflixPlayerSkin NAO usa dangerouslySetInnerHTML', () => {
  const src = read('src/components/NetflixPlayerSkin.tsx');
  assert.ok(!src.includes('dangerouslySetInnerHTML'),
    'NetflixPlayerSkin nao pode usar dangerouslySetInnerHTML (XSS via activeCue)');
});

test('guarda de fonte: NetflixPlayerSkin renderiza activeCue como texto puro', () => {
  const src = read('src/components/NetflixPlayerSkin.tsx');
  assert.ok(src.includes('{activeCue}'),
    'NetflixPlayerSkin deve renderizar {activeCue} como texto puro (React escapa < >)');
});

test('guarda de fonte: NetflixPlayerSkin importa parseVtt de vttParser (nao define local)', () => {
  const src = read('src/components/NetflixPlayerSkin.tsx');
  assert.ok(/from\s+['"]\.\.\/utils\/vttParser['"]/.test(src),
    'NetflixPlayerSkin deve importar parseVtt de utils/vttParser');
  const withoutComments = src.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '');
  assert.ok(!/^\s*function\s+parseVtt\b/m.test(withoutComments),
    'parseVtt nao deve ser definida localmente em NetflixPlayerSkin');
  assert.ok(!/^\s*function\s+timeToSeconds\b/m.test(withoutComments),
    'timeToSeconds nao deve ser definida localmente');
  assert.ok(!/^\s*interface\s+VttCue\b/m.test(withoutComments),
    'VttCue interface nao deve ser definida localmente');
});

test('guarda de fonte: vttParser.ts exporta parseVtt com regex que stripa TODAS as tags', () => {
  const src = read('src/utils/vttParser.ts');
  assert.ok(/export\s+function\s+parseVtt\b/.test(src),
    'parseVtt deve ser export function');
  assert.ok(src.includes('replace(/<[^>]+>/g'),
    'parseVtt deve usar replace(/<[^>]+>/g) para stripar TODAS as tags HTML');
  // Strip comments antes de checar pelo regex antigo — ele pode aparecer
  // apenas como referência documentacional no comentário do bug original.
  const withoutComments = src.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '').replace(/^\s*\/\*[\s\S]*?\*\//g, '');
  assert.ok(!withoutComments.includes('<\\d{2}:\\d{2}[^>]*>'),
    'regex antigo que so stripava timestamps VTT e proibido no codigo ativo (deixa <script>, <img> passar)');
});

test('guarda de fonte: subtitlesRoutes usa validateSubtitleParams', () => {
  const src = read('server/routes/subtitlesRoutes.ts');
  assert.ok(/from\s+['"]\.\.\/utils\/subtitleValidation['"]/.test(src),
    'subtitlesRoutes deve importar validateSubtitleParams');
  assert.ok(src.includes('validateSubtitleParams('),
    'subtitlesRoutes deve chamar validateSubtitleParams');
});

test('guarda de fonte: subtitlesRoutes tem defense in depth (path.resolve check)', () => {
  const src = read('server/routes/subtitlesRoutes.ts');
  assert.ok(src.includes('path.resolve(cachePath)'),
    'subtitlesRoutes deve verificar path.resolve(cachePath) apos path.join (defense in depth)');
  assert.ok(src.includes('resolvedCacheDir + path.sep'),
    'verificacao deve usar path.sep como separador (cross-platform safe)');
});

test('guarda de fonte: subtitlesRoutes NAO usa String() cru em tmdb/type/season/episode/lang', () => {
  const src = read('server/routes/subtitlesRoutes.ts');
  // Os String() crus eram a fonte do path traversal. Após o fix, todos os
  // campos passam por validateSubtitleParams (que aplica regex estrito).
  assert.ok(!src.includes('String(tmdb)'),
    'String(tmdb) cru proibido — deve passar por validateSubtitleParams');
  assert.ok(!src.includes('String(type)'),
    'String(type) cru proibido');
  assert.ok(!src.includes('String(season)'),
    'String(season) cru proibido');
  assert.ok(!src.includes('String(episode)'),
    'String(episode) cru proibido');
});

test('guarda de fonte: subtitleValidation.ts tem regex estrito para cada campo', () => {
  const src = read('server/utils/subtitleValidation.ts');
  assert.ok(/export\s+function\s+validateSubtitleParams\b/.test(src));
  // Cada campo deve ter sua regex de validação
  assert.ok(/\\d\{1,10\}/.test(src), 'regex de tmdb deve exigir 1-10 digitos');
  assert.ok(src.includes('mediaType !== "movie"') && src.includes('mediaType !== "tv"'),
    'type deve ser validado como enum movie|tv');
  assert.ok(/\\d\{1,3\}/.test(src), 'regex de season/episode deve exigir 1-3 digitos');
  assert.ok(/\[a-zA-Z\]\{2\}/.test(src), 'lang deve ter regex que exige 2 letras iniciais');
});
