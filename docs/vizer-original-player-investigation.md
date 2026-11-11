# Vizer original — investigação encerrada em 11/11/2026

O endereço informado pelo dono, `https://vizer.best/filmes/outra-mamae`, usa FSHD/Abyss (TMDB 1400837), sem FsPlay para esse filme. A integração existente suporta FsPlay; falhar nessa resolução não comprova que o filme esteja offline no site do provedor.

O protótipo Abyss reproduziu pela CDN com skin própria, mas a mídia exige Referer do Abyss: acesso direto do nosso domínio respondeu 403. A alternativa testada retransmitia vídeo pela VPS. Foi investigado serviço de borda para retirar esse tráfego da VPS, mas o dono decidiu abandonar o novo servidor em 11/11/2026 devido à complexidade.

Removidos serviço, rota de retransmissão, tratamento no health, smoke e testes específicos do protótipo. Nenhum Worker foi implementado ou publicado. O protótipo nunca foi commitado, enviado ao GitHub ou implantado.

Em seguida, o dono pediu a remoção também do Vizer HD/FsPlay. Removidos seletor/skin, startup/fallback/health, router e proxies de reprodução, import/mount no servidor e testes específicos do player. A chave srv_vizer também deixa de ser aceita em novos bloqueios no admin. Teste de próximo episódio independente preservado em player-integration.test.cjs.

O catálogo Vizer permanece intacto, fornecendo arquivos para MixDrop, StreamTape e BYSE. Mantida melhoria independente do admin: Saimo Play HD, Saimo Turbo e AnimesDigital em servidores ignorados, com whitelist compartilhada e testes de persistência temporária.

Após a remoção completa: TypeScript e 57 testes direcionados aprovados, incluindo os testes do catálogo Vizer. Graphify e referências textuais consultados. Nenhuma referência ativa srv_vizer ou às rotas retiradas em src/server/servidor principal; sobram testes que garantem rejeição da chave removida. Sem commit/push/deploy.
