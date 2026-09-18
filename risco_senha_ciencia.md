# Registro de Ciência de Risco de Segurança

**Data:** 18 de setembro de 2026
**Componente:** Painel de Administração (`AdminPage.tsx`)

## Descrição da Vulnerabilidade
O sistema atualmente realiza a autenticação do painel de administração validando senhas em texto plano por meio de consultas diretas no lado do cliente (Client-Side SDK) contra o Firebase Firestore:

```typescript
const q = query(
  collection(db, "administradores"),
  where("email", "==", email),
  where("senha", "==", password)
);
```

### Riscos Associados
1. Para que o login funcione desta maneira, as regras de segurança do Firestore (`firestore.rules`) precisam obrigatoriamente permitir operações de leitura.
2. Essa abertura permite que qualquer pessoa com conhecimento técnico utilize o SDK do Firebase ou manipule requisições HTTP para obter a lista completa de administradores, incluindo seus e-mails e **senhas expostas**, que não utilizam hashes criptográficos.
3. O uso do Firebase Auth deveria ser a solução padrão e isolada para o controle de acesso de rotas sensíveis como esta.

## Parecer e Justificativa do Produto
O desenvolvedor e proprietário do produto (Product Owner) foi alertado em relação a este débito técnico grave. No entanto, o fluxo foi retido **intencionalmente** por ordem direta ("até onde eu lembro eu gosto assim, eu preciso ver as senhas dos usuários, e-mails, pelo menos no começo").

Portanto, registra-se que:
- Há total ciência de que credenciais e dados vitais estão circulando sem criptografia de segurança no banco de dados.
- Modificações arquiteturais de proteção foram temporariamente dispensadas visando um fluxo de visibilidade do produto no curto prazo.
- Uma mitigação contra Bypass da Interface do Usuário (DevTools) foi implementada neste mesmo dia, limitando vetores de ataque em camada front-end sem alterar o mecanismo base de query no Firestore.

**Nota:** É altamente recomendada a revisão desta abordagem em ciclos de release futuros.
