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

const WAKE_WORD_REGEX = /\b(infinity|infiniti|infinito|infinit)\b/i;

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
 * Analisa a frase dita e extrai a ação do player correspondente.
 * Se o wake-word "infinity" estiver presente, analisa o comando que o acompanha.
 */
export function parseVoiceCommand(rawText: string): ParsedVoiceCommand | null {
  const normalized = normalizeVoiceText(rawText);
  if (!normalized) return null;

  // Remove o wake-word "infinity" (ou variantes) do início da frase se presente
  const cleanCmd = normalized
    .replace(/^(infinity|infiniti|infinito|infinit)\s*/, '')
    .trim();

  const target = cleanCmd || normalized;

  // 1. Pause / Pausar / Parar
  if (/\b(pause|pausar|pausa|pare|parar|para aí|espera)\b/.test(target)) {
    return { action: 'PAUSE', label: 'Pausar reprodução', matchedText: rawText };
  }

  // 2. Play / Continuar / Reproduzir / Despausar
  if (/\b(play|continuar|reproduzir|despausar|roda|dar play|de play)\b/.test(target)) {
    return { action: 'PLAY', label: 'Continuar reprodução', matchedText: rawText };
  }

  // 3. Próximo Episódio
  if (/\b(proximo|proximo episodio|proximo ep|avancar episodio|passar episodio|proxima)\b/.test(target)) {
    return { action: 'NEXT_EPISODE', label: 'Próximo episódio', matchedText: rawText };
  }

  // 4. Pular Abertura / Pular Intro
  if (/\b(pular abertura|pula abertura|pular intro|pula intro|pular|pula|abertura)\b/.test(target)) {
    return { action: 'SKIP_INTRO', label: 'Pular abertura', matchedText: rawText };
  }

  // 5. Aumentar Volume
  if (/\b(aumentar volume|aumenta o volume|aumenta volume|mais alto|sobe o som|aumentar|aumenta)\b/.test(target)) {
    return { action: 'VOLUME_UP', label: 'Volume +10%', matchedText: rawText };
  }

  // 6. Diminuir Volume
  if (/\b(diminuir volume|diminui o volume|diminui volume|mais baixo|abaixar volume|abaixa o volume|abaixar|abaixa)\b/.test(target)) {
    return { action: 'VOLUME_DOWN', label: 'Volume -10%', matchedText: rawText };
  }

  // 7. Mudo / Silenciar
  if (/\b(mudo|silenciar|tirar o som|tira o som|desativar som|sem som)\b/.test(target)) {
    return { action: 'MUTE', label: 'Silenciar / Mudo', matchedText: rawText };
  }

  // 8. Avançar (10s)
  if (/\b(avancar|avanca|avanca 10|avancar 10 segundos|adiantar|pula 10)\b/.test(target)) {
    return { action: 'SEEK_FORWARD', label: 'Avançar 10s', matchedText: rawText };
  }

  // 9. Voltar (10s)
  if (/\b(voltar|volta|volta 10|voltar 10 segundos|retroceder|recuar)\b/.test(target)) {
    return { action: 'SEEK_REWIND', label: 'Voltar 10s', matchedText: rawText };
  }

  // 10. Tela Cheia / Maximizar
  if (/\b(tela cheia|maximizar|tela inteira|expandir)\b/.test(target)) {
    return { action: 'FULLSCREEN', label: 'Tela cheia', matchedText: rawText };
  }

  // 11. Ajustar Tela / Esticar / Proporção
  if (/\b(ajustar tela|ajustar|ajusta tela|esticar|ajuste|proporcao|formato)\b/.test(target)) {
    return { action: 'ASPECT_RATIO', label: 'Ajustar proporção da tela', matchedText: rawText };
  }

  return null;
}
