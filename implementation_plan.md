# Plano de Implementação: Campos de Anotações e Descontos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um campo expansível para anotações/comentários de usuários e opções de desconto (fixo e único) na mensalidade no painel administrativo.

**Architecture:** A interface será atualizada no `AdminPage.tsx` estendendo a interface `ClientUser` e adicionando os campos na UI de edição e listagem de usuários. As informações serão gravadas no Firestore (`usuarios` e `users`).

**Tech Stack:** React, Tailwind CSS, Firebase Firestore.

## Global Constraints
- Manter o padrão visual escuro, com estilos tailwind e ícones lucide-react (design muito bem feito).
- Utilizar a sintaxe de estado e manipulação do Firebase/Firestore existente.

---

### Task 1: Atualizar a Interface de Tipagem `ClientUser`

**Files:**
- Modify: `c:/Users/nayla/.antigravity/Play-Infinity/src/pages/AdminPage.tsx`

**Interfaces:**
- Adiciona campos opcionais ao tipo de dados lido do banco de dados para garantir o *IntelliSense* do TypeScript.

- [ ] **Step 1: Modificar `ClientUser` no topo do arquivo**
Localize a interface `ClientUser` e adicione as propriedades:
```typescript
  notes?: string;
  fixedDiscount?: number;
  oneTimeDiscount?: number;
```

---

### Task 2: Adicionar Estados e Lógica de Edição

**Files:**
- Modify: `c:/Users/nayla/.antigravity/Play-Infinity/src/pages/AdminPage.tsx`

**Interfaces:**
- Variáveis de estado serão adicionadas para suportar os novos campos durante a ação de "Editar" do modal existente.

- [ ] **Step 1: Criar estados de edição**
Localize as variáveis de estado do bloco de edição (ex: `editName`, `editEmail`) e adicione:
```tsx
  const [editNotes, setEditNotes] = useState("");
  const [editFixedDiscount, setEditFixedDiscount] = useState<number>(0);
  const [editOneTimeDiscount, setEditOneTimeDiscount] = useState<number>(0);
```

- [ ] **Step 2: Preencher estados ao iniciar a edição (`handleEditUser`)**
Atualize a função `handleEditUser(user: ClientUser)` para carregar os novos campos:
```tsx
    setEditNotes(user.notes || "");
    setEditFixedDiscount(user.fixedDiscount || 0);
    setEditOneTimeDiscount(user.oneTimeDiscount || 0);
```

- [ ] **Step 3: Salvar alterações no banco de dados (`handleSaveEdit`)**
No corpo de `handleSaveEdit`, adicione as novas propriedades ao objeto `updates`:
```typescript
      updates.notes = editNotes;
      updates.fixedDiscount = editFixedDiscount;
      updates.oneTimeDiscount = editOneTimeDiscount;
```

---

### Task 4: Atualizar Modal de Edição com os Novos Campos

**Files:**
- Modify: `c:/Users/nayla/.antigravity/Play-Infinity/src/pages/AdminPage.tsx`

**Interfaces:**
- Atualizar JSX do Modal de Edição para ter os campos *textarea* de notas e *inputs* numéricos de desconto.

- [ ] **Step 1: Campo de Comentários**
Adicione o `textarea` de comentários no form de edição:
```tsx
<div>
  <label className="block text-white/70 text-sm font-medium mb-2">Comentários / Notas</label>
  <textarea
    value={editNotes}
    onChange={(e) => setEditNotes(e.target.value)}
    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white resize-none h-24"
    placeholder="Anotações internas sobre este cliente..."
  />
</div>
```

- [ ] **Step 2: Campos de Desconto**
Caso o plano seja "MENSAL", permita definir os descontos.
```tsx
{editAccessType === "mensal" && (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <label className="block text-white/70 text-sm font-medium mb-2">Desconto Fixo (R$)</label>
      <input
        type="number"
        value={editFixedDiscount}
        onChange={(e) => setEditFixedDiscount(Number(e.target.value))}
        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white"
        min="0"
        step="0.01"
      />
    </div>
    <div>
      <label className="block text-white/70 text-sm font-medium mb-2">Desconto Único (R$)</label>
      <input
        type="number"
        value={editOneTimeDiscount}
        onChange={(e) => setEditOneTimeDiscount(Number(e.target.value))}
        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white"
        min="0"
        step="0.01"
      />
    </div>
  </div>
)}
```

---

### Task 5: Atualizar a UI do Card de Usuário (Anotações Expansíveis)

**Files:**
- Modify: `c:/Users/nayla/.antigravity/Play-Infinity/src/pages/AdminPage.tsx`

**Interfaces:**
- Alterar o trecho de renderização do card do usuário para comportar as anotações.

- [ ] **Step 1: Estado para controlar a expansão das notas do usuário**
Em nível de componente principal, adicione:
```tsx
  const [expandedNotesId, setExpandedNotesId] = useState<string | null>(null);
```

- [ ] **Step 2: Renderizar botão e conteúdo expansível**
No mapeamento de usuários `usersList.map((user) => ...)`:
Adicione um botão para "Anotações" que ativa a visualização e um bloco expansível condicionado a `expandedNotesId === user.id`.

```tsx
{/* Botão para notas (caso exista) */}
{user.notes && (
  <button 
    onClick={() => setExpandedNotesId(expandedNotesId === user.id ? null : user.id)}
    className="ml-2 px-3 py-1 bg-white/5 hover:bg-white/10 rounded-full text-xs text-white/70 transition-colors"
  >
    {expandedNotesId === user.id ? 'Esconder Notas' : 'Ver Notas'}
  </button>
)}

{/* Bloco expansível de notas */}
{expandedNotesId === user.id && user.notes && (
  <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/5 text-sm text-white/80 whitespace-pre-wrap animate-fade-in transition-all">
    {user.notes}
  </div>
)}
```
