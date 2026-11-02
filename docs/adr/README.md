# ADRs — Architecture Decision Records

Decisões de arquitetura do Play Infinity. Cada ADR registra **por que** uma
decisão foi tomada, para que sessões/agentes futuros não refaçam a análise do
zero nem cheguem a conclusões opostas sem conhecer o contexto.

## Index

| ADR | Título | Status | Data |
|-----|--------|--------|------|
| [0001](0001-saimo-hls-first.md) | Saimo VOD: HLS com ABR como padrão, MP4 como Turbo/fallback | Accepted | 2026-11-02 |
| [0002](0002-allowlist-vs-blacklist.md) | Hierarquia allowlist vs blacklist de domínios | Accepted | 2026-11-02 |
| [0003](0003-production-smoke-tests.md) | Smoke tests de produção para integrações de streaming | Accepted | 2026-11-02 |

## Como escrever um novo ADR

1. Copie `_template.md`.
2. Numere sequencialmente (`0004-...`).
3. **Contexto**: o problema que forçou a decisão, com números quando houver.
4. **Decisão**: o que foi decidido e POR QUÊ (alternativas descartadas e o
   motivo do descarte — é a parte que mais economiza tempo de sessões futuras).
5. **Consequências**: o que fica pior/melhor, e gatilhos para revisitar.
6. Adicione a linha no index acima.

Regra de ouro: se uma decisão levou mais de 30 minutos de análise ou reverteu
uma decisão anterior, ela MERECE um ADR.
