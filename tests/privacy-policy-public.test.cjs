const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Iniciando testes de Política de Privacidade Pública...\n');

// 1. Validar que o arquivo estático público existe
console.log('Test 1: Verificando existência de public/privacidade.html...');
const publicHtmlPath = path.join(__dirname, '..', 'public', 'privacidade.html');
assert.ok(fs.existsSync(publicHtmlPath), 'public/privacidade.html deve existir para servir crawlers sem JS');
const htmlContent = fs.readFileSync(publicHtmlPath, 'utf8');
assert.ok(htmlContent.includes('Política de Privacidade'), 'HTML deve conter título da Política de Privacidade');
assert.ok(htmlContent.toLowerCase().includes('informações que coletamos'), 'HTML deve conter seções da política');
assert.ok(!htmlContent.includes('Entrar com sua conta'), 'HTML público não deve exigir login');
console.log('✓ Test 1 aprovado: public/privacidade.html é válido e público.\n');

// 2. Validar que App.tsx não bloqueia deslogados na rota de privacidade
console.log('Test 2: Verificando liberação de acesso sem login no App.tsx...');
const appTsxPath = path.join(__dirname, '..', 'src', 'App.tsx');
const appContent = fs.readFileSync(appTsxPath, 'utf8');

// Verifica se a trava de login exclui a rota 'privacy'
assert.ok(
  appContent.includes("viewState.type !== 'privacy'"),
  'App.tsx deve permitir viewState.type === "privacy" sem exigir currentUser'
);
assert.ok(
  appContent.includes("/PRIVACIDADE") || appContent.includes("/POLITICA"),
  'App.tsx deve reconhecer rotas /privacidade e /politica-de-privacidade'
);
console.log('✓ Test 2 aprovado: App.tsx libera visualização deslogada da Política de Privacidade.\n');

// 3. Validar rotas registradas em server.ts
console.log('Test 3: Verificando rotas no server.ts...');
const serverPath = path.join(__dirname, '..', 'server.ts');
const serverContent = fs.readFileSync(serverPath, 'utf8');
assert.ok(
  serverContent.includes('"/privacidade"') && serverContent.includes('"/politica-de-privacidade"'),
  'server.ts deve ter rotas explícitas para /privacidade e /politica-de-privacidade'
);
console.log('✓ Test 3 aprovado: server.ts possui rotas configuradas.\n');

// 4. Validar link de privacidade no AuthModal.tsx
console.log('Test 4: Verificando link de privacidade no AuthModal.tsx...');
const authModalPath = path.join(__dirname, '..', 'src', 'components', 'AuthModal.tsx');
const authContent = fs.readFileSync(authModalPath, 'utf8');
assert.ok(
  authContent.includes('privacidade') || authContent.includes('Política de Privacidade') || authContent.includes('/privacidade'),
  'AuthModal.tsx deve conter link para Política de Privacidade no rodapé'
);
console.log('✓ Test 4 aprovado: AuthModal possui link para política.\n');

console.log('🎉 TODOS OS TESTES DE POLÍTICA DE PRIVACIDADE PÚBLICA FORAM APROVADOS!');
