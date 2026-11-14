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

const STRICT_WAKE_PATTERN =
  '\\b(infinity|infinite|infiniti|infinit|enfinete|infinete|inffinity|ifinity|ifiniti|efinity|efiniti|afiniti|affinity|finiti|finity|finite|finito|finita|vinity|viniti|piniti|miniti|minity|onfinity|unfiniti|in\\s+finit[yiwue]*|em\\s+finit[yiwue]*|um\\s+finit[yiwue]*)\\b';
const STRICT_WAKE_WORD_REGEX = new RegExp(STRICT_WAKE_PATTERN, 'i');
const STRICT_WAKE_GLOBAL_REGEX = new RegExp(STRICT_WAKE_PATTERN, 'gi');

// Palavras existentes em português ("infinito", "infinita", "infinidade") só acordam
// o assistente quando ditas sozinhas ou seguidas diretamente por um comando curto (<= 4 palavras).
const PT_TRANSLATED_WAKE_REGEX = /\b(infinito|infinita|infinidade)\b/gi;
const PT_ALONE_WAKE_REGEX = /^(?:(?:ei|oi|hey|ok|ola)\s+)?(infinito|infinita|infinidade)$/i;
const MAX_COMMAND_WORDS = 5;

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

function getLastPtWakeMatch(normalized: string): { matched: boolean; afterText: string } {
  PT_TRANSLATED_WAKE_REGEX.lastIndex = 0;
  let lastEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = PT_TRANSLATED_WAKE_REGEX.exec(normalized)) !== null) {
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd === -1) return { matched: false, afterText: '' };
  return { matched: true, afterText: normalized.slice(lastEnd).trim() };
}

function isValidPtWakeAfterText(afterText: string): boolean {
  if (!afterText) return false;
  const wordCount = afterText.split(' ').filter(Boolean).length;
  return wordCount >= 1 && wordCount <= 4 && matchVoiceCommandRules(afterText) !== null;
}

export function hasWakeWord(text: string): boolean {
  const normalized = normalizeVoiceText(text);
  if (!normalized) return false;
  if (STRICT_WAKE_WORD_REGEX.test(normalized)) return true;
  if (PT_ALONE_WAKE_REGEX.test(normalized)) return true;
  const ptMatch = getLastPtWakeMatch(normalized);
  return ptMatch.matched && isValidPtWakeAfterText(ptMatch.afterText);
}

/**
 * Quando o wake-word aparece no meio de um segmento contínuo, descarta todo
 * texto anterior ao último wake-word para evitar falsos comandos vindos de
 * diálogos anteriores capturados no mesmo resultado.
 */
export function extractCommandAfterWakeWord(normalizedText: string): string {
  if (!normalizedText) return '';
  let lastMatchEnd = -1;
  STRICT_WAKE_GLOBAL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STRICT_WAKE_GLOBAL_REGEX.exec(normalizedText)) !== null) {
    lastMatchEnd = match.index + match[0].length;
  }
  if (lastMatchEnd !== -1) {
    return normalizedText.slice(lastMatchEnd).trim();
  }
  if (PT_ALONE_WAKE_REGEX.test(normalizedText)) {
    return '';
  }
  const ptMatch = getLastPtWakeMatch(normalizedText);
  if (ptMatch.matched && isValidPtWakeAfterText(ptMatch.afterText)) {
    return ptMatch.afterText;
  }
  return normalizedText;
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
      /\b(pause|pausar|pausa|pauso|pausado|pare|parar|parar o video|parar video|para o video|para o filme|parar o filme|para tudo|para ai|para agora|da uma pausa|dar uma pausa|faz uma pausa|segura|aguarda|espera)\b/.test(t) ||
      t === 'para'
  },
  {
    action: 'PLAY',
    label: 'Continuar reprodução',
    matches: (t) =>
      /\b(play|reproduzir|continuar|continua|continue|continuando|pode continuar|despausar|despausa|roda|dar play|da play|de play|voltar a passar|volta o filme|volta o video|voltar o video|tocar|toca|solta o play|solta o filme|solta o video|solta)\b/.test(t)
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
      /\b(avancar|avanca|avanca 10|avancar 10 segundos|avanca um pouco|avancar um pouco|adiantar|adianta|pular 10|pula 10|pular dez|pula dez|mais 10|mais dez|passa 10|passar 10|pula pra frente|pular pra frente|pular para frente|pula para frente|ir para frente|pra frente)\b/.test(t) ||
      t === '10 segundos' ||
      t === 'dez segundos'
  },
  {
    action: 'SKIP_INTRO',
    label: 'Pular abertura',
    matches: (t) =>
      /\b(pular abertura|pula abertura|pular a abertura|pula a abertura|tira a abertura|tirar abertura|tirar a abertura|passa a abertura|passar abertura|pula essa parte|pular intro|pula intro|skip intro|pular|pula|pule|abertura)\b/.test(t)
  },
  {
    action: 'VOLUME_UP',
    label: 'Volume +10%',
    matches: (t) =>
      /\b(aumentar volume|aumenta o volume|aumenta volume|aumentando|aumentar o som|aumenta o som|aumentar som|aumenta som|subir volume|sobe o volume|subir som|sobe o som|mais alto|mais volume|volume mais|mais som|som mais alto|volume alto|ta baixo|muito baixo|ta muito baixo|sobe|subir|aumentar|aumenta)\b/.test(t)
  },
  {
    action: 'VOLUME_DOWN',
    label: 'Volume -10%',
    matches: (t) =>
      /\b(diminuir volume|diminui o volume|diminui volume|diminuindo|diminuir o som|diminui o som|diminuir som|diminui som|abaixar volume|abaixa o volume|abaixa volume|abaixando|abaixar o som|abaixa o som|abaixar som|abaixa som|baixar volume|baixa o volume|baixar som|baixa o som|menos som|som mais baixo|mais baixo|menos volume|volume baixo|ta alto|muito alto|ta muito alto|diminuir|diminui|abaixar|abaixa|baixa)\b/.test(t)
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
      /\b(voltar 10|volta 10|voltar dez|volta dez|menos 10|menos dez|voltar 10 segundos|retroceder|retrocede|recuar|recua|voltar um pouco|volta um pouco|voltar um pouquinho|volta um pouquinho|voltar atras|10 segundos atras|repetir cena|voltar|volta)\b/.test(t)
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

function matchVoiceCommandRules(normalizedTarget: string): Omit<ParsedVoiceCommand, 'matchedText'> | null {
  const wordCount = normalizedTarget.split(' ').filter(Boolean).length;
  if (wordCount === 0 || wordCount > MAX_COMMAND_WORDS) {
    return null;
  }
  for (const rule of VOICE_COMMAND_RULES) {
    if (rule.matches(normalizedTarget)) {
      return { action: rule.action, label: rule.label };
    }
  }
  return null;
}

/**
 * Analisa a frase dita e extrai a ação do player correspondente.
 * Se o wake-word "infinity" estiver presente, avalia apenas o trecho posterior a ele.
 */
export function parseVoiceCommand(rawText: string): ParsedVoiceCommand | null {
  const normalized = normalizeVoiceText(rawText);
  if (!normalized) return null;

  const target = extractCommandAfterWakeWord(normalized);
  if (!target) return null;

  const matched = matchVoiceCommandRules(target);
  return matched ? { ...matched, matchedText: rawText } : null;
}

export interface BestVoiceAlternativeResult {
  wakeDetected: boolean;
  bestTranscript: string;
  command: ParsedVoiceCommand | null;
}

/**
 * Avalia todas as hipóteses retornadas pelo SpeechRecognition (maxAlternatives)
 * para capturar a wake-word e comandos mesmo em voz grave, aguda, baixa ou distante.
 */
export function parseBestVoiceAlternative(alternatives: string[]): BestVoiceAlternativeResult {
  let wakeDetected = false;
  let wakeTranscript = '';
  let fallbackCommand: ParsedVoiceCommand | null = null;
  let fallbackTranscript = '';

  for (const raw of alternatives) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;

    const hasWake = hasWakeWord(trimmed);
    if (hasWake) {
      wakeDetected = true;
      if (!wakeTranscript) wakeTranscript = trimmed;
    }

    const cmd = parseVoiceCommand(trimmed);
    if (cmd) {
      if (hasWake) {
        return { wakeDetected: true, bestTranscript: trimmed, command: cmd };
      }
      if (!fallbackCommand) {
        fallbackCommand = cmd;
        fallbackTranscript = trimmed;
      }
    }
  }

  if (fallbackCommand) {
    return { wakeDetected, bestTranscript: fallbackTranscript, command: fallbackCommand };
  }

  return {
    wakeDetected,
    bestTranscript: wakeTranscript || (alternatives[0] || '').trim(),
    command: null
  };
}
