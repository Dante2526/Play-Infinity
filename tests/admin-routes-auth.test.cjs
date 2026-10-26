/**
 * Guarda de regressão: rotas /api/admin/* exigem autenticação.
 *
 * Contexto (relatório #7, ALTO na prática): o iptvRouter define
 * /api/admin/iptv-streams e /api/admin/probe-channel, mas era montado em
 * server.ts ANTES de app.use("/api/admin", requireAdminAuth). O Express
 * resolve middlewares em ordem de registro — as rotas respondiam ANTES do
 * auth rodar, ficando públicas (verificado empiricamente em produção:
 * HTTP 200 sem token, e o probe servia de SSRF cego para a rede interna).
 *
 * Fix: requireAdminAuth movido para antes do iptvRouter.
 * Este teste valida a ORDEM no fonte de server.ts (a propriedade que
 * garante a proteção — mudar a ordem de volta quebra o teste).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

function indexOfStatement(pattern) {
  const m = serverSrc.match(pattern);
  return m ? m.index : -1;
}

test('requireAdminAuth é montado ANTES do iptvRouter no server.ts (rotas /api/admin/* do iptv ficam protegidas)', () => {
  const authIdx = indexOfStatement(/app\.use\(\s*["']\/api\/admin["']\s*,\s*requireAdminAuth\s*\)/);
  const iptvIdx = indexOfStatement(/app\.use\(\s*iptvRouter\s*\)/);

  assert.notEqual(authIdx, -1, 'server.ts deve montar app.use("/api/admin", requireAdminAuth)');
  assert.notEqual(iptvIdx, -1, 'server.ts deve montar app.use(iptvRouter)');

  assert.ok(
    authIdx < iptvIdx,
    `A proteção /api/admin deve vir ANTES do iptvRouter (auth em ${authIdx}, iptv em ${iptvIdx}). ` +
    'Se voltar para depois, /api/admin/iptv-streams e /api/admin/probe-channel respondem sem autenticação.'
  );
});

test('iptvRouter declara rotas /api/admin/* que precisam da proteção (contrato do teste acima permanece relevante)', () => {
  const iptvSrc = fs.readFileSync(path.join(root, 'server/routes/iptv.ts'), 'utf8');
  assert.match(iptvSrc, /router\.(get|post|all)\(\s*["']\/api\/admin\//,
    'iptv.ts deve declarar ao menos uma rota /api/admin/*');
});

test('AdminLiveChannels usa adminFetch (não fetch puro) nas chamadas a /api/admin/*', () => {
  const compSrc = fs.readFileSync(path.join(root, 'src/components/AdminLiveChannels.tsx'), 'utf8');

  // Nenhum fetch puro para rotas admin
  const plainAdminFetch = compSrc.match(/(?<!admin)fetch\(\s*[`"']\/api\/admin/g);
  assert.equal(plainAdminFetch, null,
    'AdminLiveChannels não deve chamar fetch puro em rotas /api/admin/* (usar adminFetch com token)');

  // E usa adminFetch pelo menos uma vez
  assert.match(compSrc, /import\s*\{\s*adminFetch\s*\}\s*from\s*["']\.\.\/services\/adminApi["']/,
    'import do adminFetch deve existir');
  assert.match(compSrc, /adminFetch\(\s*[`"']\/api\/admin\//,
    'ao menos uma chamada adminFetch para rota /api/admin/* deve existir');
});
