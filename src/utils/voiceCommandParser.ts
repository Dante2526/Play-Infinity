/**
 * Interpretador de comandos de voz em português para o player (Play Infinity).
 * Suporta o wake-word "Infinity" ou comandos diretos.
 */

export type PlayerVoiceAction =
  | 'PLAY'
  | 'PAUSE'
  | 'NEXT_EPISODE'
  | 'SKIP_INTRO'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'MUTE'
  | 'SEEK_FORWARD'
  | 'SEEK_REWIND'
  | 'FULLSCREEN'
  | 'ASPECT_RATIO';

export interface ParsedVoiceCommand {
  action: PlayerVoiceAction;
  label: string;
  matchedText: string;
}

const WAKE_WORD_REGEX = /\b(infinity|infinite|infiniti|infinito|infinit|infinidade|enfinete|infinete)\b/i;
const WAKE_WORD_GLOBAL_REGEX = /\b(infinity|infinite|infiniti|infinito|infinit|infinidade|enfinete|infinete)\b/gi;

export function hasWakeWord(text: string): boolean {
  return WAKE_WORD_REGEX.test(text || '');
}

/**
 * Remove acentuação e pontuação para comparação fonética resiliente.
 */
export function normalizeVoiceText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')   // remove pontuação
    .replace(/\s+/g, ' ')           // normaliza múltiplos espaços
    .trim();
}

/**
 * Quando o wake-word aparece no meio de um segmento contínuo, descarta todo
 * texto anterior ao último wake-word para evitar falsos comandos vindos de
 * diálogos anteriores capturados no mesmo resultado.
 */
export function extractCommandAfterWakeWord(normalizedText: string): string {
  if (!normalizedText) return '';
  let lastMatchEnd = -1;
  WAKE_WORD_GLOBAL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WAKE_WORD_GLOBAL_REGEX.exec(normalizedText)) !== null) {
    lastMatchEnd = match.index + match[0].length;
  }
  if (lastMatchEnd === -1) return normalizedText;
  return normalizedText.slice(lastMatchEnd).trim();
}

interface VoiceCommandRule {
  action: PlayerVoiceAction;
  label: string;
  matches: (normalizedTarget: string) => boolean;
}

const VOICE_COMMAND_RULES: VoiceCommandRule[] = [
  {
    action: 'PAUSE',
    label: 'Pausar reprodução',
    matches: (t) =>
      /\b(pause|pausar|pausa|pare|parar|parar o video|parar video|para o video|para tudo|para ai|para agora|segura|aguarda|espera)\b/.test(t) ||
      t === 'para'
  },
  {
    action: 'PLAY',
    label: 'Continuar reprodução',
    matches: (t) =>
      /\b(play|reproduzir|continuar|continua|continue|despausar|despausa|roda|dar play|da play|de play|voltar a passar|tocar|toca|solta o play|solta)\b/.test(t)
  },
  {
    action: 'NEXT_EPISODE',
    label: 'Próximo episódio',
    matches: (t) =>
      /\b(proximo|proximo episodio|proximo ep|avancar episodio|passar episodio|proxima)\b/.test(t)
  },
  {
    // Avaliado antes de SKIP_INTRO para que "pula 10" / "pula 10 segundos" avance 10s em vez de pular a abertura
    action: 'SEEK_FORWARD',
    label: 'Avançar 10s',
    matches: (t) =>
      /\b(avancar|avanca|avanca 10|avancar 10 segundos|adiantar|adianta|pular 10|pula 10|pular dez|pula dez|pula pra frente|pular pra frente|pular para frente|pula para frente|ir para frente|pra frente)\b/.test(t) ||
      t === '10 segundos' ||
      t === 'dez segundos'
  },
  {
    action: 'SKIP_INTRO',
    label: 'Pular abertura',
    matches: (t) =>
      /\b(pular abertura|pula abertura|pular a abertura|pula a abertura|pular intro|pula intro|skip intro|pular|pula|abertura)\b/.test(t)
  },
  {
    action: 'VOLUME_UP',
    label: 'Volume +10%',
    matches: (t) =>
      /\b(aumentar volume|aumenta o volume|aumenta volume|aumentar o som|aumenta o som|aumentar som|aumenta som|subir volume|sobe o volume|subir som|sobe o som|mais alto|mais volume|volume mais|aumentar|aumenta)\b/.test(t)
  },
  {
    action: 'VOLUME_DOWN',
    label: 'Volume -10%',
    matches: (t) =>
      /\b(diminuir volume|diminui o volume|diminui volume|diminuir o som|diminui o som|diminuir som|diminui som|abaixar volume|abaixa o volume|abaixa volume|abaixar o som|abaixa o som|abaixar som|abaixa som|baixar volume|baixa o volume|baixar som|baixa o som|mais baixo|menos volume|diminuir|abaixar|abaixa)\b/.test(t)
  },
  {
    // Avaliado antes de SEEK_REWIND para "voltar o som" alternar mudo sem voltar 10s
    action: 'MUTE',
    label: 'Silenciar / Mudo',
    matches: (t) =>
      /\b(mudo|mutar|silenciar|silencio|sem som|tirar o som|tira o som|desativar som|cortar o som|desmutar|tirar do mudo|tira do mudo|ativar som|ativa o som|colocar som|coloca o som|voltar o som)\b/.test(t)
  },
  {
    action: 'SEEK_REWIND',
    label: 'Voltar 10s',
    matches: (t) =>
      /\b(voltar 10|volta 10|voltar dez|volta dez|voltar 10 segundos|retroceder|retrocede|recuar|recua|voltar um pouco|volta um pouco|voltar atras|10 segundos atras|repetir cena|voltar|volta)\b/.test(t)
  },
  {
    action: 'FULLSCREEN',
    label: 'Tela cheia',
    matches: (t) =>
      /\b(tela cheia|maximizar|fullscreen|expandir tela|tela inteira|expandir|sair da tela cheia|minimizar|tela normal)\b/.test(t)
  },
  {
    action: 'ASPECT_RATIO',
    label: 'Ajustar proporção da tela',
    matches: (t) =>
      /\b(ajustar tela|ajustar|ajusta tela|esticar|ajuste|proporcao|formato)\b/.test(t)
  }
];

/**
 * Analisa a frase dita e extrai a ação do player correspondente.
 * Se o wake-word "infinity" estiver presente, avalia apenas o trecho posterior a ele.
 */
export function parseVoiceCommand(rawText: string): ParsedVoiceCommand | null {
  const normalized = normalizeVoiceText(rawText);
  if (!normalized) return null;

  const target = extractCommandAfterWakeWord(normalized);
  if (!target) return null;

  for (const rule of VOICE_COMMAND_RULES) {
    if (rule.matches(target)) {
      return { action: rule.action, label: rule.label, matchedText: rawText };
    }
  }

  return null;
}
