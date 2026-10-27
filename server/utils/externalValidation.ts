/**
 * Validação estrita dos parâmetros da camada de canais externos
 * ("Saimo-style" — catálogo de canais ao vivo em texto puro).
 *
 * Motivação (protocolo de segurança dos relatórios #8/#12):
 *  - Todo valor vindo de req.query precisa passar por regex/formato estrito
 *    ANTES de qualquer uso. Nunca usar String() cru.
 *  - O nome do canal é usado apenas para lookup em memória (nunca em paths de
 *    filesystem), mas a validação impede abusos (path traversal, injeção de
 *    protocolo, control chars) por defesa em profundidade — se uma regressão
 *    futura usar o nome em outro contexto, o valor já chegou sanitizado.
 *
 * Nomes reais que precisam passar (catálogo Saimo + nossos canais):
 *   "Premiere Clubes", "BAND SPORTS HD", "DAZN (Jogo 1)", "CNN Brasil Money",
 *   "Globo SP", "Filmes & Séries", "History 2", "Canal OFF"
 */

export interface ExternalChannelNameValidation {
  ok: boolean;
  value?: string;
  error?: string;
}

export interface ExternalFormatValidation {
  ok: boolean;
  value?: "redirect" | "json";
  error?: string;
}

const NAME_MAX_LENGTH = 80;

/**
 * Letras unicode (inclui acentos), dígitos, espaços e pontuação comum de
 * nomes de canal: & ( ) . - + ' : ,
 */
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &().\-+':,!]*$/u;

export function validateExternalChannelName(raw: unknown): ExternalChannelNameValidation {
  if (typeof raw !== "string") {
    return { ok: false, error: "Parâmetro name é obrigatório (string)." };
  }
  const name = raw.trim();
  if (!name) {
    return { ok: false, error: "Parâmetro name não pode ser vazio." };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Parâmetro name excede o limite de ${NAME_MAX_LENGTH} caracteres.` };
  }
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, error: "Parâmetro name contém caracteres não permitidos." };
  }
  // Defesa em profundidade (redundante com o pattern acima, mas pega regressões
  // silenciosas caso o pattern seja relaxado no futuro):
  if (/[\\/]/.test(name) || name.includes("..") || name.includes("://") || name.includes("%") || name.includes("<") || name.includes(">")) {
    return { ok: false, error: "Parâmetro name contém sequências proibidas." };
  }
  return { ok: true, value: name };
}

/**
 * format é opcional: ausente → "redirect" (comportamento padrão, compatível
 * com o LivePlayerModal e o Sentinela que esperam playlist .m3u8 via 302).
 * O único valor explícito aceito é "json".
 */
export function validateExternalFormatParam(raw: unknown): ExternalFormatValidation {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: "redirect" };
  }
  if (raw === "json") {
    return { ok: true, value: "json" };
  }
  return { ok: false, error: "Parâmetro format inválido (único valor aceito: json)." };
}
