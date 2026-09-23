/**
 * Validação pré-build do catálogo encontrei.me
 * Falha o build se movies.length === 0 || episodes.length === 0
 * para evitar sobrescritas acidentais do arquivo public/data/encontrei-catalog.json.
 */
const fs = require('fs');
const path = require('path');

const catalogPath = path.join(process.cwd(), 'public', 'data', 'encontrei-catalog.json');

if (!fs.existsSync(catalogPath)) {
  console.error(`❌ ERRO NO BUILD: Catálogo não encontrado em ${catalogPath}`);
  process.exit(1);
}

try {
  const content = fs.readFileSync(catalogPath, 'utf-8');
  const data = JSON.parse(content);

  const moviesCount = Array.isArray(data.movies) ? data.movies.length : 0;
  const episodesCount = Array.isArray(data.episodes) ? data.episodes.length : 0;

  if (moviesCount === 0 || episodesCount === 0) {
    console.error(
      `❌ ERRO NO BUILD: public/data/encontrei-catalog.json está vazio ou incompleto!\n` +
      `   - Filmes encontrados: ${moviesCount}\n` +
      `   - Episódios encontrados: ${episodesCount}\n` +
      `O build foi abortado para impedir a publicação de um catálogo vazio.`
    );
    process.exit(1);
  }

  console.log(`✅ Catálogo validado com sucesso: ${moviesCount.toLocaleString('pt-BR')} filmes, ${episodesCount.toLocaleString('pt-BR')} episódios.`);
  process.exit(0);
} catch (err) {
  console.error('❌ ERRO NO BUILD: Falha ao ler ou analisar public/data/encontrei-catalog.json:', err.message);
  process.exit(1);
}
