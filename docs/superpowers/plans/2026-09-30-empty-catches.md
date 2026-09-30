# Substituição de Empty Catches em Massa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Substituir todos os blocos `catch(e) {}`, `catch(_) {}` e `catch {}` vazios por `catch(e) { console.warn("Silenced error:", e); }` em todo o diretório `src/`.
**Architecture:** Substituição em massa via script Node.js com Regex ou AST para garantir que não vamos perder rastreamento de falhas.
**Tech Stack:** Node.js (Script local).

## Global Constraints
- Nenhuma alteração lógica deve ser feita além da inserção do `console.warn`.
- Todos os arquivos TypeScript/TSX em `src/` devem ser verificados.

---

### Task 1: Criar Script de Substituição

**Files:**
- Create: `scratch/fix_catches.mjs`

- [ ] **Step 1: Escrever script Node.js para substituição usando Regex**
O script deve ler iterativamente cada arquivo em `src/` e aplicar:
`content.replace(/catch\s*\(\s*[^)]*\s*\)\s*\{\s*\}/g, 'catch(e){console.warn("Silenced error:", e);}')`
e também para `catch {}`:
`content.replace(/catch\s*\{\s*\}/g, 'catch(e){console.warn("Silenced error:", e);}')`

### Task 2: Executar e Verificar

- [ ] **Step 1: Rodar o script**
Run: `node scratch/fix_catches.mjs`
- [ ] **Step 2: Verificar o build**
Run: `npm run lint; npx tsc --noEmit`
Expected: PASS
