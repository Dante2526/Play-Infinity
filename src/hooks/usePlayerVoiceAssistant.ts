import { useState, useEffect, useRef, useCallback } from 'react';
import {
  parseBestVoiceAlternative,
  extractCommandAfterWakeWord,
  normalizeVoiceText,
  ParsedVoiceCommand,
  PlayerVoiceAction
} from '../utils/voiceCommandParser';
import {
  isContinuousVoiceEnabledByDefault,
  setContinuousVoiceEnabled,
  requestMicrophonePermission,
  isMicrophonePermissionGranted,
  checkMicrophonePermissionStatus,
  syncMicrophonePermission
} from '../services/voicePermissionService';

export interface UsePlayerVoiceAssistantOptions {
  onCommand: (action: PlayerVoiceAction, label: string) => void;
  onWakeWordDetected?: () => void;
  onWakeExpired?: () => void;
  onAudioFocusConflict?: () => void;
  onSessionStarting?: () => void;
  isPlaying?: boolean;
  lang?: string;
}

export interface VoiceAssistantFeedback {
  visible: boolean;
  text: string;
  type: 'listening' | 'success' | 'info' | 'error';
}

const ABORT_COOLDOWN_MS = 150;
const PREVENTIVE_RENEW_MS = 45000;
const HARD_RENEW_CAP_MS = 50000;
const IDLE_GUARD_WHEN_SLEEPING_MS = 600;
const MAX_SESSION_RESULTS = 18;
const MAX_BACKOFF_MS = 30000;
const POST_COMMAND_WAKE_COOLDOWN_MS = 2200;
const PLAY_AUDIO_FOCUS_GUARD_MS = 800;
const MOBILE_PLAY_AUDIO_FOCUS_GUARD_MS = 2500;
const MOBILE_ZOMBIE_RENEW_MS = 90000;

function isMobileAudioFocusSensitive(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /SamsungBrowser|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function isEdgeBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /\bEdg\//i.test(navigator.userAgent || '');
}

function hasWebAudioSttSupport(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  return !!AudioCtx && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
}

export function downsampleTo16kPcm(input: Float32Array, inputRate: number): Int16Array {
  const targetRate = 16000;
  if (!input || input.length === 0) return new Int16Array(0);
  if (inputRate <= targetRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / targetRate;
  const newLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Int16Array(newLen);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < newLen) {
    const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
      accum += input[i];
      count++;
    }
    const sample = count > 0 ? accum / count : input[Math.min(offsetBuffer, input.length - 1)] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return out;
}

function describeVoiceUnmatchedReason(
  wakeDetected: boolean,
  alreadyAwake: boolean,
  afterWake: string
): string {
  if (!wakeDetected && !alreadyAwake) return 'sem wake-word "Infinity"';
  if (!afterWake) return 'apenas wake-word "Infinity" (aguardando comando)';
  const words = afterWake.split(' ').filter(Boolean).length;
  if (words > 5) return `trecho após "Infinity" tem ${words} palavras (máx 5)`;
  return `trecho "${afterWake}" não casou com nenhum comando`;
}

function logVoiceTranscriptDiagnostic(params: {
  engine: 'WebSpeech' | 'WebAudio/STT';
  isFinal: boolean;
  alternatives: string[];
  bestTranscript: string;
  wakeDetected: boolean;
  alreadyAwake: boolean;
  command: ParsedVoiceCommand | null;
}): void {
  const { engine, isFinal, alternatives, bestTranscript, wakeDetected, alreadyAwake, command } = params;
  const sample = bestTranscript || alternatives[0] || '';
  const normalized = normalizeVoiceText(sample);
  const afterWake = normalized ? extractCommandAfterWakeWord(normalized) : '';
  const reason = command ? 'ok' : describeVoiceUnmatchedReason(wakeDetected, alreadyAwake, afterWake);
  const wakeLabel = wakeDetected ? 'SIM' : alreadyAwake ? 'JÁ ACORDADO' : 'NÃO';
  const understoodLabel = command ? `${command.action} ("${command.label}")` : `nenhum (${reason})`;

  console.log(
    `%c[VoiceAssistant] 🎙️ ${engine} (${isFinal ? 'final' : 'parcial'})%c Ouviu: "${alternatives[0] || ''}" | Wake "Infinity": ${wakeLabel} | Entendeu: ${understoodLabel}`,
    'background:#ea580c;color:#fff;font-weight:bold;padding:1px 6px;border-radius:3px;',
    'color:inherit;',
    {
      ouviu: alternatives[0] || '',
      hipoteses: alternatives,
      normalizado: normalized,
      trechoAposInfinity: afterWake,
      wakeDetectado: wakeDetected,
      jaEstavaAcordado: alreadyAwake,
      entendeu: command ? { acao: command.action, label: command.label } : null,
      motivo: reason,
    }
  );
}

/** Calcula backoff exponencial (1s, 2s, 4s... máx 30s) para falhas consecutivas. */
export function computeVoiceBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, consecutiveFailures - 1));
}

export function usePlayerVoiceAssistant({
  onCommand,
  onWakeWordDetected,
  onWakeExpired,
  onAudioFocusConflict,
  onSessionStarting,
  isPlaying = false,
  lang = 'pt-BR'
}: UsePlayerVoiceAssistantOptions) {
  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [isContinuous, setIsContinuous] = useState(
    () => isContinuousVoiceEnabledByDefault() && isMicrophonePermissionGranted()
  );
  const [feedback, setFeedback] = useState<VoiceAssistantFeedback>({
    visible: false,
    text: '',
    type: 'info'
  });

  const recognitionRef = useRef<any>(null);
  const isStartingRef = useRef(false);
  const startingAtRef = useRef(0);
  const isListeningRef = useRef(false);
  const isAwakeRef = useRef(false);
  const awakeTimerRef = useRef<any>(null);
  const lastExecutedRef = useRef<{ action: string; at: number }>({ action: '', at: 0 });
  const lastCommandExecutedAtRef = useRef(0);
  const lastConsumedTranscriptRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const finalizedIndicesRef = useRef<Set<number>>(new Set());
  const pendingInterimRef = useRef<{ command: ParsedVoiceCommand; resultIndex: number } | null>(null);
  const lastLoggedInterimRef = useRef('');
  const sessionStartedAtRef = useRef(0);
  const lastResultAtRef = useRef(0);
  const lastAbortAtRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const nextRetryAtRef = useRef(0);
  const oneShotPendingRef = useRef(false);
  const lastAudioFocusResumeAtRef = useRef(0);
  // Em celulares (Android WebView/APK, Chrome Mobile, Samsung Internet, iOS), o getUserMedia + WebAudio
  // captura voz com echoCancellation sem disputar AudioFocus com o <video> (evitando pausas, bipes e morte em 400ms).
  const useWebAudioFallbackRef = useRef(isMobileAudioFocusSensitive() && hasWebAudioSttSupport());
  const networkErrorStreakRef = useRef(0);
  const sttErrorStreakRef = useRef(0);
  const webAudioSessionRef = useRef<{ stop: () => void } | null>(null);
  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const webAudioStreamRef = useRef<MediaStream | null>(null);
  const prevIsPlayingRef = useRef(isPlaying);
  const onCommandRef = useRef(onCommand);
  const onWakeRef = useRef(onWakeWordDetected);
  const onWakeExpiredRef = useRef(onWakeExpired);
  const onAudioFocusConflictRef = useRef(onAudioFocusConflict);
  const onSessionStartingRef = useRef(onSessionStarting);
  const isPlayingRef = useRef(isPlaying);
  const isContinuousRef = useRef(isContinuous);
  const startSessionRef = useRef<(allowOneShot?: boolean) => void>(() => {});
  const restartTimerRef = useRef<any>(null);
  const feedbackTimeoutRef = useRef<any>(null);

  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { onWakeRef.current = onWakeWordDetected; }, [onWakeWordDetected]);
  useEffect(() => { onWakeExpiredRef.current = onWakeExpired; }, [onWakeExpired]);
  useEffect(() => { onAudioFocusConflictRef.current = onAudioFocusConflict; }, [onAudioFocusConflict]);
  useEffect(() => { onSessionStartingRef.current = onSessionStarting; }, [onSessionStarting]);
  useEffect(() => { isContinuousRef.current = isContinuous; }, [isContinuous]);

  const showFeedback = useCallback((text: string, type: VoiceAssistantFeedback['type'] = 'info', durationMs = 3000) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setFeedback({ visible: true, text, type });
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(prev => ({ ...prev, visible: false, type: 'info' }));
    }, durationMs);
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  // Encerra a instância atual limpando handlers; retorna true se havia sessão ativa abortada.
  const safeStopCurrentRecognition = useCallback((): boolean => {
    let hadActive = false;
    if (webAudioSessionRef.current) {
      hadActive = true;
      try {
        webAudioSessionRef.current.stop();
      } catch {}
      webAudioSessionRef.current = null;
      lastAbortAtRef.current = Date.now();
    }
    if (recognitionRef.current) {
      hadActive = true;
      try {
        const old = recognitionRef.current;
        old.onstart = null;
        old.onresult = null;
        old.onerror = null;
        old.onend = null;
        if (typeof old.abort === 'function') old.abort();
      } catch {}
      recognitionRef.current = null;
      lastAbortAtRef.current = Date.now();
    }
    isListeningRef.current = false;
    isStartingRef.current = false;
    setIsListening(false);
    return hadActive;
  }, []);

  const deactivateAwake = useCallback((delayMs = 0) => {
    if (awakeTimerRef.current) clearTimeout(awakeTimerRef.current);
    pendingInterimRef.current = null;
    if (delayMs > 0) {
      awakeTimerRef.current = setTimeout(() => {
        isAwakeRef.current = false;
        setIsAwake(false);
      }, delayMs);
    } else {
      isAwakeRef.current = false;
      setIsAwake(false);
    }
  }, []);

  const scheduleSessionStart = useCallback((delayMs = 0, allowOneShot = false) => {
    clearRestartTimer();
    if (allowOneShot) oneShotPendingRef.current = true;
    const waitMs = Math.max(0, delayMs);
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      const canRun = isContinuousRef.current || oneShotPendingRef.current;
      if (!canRun) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && !oneShotPendingRef.current) {
        return;
      }
      const oneShot = oneShotPendingRef.current;
      oneShotPendingRef.current = false;
      startSessionRef.current(oneShot);
    }, waitMs);
  }, [clearRestartTimer]);

  const executeVoiceCommand = useCallback((command: ParsedVoiceCommand): boolean => {
    const now = Date.now();
    if (lastExecutedRef.current.action === command.action && now - lastExecutedRef.current.at < 1500) {
      console.info('[VoiceAssistant] ⏭️ Comando ignorado (cooldown anti-eco <1.5s):', command.action);
      deactivateAwake(0);
      return false;
    }
    pendingInterimRef.current = null;
    lastExecutedRef.current = { action: command.action, at: now };
    lastCommandExecutedAtRef.current = now;

    console.log(
      `%c[VoiceAssistant] ✅ Executado%c ${command.action} — ${command.label}`,
      'background:#16a34a;color:#fff;font-weight:bold;padding:1px 6px;border-radius:3px;',
      'color:inherit;',
      { frase: command.matchedText }
    );

    if (command.action === 'PLAY' && isMobileAudioFocusSensitive() && !useWebAudioFallbackRef.current) {
      nextRetryAtRef.current = Math.max(nextRetryAtRef.current, now + MOBILE_PLAY_AUDIO_FOCUS_GUARD_MS);
      clearRestartTimer();
      safeStopCurrentRecognition();
      showFeedback(`✓ ${command.label}`, 'success', 2200);
      onCommandRef.current(command.action, command.label);
      deactivateAwake(0);
      if (isContinuousRef.current) {
        scheduleSessionStart(MOBILE_PLAY_AUDIO_FOCUS_GUARD_MS);
      }
      return true;
    }

    showFeedback(`✓ ${command.label}`, 'success', 2200);
    onCommandRef.current(command.action, command.label);
    deactivateAwake(0);
    return true;
  }, [showFeedback, deactivateAwake, clearRestartTimer, safeStopCurrentRecognition, scheduleSessionStart]);

  const flushPendingInterim = useCallback((): boolean => {
    const pending = pendingInterimRef.current;
    if (!pending) return false;
    pendingInterimRef.current = null;
    return executeVoiceCommand(pending.command);
  }, [executeVoiceCommand]);

  const activateAwake = useCallback((durationMs = 4500) => {
    if (awakeTimerRef.current) clearTimeout(awakeTimerRef.current);
    isAwakeRef.current = true;
    setIsAwake(true);
    awakeTimerRef.current = setTimeout(() => {
      if (flushPendingInterim()) {
        return;
      }
      isAwakeRef.current = false;
      setIsAwake(false);
      setFeedback(prev => (prev.type === 'listening' ? { ...prev, visible: false, type: 'info' } : prev));
      onWakeExpiredRef.current?.();
      if (!isContinuousRef.current) {
        safeStopCurrentRecognition();
      }
    }, durationMs);
  }, [flushPendingInterim, safeStopCurrentRecognition]);

  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;
    isPlayingRef.current = isPlaying;

    const now = Date.now();
    // Se o vídeo estava tocando e pausou sozinho logo após o SpeechRecognition iniciar (< 1800ms),
    // sem wake-word ativo e sem comando PAUSE recente: o navegador mobile (ex: Samsung Internet)
    // roubou o AudioFocus do vídeo. Retoma o PLAY sem desligar o microfone (com cooldown de 3s).
    if (
      isMobileAudioFocusSensitive() &&
      wasPlaying &&
      !isPlaying &&
      !isAwakeRef.current &&
      lastExecutedRef.current.action !== 'PAUSE' &&
      sessionStartedAtRef.current > 0 &&
      now - sessionStartedAtRef.current < 1800 &&
      now - lastAudioFocusResumeAtRef.current > 3000
    ) {
      lastAudioFocusResumeAtRef.current = now;
      lastExecutedRef.current = { action: 'PLAY', at: now };
      lastCommandExecutedAtRef.current = now;
      onAudioFocusConflictRef.current?.();
    }
  }, [isPlaying]);

  const registerFailure = useCallback((reason: string, notifyAtThird = false) => {
    consecutiveFailuresRef.current += 1;
    const rawBackoff = computeVoiceBackoffMs(consecutiveFailuresRef.current);
    // Queda de socket ocioso na Web Speech API ('network') reconecta em no máximo 2s
    const backoff = reason === 'network' ? Math.min(rawBackoff, 2000) : rawBackoff;
    nextRetryAtRef.current = Date.now() + backoff;
    if (notifyAtThird && consecutiveFailuresRef.current === 3) {
      showFeedback('Microfone ocupado ou indisponível. Tentando reconectar...', 'error', 3500);
    }
    if (reason === 'start_error' && isContinuousRef.current) {
      scheduleSessionStart(backoff);
    }
  }, [showFeedback, scheduleSessionStart]);

  const handleTranscript = useCallback((rawInput: string | string[], isFinal = true, resultIndex = -1) => {
    const alternatives = (Array.isArray(rawInput) ? rawInput : [rawInput])
      .map(s => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    if (alternatives.length === 0) return;

    const primaryNorm = alternatives[0].toLowerCase().trim();
    const now = Date.now();

    if (pendingInterimRef.current && pendingInterimRef.current.resultIndex !== resultIndex) {
      flushPendingInterim();
    }

    const { wakeDetected, bestTranscript, command } = parseBestVoiceAlternative(alternatives);

    // Deduplica apenas eco imediato da mesma frase de comando em < 1500ms
    if (
      isFinal &&
      command !== null &&
      primaryNorm &&
      lastConsumedTranscriptRef.current.text === primaryNorm &&
      now - lastConsumedTranscriptRef.current.at < 1500
    ) {
      return;
    }

    const engine = useWebAudioFallbackRef.current ? 'WebAudio/STT' : 'WebSpeech';
    const wasAlreadyAwake = isAwakeRef.current;

    if (isFinal) {
      lastLoggedInterimRef.current = '';
      logVoiceTranscriptDiagnostic({
        engine,
        isFinal: true,
        alternatives,
        bestTranscript,
        wakeDetected,
        alreadyAwake: wasAlreadyAwake,
        command,
      });
    } else if ((wakeDetected || wasAlreadyAwake) && alternatives[0] && lastLoggedInterimRef.current !== alternatives[0]) {
      lastLoggedInterimRef.current = alternatives[0];
      logVoiceTranscriptDiagnostic({
        engine,
        isFinal: false,
        alternatives,
        bestTranscript,
        wakeDetected,
        alreadyAwake: wasAlreadyAwake,
        command,
      });
    }

    const inPostPlayCooldown =
      lastExecutedRef.current.action === 'PLAY' &&
      now - lastCommandExecutedAtRef.current < POST_COMMAND_WAKE_COOLDOWN_MS;

    let wakeJustActivated = false;
    const awakeWindowMs = useWebAudioFallbackRef.current ? 6000 : 4500;

    // 1. Acorda rapidamente mesmo no interim para pausar o filme na hora e abrir a janela de comando
    if (wakeDetected && !inPostPlayCooldown) {
      if (!isAwakeRef.current) {
        wakeJustActivated = true;
        activateAwake(awakeWindowMs);
        // Não pausa o filme se a mesma transcrição já contém o comando PLAY!
        if (isPlayingRef.current && command?.action !== 'PLAY') {
          onWakeRef.current?.();
        }
        showFeedback('🎤 Ouvindo comando...', 'listening', awakeWindowMs);
      } else {
        activateAwake(awakeWindowMs);
      }
    }

    // 2. Enquanto fala (!isFinal): guarda comando como fallback e renova janela para não cortar de longe
    if (!isFinal) {
      if ((wakeDetected || isAwakeRef.current) && command) {
        pendingInterimRef.current = { command, resultIndex };
      }
      if (isAwakeRef.current && !wakeJustActivated) {
        activateAwake(awakeWindowMs);
      }
      return;
    }

    if (pendingInterimRef.current?.resultIndex === resultIndex) {
      pendingInterimRef.current = null;
    }

    // 3. Só executa quando acordado por "Infinity" ou Push-to-Talk
    if (!wakeDetected && !isAwakeRef.current) {
      return;
    }

    if (command) {
      if (primaryNorm) {
        lastConsumedTranscriptRef.current = { text: primaryNorm, at: now };
      }
      executeVoiceCommand(command);
    }
  }, [showFeedback, activateAwake, executeVoiceCommand, flushPendingInterim]);

  // Cria sempre uma nova instância limpa de reconhecimento
  const createRecognition = useCallback(() => {
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) return null;

    try {
      const recognition = new SpeechClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      recognition.maxAlternatives = 5;

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
        isStartingRef.current = false;
        consecutiveFailuresRef.current = 0;
        nextRetryAtRef.current = 0;
        finalizedIndicesRef.current.clear();
        pendingInterimRef.current = null;
        sessionStartedAtRef.current = Date.now();
      };

      recognition.onresult = (event: any) => {
        lastResultAtRef.current = Date.now();
        consecutiveFailuresRef.current = 0;
        networkErrorStreakRef.current = 0;
        nextRetryAtRef.current = 0;
        const totalResults = event.results ? event.results.length : 0;
        const startIdx = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
        for (let i = startIdx; i < totalResults; ++i) {
          // Quando o Android re-emite um array cumulativo [0..N] começando em resultIndex = 0,
          // pula índices anteriores (i < totalResults - 1) que já foram finalizados, mas NUNCA
          // bloqueia o último slot (i === totalResults - 1), pois no mobile resultIndex = 0 é reutilizado.
          if (i < totalResults - 1 && finalizedIndicesRef.current.has(i)) {
            continue;
          }
          const res = event.results[i];
          const isFinal = !!res?.isFinal;
          if (isFinal) {
            finalizedIndicesRef.current.add(i);
          }
          const alternatives: string[] = [];
          const len = typeof res?.length === 'number' ? res.length : 1;
          for (let k = 0; k < len; k++) {
            const text = res[k]?.transcript;
            if (typeof text === 'string' && text.trim()) {
              alternatives.push(text.trim());
            }
          }
          if (alternatives.length === 0 && res?.[0]?.transcript) {
            alternatives.push(res[0].transcript);
          }
          handleTranscript(alternatives, isFinal, i);
        }

        // Recicla sessão dormente com muitos resultados acumulados (áudio do filme) para renovar VAD/AGC,
        // exceto durante reprodução mobile (para não roubar AudioFocus do vídeo).
        if (
          isContinuousRef.current &&
          !isAwakeRef.current &&
          !(isMobileAudioFocusSensitive() && isPlayingRef.current) &&
          event.results &&
          event.results.length >= MAX_SESSION_RESULTS
        ) {
          startSessionRef.current();
        }
      };

      recognition.onerror = (event: any) => {
        isStartingRef.current = false;
        const err = event.error;

        // 'no-speech' e 'aborted' são ocorrências normais em escuta contínua no Chromium.
        if (err === 'no-speech' || err === 'aborted') {
          return;
        }

        if (err === 'not-allowed') {
          // No Chrome Android e Samsung Internet, 'not-allowed' pode ser disparado quando start()
          // roda via timer sem User Gesture recente, mesmo com permissão já concedida.
          if (isMicrophonePermissionGranted()) {
            console.warn('[VoiceAssistant] not-allowed transitório no mobile (aguardando toque físico).');
            registerFailure('not_allowed_transient', false);
            return;
          }
          syncMicrophonePermission('denied');
          showFeedback('Permissão de microfone negada.', 'error', 3000);
          setIsContinuous(false);
          isContinuousRef.current = false;
          safeStopCurrentRecognition();
          return;
        }

        if (err === 'network' || err === 'audio-capture' || err === 'service-not-allowed') {
          if (err === 'network' || err === 'service-not-allowed') {
            networkErrorStreakRef.current += 1;
            if (hasWebAudioSttSupport() && (isEdgeBrowser() || networkErrorStreakRef.current >= 2)) {
              console.info(`[VoiceAssistant] Web Speech nativa indisponível (${err}). Ativando motor WebAudio (/api/voice-stt)...`);
              useWebAudioFallbackRef.current = true;
              safeStopCurrentRecognition();
              scheduleSessionStart(80);
              return;
            }
          }
          console.warn(`[VoiceAssistant] Falha na voz (${err}), aplicando backoff...`);
          registerFailure(err, err === 'audio-capture' || err === 'service-not-allowed');
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        setIsListening(false);
        recognitionRef.current = null;
        isStartingRef.current = false;

        if (pendingInterimRef.current && isAwakeRef.current) {
          flushPendingInterim();
        }

        if (isContinuousRef.current) {
          const now = Date.now();
          const sinceAbort = lastAbortAtRef.current > 0 ? now - lastAbortAtRef.current : ABORT_COOLDOWN_MS;
          const abortWait = Math.max(30, ABORT_COOLDOWN_MS - sinceAbort);
          let waitMs = Math.max(abortWait, nextRetryAtRef.current - now);
          const playGuardMs = isMobileAudioFocusSensitive()
            ? MOBILE_PLAY_AUDIO_FOCUS_GUARD_MS
            : PLAY_AUDIO_FOCUS_GUARD_MS;
          // Dá folga para o áudio do player inicializar sem que o SpeechRecognition dispute AudioFocus
          const sincePlay = now - lastCommandExecutedAtRef.current;
          if (lastExecutedRef.current.action === 'PLAY' && sincePlay < playGuardMs) {
            waitMs = Math.max(waitMs, playGuardMs - sincePlay);
          }
          scheduleSessionStart(waitMs);
        }
      };

      return recognition;
    } catch (err) {
      console.warn('[VoiceAssistant] Erro ao instanciar SpeechRecognition:', err);
      setIsSupported(false);
      isStartingRef.current = false;
      return null;
    }
  }, [lang, handleTranscript, showFeedback, safeStopCurrentRecognition, registerFailure, scheduleSessionStart, flushPendingInterim]);

  // Motor WebAudio + /api/voice-stt para Mobile (zero conflito de AudioFocus com o vídeo) e navegadores sem Web Speech nativa
  const startWebAudioSttSession = useCallback(async () => {
    if (!hasWebAudioSttSupport()) {
      setIsSupported(false);
      isStartingRef.current = false;
      return;
    }

    isStartingRef.current = true;
    startingAtRef.current = Date.now();

    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    let preCreatedCtx: AudioContext | null = null;
    try {
      // Cria e resume o AudioContext ANTES do await getUserMedia para aproveitar o User Gesture ativo no mobile
      preCreatedCtx = new AudioCtx();
      if (preCreatedCtx && typeof preCreatedCtx.resume === 'function' && preCreatedCtx.state === 'suspended') {
        preCreatedCtx.resume().catch(() => {});
      }
    } catch {
      preCreatedCtx = null;
    }

    let stream: MediaStream | null = null;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
        });
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          throw err;
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err: any) {
      if (preCreatedCtx) {
        try { if (preCreatedCtx.state !== 'closed') void preCreatedCtx.close(); } catch {}
      }
      isStartingRef.current = false;
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        syncMicrophonePermission('denied');
        showFeedback('Permissão de microfone negada.', 'error', 3000);
        setIsContinuous(false);
        isContinuousRef.current = false;
        return;
      }
      registerFailure('audio-capture', true);
      if (isContinuousRef.current) {
        scheduleSessionStart(Math.max(1000, nextRetryAtRef.current - Date.now()));
      }
      return;
    }

    if (!isContinuousRef.current && !oneShotPendingRef.current) {
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      if (preCreatedCtx) {
        try { if (preCreatedCtx.state !== 'closed') void preCreatedCtx.close(); } catch {}
      }
      isStartingRef.current = false;
      return;
    }

    try {
      const ctx: AudioContext = preCreatedCtx || new AudioCtx();
      if (typeof ctx.resume === 'function' && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const sampleRate = ctx.sampleRate || 48000;
      const bufferSize = sampleRate <= 24000 ? 1024 : 4096;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;

      const preRoll: Int16Array[] = [];
      const rmsHistory: number[] = [];
      let utteranceChunks: Int16Array[] = [];
      let speechMs = 0;
      let silenceMs = 0;
      let utteranceMs = 0;
      let noiseFloor = 0.0025;
      let inFlightRequests = 0;
      let stopped = false;

      const protocol = (window as any)?.location?.protocol || '';
      const apiBase = protocol === 'capacitor:' || protocol === 'file:' ? 'https://play-infinity.stream' : '';

      const sendUtterance = (chunks: Int16Array[]) => {
        if (stopped || chunks.length === 0 || inFlightRequests >= 2) return;
        let totalSamples = 0;
        for (const c of chunks) totalSamples += c.length;
        if (totalSamples < 2400) return; // < 150ms a 16kHz
        const merged = new Int16Array(totalSamples);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        inFlightRequests++;
        const fetchFn = (window as any).fetch || fetch;
        fetchFn(`${apiBase}/api/voice-stt?lang=${encodeURIComponent(lang)}&rate=16000`, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/l16; rate=16000' },
          body: new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength)
        })
          .then((r: Response) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            sttErrorStreakRef.current = 0;
            return r.json();
          })
          .then((data: any) => {
            if (stopped || !data || !Array.isArray(data.alternatives) || data.alternatives.length === 0) return;
            lastResultAtRef.current = Date.now();
            consecutiveFailuresRef.current = 0;
            handleTranscript(data.alternatives, true, 0);
          })
          .catch(() => {
            if (stopped) return;
            sttErrorStreakRef.current += 1;
            const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (sttErrorStreakRef.current >= 3 && SpeechClass) {
              console.warn('[VoiceAssistant] /api/voice-stt indisponível (3 falhas). Alternando para SpeechRecognition nativo.');
              useWebAudioFallbackRef.current = false;
              sttErrorStreakRef.current = 0;
              safeStopCurrentRecognition();
              if (isContinuousRef.current) {
                scheduleSessionStart(250);
              }
            }
          })
          .finally(() => {
            inFlightRequests = Math.max(0, inFlightRequests - 1);
          });
      };

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (stopped) return;
        const input = e.inputBuffer.getChannelData(0);
        if (!input || input.length === 0) return;
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / input.length);
        const activeRate = ctx.sampleRate || sampleRate;
        const frameMs = Math.max(16, (input.length / activeRate) * 1000);
        const pcm16 = downsampleTo16kPcm(input, activeRate);

        rmsHistory.push(rms);
        if (rmsHistory.length > 28) rmsHistory.shift();

        // Limiar calibrado para DSP mobile (AEC/NS atenua voz em ~12-18dB)
        const threshold = Math.max(0.0055, Math.min(0.04, noiseFloor * 2.3));
        const isSpeech = rms > threshold;
        const maxPreRollChunks = Math.max(4, Math.round(420 / frameMs));

        if (isSpeech) {
          if (utteranceChunks.length === 0) {
            for (const p of preRoll) utteranceChunks.push(p);
            preRoll.length = 0;
          }
          utteranceChunks.push(pcm16);
          speechMs += frameMs;
          utteranceMs += frameMs;
          silenceMs = 0;

          if (utteranceMs >= 2800) {
            const toSend = utteranceChunks;
            // Preserva ~550ms finais como overlap para nunca partir "Infinity" ao meio durante som contínuo do filme
            const overlapCount = Math.min(toSend.length, Math.max(4, Math.round(550 / frameMs)));
            preRoll.length = 0;
            for (let i = toSend.length - overlapCount; i < toSend.length; i++) {
              preRoll.push(toSend[i]);
            }
            utteranceChunks = [];
            speechMs = 0;
            utteranceMs = 0;
            silenceMs = 0;

            if (rmsHistory.length >= 8) {
              const sorted = [...rmsHistory].sort((a, b) => a - b);
              const ambient = sorted[Math.floor(sorted.length * 0.25)];
              noiseFloor = Math.max(0.002, Math.min(0.025, noiseFloor * 0.7 + ambient * 0.3));
            }
            sendUtterance(toSend);
          }
        } else {
          if (utteranceChunks.length > 0) {
            utteranceChunks.push(pcm16);
            utteranceMs += frameMs;
            silenceMs += frameMs;
            if (silenceMs >= 380) {
              const toSend = speechMs >= 150 ? utteranceChunks : [];
              utteranceChunks = [];
              speechMs = 0;
              utteranceMs = 0;
              silenceMs = 0;
              if (toSend.length > 0) sendUtterance(toSend);
            }
          } else {
            noiseFloor = Math.max(0.0018, Math.min(0.028, noiseFloor * 0.94 + rms * 0.06));
            preRoll.push(pcm16);
            if (preRoll.length > maxPreRollChunks) preRoll.shift();
          }
        }
      };

      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(ctx.destination);

      const stopSession = () => {
        if (stopped) return;
        stopped = true;
        if (webAudioCtxRef.current === ctx) webAudioCtxRef.current = null;
        if (webAudioStreamRef.current === stream) webAudioStreamRef.current = null;
        try { processor.onaudioprocess = null as any; } catch {}
        try { source.disconnect(); } catch {}
        try { processor.disconnect(); } catch {}
        try { muteGain.disconnect(); } catch {}
        try {
          stream?.getTracks().forEach(t => {
            t.onended = null;
            t.stop();
          });
        } catch {}
        try { if (ctx.state !== 'closed') void ctx.close(); } catch {}
      };

      try {
        const tracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : stream.getTracks();
        tracks.forEach((track: any) => {
          track.onended = () => {
            if (stopped) return;
            console.info('[VoiceAssistant] Faixa de microfone encerrada pelo sistema; reagendando escuta...');
            safeStopCurrentRecognition();
            if (isContinuousRef.current) {
              scheduleSessionStart(300);
            }
          };
        });
      } catch {}

      webAudioCtxRef.current = ctx;
      webAudioStreamRef.current = stream;
      webAudioSessionRef.current = { stop: stopSession };
      recognitionRef.current = { isWebAudioFallback: true, abort: stopSession };
      isStartingRef.current = false;
      isListeningRef.current = true;
      setIsListening(true);
      consecutiveFailuresRef.current = 0;
      nextRetryAtRef.current = 0;
      sessionStartedAtRef.current = Date.now();
    } catch (err) {
      try { stream?.getTracks().forEach(t => t.stop()); } catch {}
      if (preCreatedCtx) {
        try { if (preCreatedCtx.state !== 'closed') void preCreatedCtx.close(); } catch {}
      }
      isStartingRef.current = false;
      registerFailure('start_error', false);
    }
  }, [lang, handleTranscript, showFeedback, registerFailure, scheduleSessionStart, safeStopCurrentRecognition]);

  // Inicia uma sessão de reconhecimento limpa respeitando cooldown pós-abort() e backoff
  const startRecognitionSession = useCallback((allowOneShot = false) => {
    if (!isSupported) return;
    const now = Date.now();

    if (isStartingRef.current) {
      if (now - startingAtRef.current < 2000) return;
      console.warn('[VoiceAssistant] Destravando start() pendente após 2s.');
      isStartingRef.current = false;
    }

    if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && !allowOneShot) {
      return;
    }

    // Nunca chama abort() e start() no mesmo tick: WebView/Chromium fecha áudio de forma assíncrona
    const hadActive = safeStopCurrentRecognition();
    if (hadActive) {
      scheduleSessionStart(ABORT_COOLDOWN_MS, allowOneShot);
      return;
    }

    const sinceAbort = now - lastAbortAtRef.current;
    if (lastAbortAtRef.current > 0 && sinceAbort < ABORT_COOLDOWN_MS) {
      scheduleSessionStart(ABORT_COOLDOWN_MS - sinceAbort, allowOneShot);
      return;
    }

    if (!allowOneShot && now < nextRetryAtRef.current) {
      scheduleSessionStart(nextRetryAtRef.current - now, false);
      return;
    }

    if (useWebAudioFallbackRef.current) {
      void startWebAudioSttSession();
      return;
    }

    const rec = createRecognition();
    if (!rec) return;

    finalizedIndicesRef.current.clear();
    isStartingRef.current = true;
    startingAtRef.current = now;
    sessionStartedAtRef.current = now;
    recognitionRef.current = rec;

    if (isMobileAudioFocusSensitive() && isPlayingRef.current) {
      onSessionStartingRef.current?.();
    }

    try {
      rec.start();
    } catch (err: any) {
      console.warn('[VoiceAssistant] Erro ao dar start no recognition:', err?.message || err);
      try {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
      } catch {}
      recognitionRef.current = null;
      isListeningRef.current = false;
      isStartingRef.current = false;
      registerFailure('start_error', false);
    }
  }, [isSupported, safeStopCurrentRecognition, scheduleSessionStart, createRecognition, registerFailure, startWebAudioSttSession]);

  useEffect(() => {
    startSessionRef.current = startRecognitionSession;
  }, [startRecognitionSession]);

  // Checagem inicial de suporte da Web Speech API + sincronização real de permissão
  useEffect(() => {
    let cancelled = false;
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass && !hasWebAudioSttSupport()) {
      setIsSupported(false);
    } else {
      if (!SpeechClass && hasWebAudioSttSupport()) {
        useWebAudioFallbackRef.current = true;
      }
      if (isContinuousVoiceEnabledByDefault()) {
        checkMicrophonePermissionStatus()
          .then((status) => {
            if (cancelled) return;
            if (status === 'granted' && !isContinuousRef.current) {
              isContinuousRef.current = true;
              setIsContinuous(true);
            } else if (status === 'denied' && isContinuousRef.current) {
              isContinuousRef.current = false;
              setIsContinuous(false);
              safeStopCurrentRecognition();
            }
          })
          .catch(() => {});
      }
    }

    const handlePermChanged = (evt: any) => {
      if (cancelled) return;
      const status = evt?.detail?.status;
      if (status === 'granted' && isContinuousVoiceEnabledByDefault() && !isContinuousRef.current) {
        isContinuousRef.current = true;
        setIsContinuous(true);
      } else if (status === 'denied' && isContinuousRef.current) {
        isContinuousRef.current = false;
        setIsContinuous(false);
        safeStopCurrentRecognition();
      }
    };
    window.addEventListener('playinfinity:mic_permission_changed', handlePermChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('playinfinity:mic_permission_changed', handlePermChanged);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      clearRestartTimer();
      if (awakeTimerRef.current) clearTimeout(awakeTimerRef.current);
      safeStopCurrentRecognition();
    };
  }, [clearRestartTimer, safeStopCurrentRecognition]);

  // Efeito principal de controle da escuta contínua
  useEffect(() => {
    if (isContinuous && isSupported) {
      if (!recognitionRef.current && !isStartingRef.current && !restartTimerRef.current) {
        startRecognitionSession();
      }
    } else {
      if (!oneShotPendingRef.current) {
        clearRestartTimer();
      }
      safeStopCurrentRecognition();
    }
  }, [isContinuous, isSupported, startRecognitionSession, safeStopCurrentRecognition, clearRestartTimer]);

  // Watchdog Timer Ágil (1.5s, respeitando backoff) + Renovação Preventiva a cada 45s
  useEffect(() => {
    if (!isContinuous || !isSupported) return;

    const watchdogInterval = setInterval(() => {
      if (!isContinuousRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      const now = Date.now();
      const playGuardMs = isMobileAudioFocusSensitive()
        ? MOBILE_PLAY_AUDIO_FOCUS_GUARD_MS
        : PLAY_AUDIO_FOCUS_GUARD_MS;
      if (lastExecutedRef.current.action === 'PLAY' && now - lastCommandExecutedAtRef.current < playGuardMs) {
        return;
      }
      if (now < nextRetryAtRef.current) return;

      // Saúde do motor WebAudio (destrava AudioContext suspenso no mobile e recria stream encerrada pelo SO)
      if (useWebAudioFallbackRef.current && webAudioSessionRef.current) {
        if (
          webAudioCtxRef.current &&
          webAudioCtxRef.current.state === 'suspended' &&
          typeof webAudioCtxRef.current.resume === 'function'
        ) {
          webAudioCtxRef.current.resume().catch(() => {});
        }
        const rawStream = webAudioStreamRef.current;
        if (rawStream) {
          const tracks = typeof rawStream.getAudioTracks === 'function' ? rawStream.getAudioTracks() : rawStream.getTracks();
          if (tracks.length > 0 && tracks.every((t: any) => t.readyState === 'ended')) {
            startSessionRef.current();
            return;
          }
        }
      }

      // 1. Se caiu fora de um agendamento ativo (ou start ficou preso > 2s), reanima
      const stuckStarting = isStartingRef.current && now - startingAtRef.current >= 2000;
      if (stuckStarting || ((!recognitionRef.current || !isListeningRef.current) && !restartTimerRef.current)) {
        startSessionRef.current();
        return;
      }

      // 2. Renovação preventiva aos 45s (brecha de 600ms) ou teto duro aos 50s quando não acordado
      // (No mobile em SpeechRecognition durante reprodução, só renova se ficar zumbi >= 90s sem nenhum resultado)
      const sessionAge = now - sessionStartedAtRef.current;
      const silenceAge = lastResultAtRef.current > 0 ? now - lastResultAtRef.current : sessionAge;
      const isMobilePlayingSpeech = isMobileAudioFocusSensitive() && isPlayingRef.current;
      if (
        isListeningRef.current &&
        !isAwakeRef.current &&
        !useWebAudioFallbackRef.current &&
        sessionStartedAtRef.current > 0 &&
        (isMobilePlayingSpeech
          ? sessionAge >= MOBILE_ZOMBIE_RENEW_MS && silenceAge >= MOBILE_ZOMBIE_RENEW_MS
          : (sessionAge >= PREVENTIVE_RENEW_MS && silenceAge > IDLE_GUARD_WHEN_SLEEPING_MS) ||
            sessionAge >= HARD_RENEW_CAP_MS)
      ) {
        startSessionRef.current();
      }
    }, 1500);

    return () => clearInterval(watchdogInterval);
  }, [isContinuous, isSupported]);

  // Reativação apenas se a sessão morreu ao voltar de segundo plano / foco
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (!isContinuousRef.current || !isSupported) return;
      // Preserva sessão saudável já ativa ao clicar entre iframe do player e janela
      if (recognitionRef.current && isListeningRef.current) return;

      const waitMs = Math.max(ABORT_COOLDOWN_MS, nextRetryAtRef.current - Date.now());
      scheduleSessionStart(waitMs);
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [isSupported, scheduleSessionStart]);

  // Auto-recuperação com User Gesture: quando o usuário toca na tela (ex: clique no Play, scrubber, toque no vídeo),
  // se a escuta contínua estiver ativada mas a sessão estiver inativa/pendente, reativa na hora!
  useEffect(() => {
    const handleUserInteraction = () => {
      if (
        webAudioCtxRef.current &&
        webAudioCtxRef.current.state === 'suspended' &&
        typeof webAudioCtxRef.current.resume === 'function'
      ) {
        webAudioCtxRef.current.resume().catch(() => {});
      }
      if (!isContinuousRef.current || !isSupported) return;
      if (recognitionRef.current && isListeningRef.current) return;
      if (isStartingRef.current) return;

      if (isMobileAudioFocusSensitive()) {
        if (
          lastExecutedRef.current.action === 'PLAY' &&
          Date.now() - lastCommandExecutedAtRef.current < MOBILE_PLAY_AUDIO_FOCUS_GUARD_MS
        ) {
          return;
        }
        nextRetryAtRef.current = 0;
        consecutiveFailuresRef.current = 0;
        scheduleSessionStart(350);
        return;
      }

      // Aproveita o contexto de gesto do usuário para ligar o microfone
      nextRetryAtRef.current = 0;
      consecutiveFailuresRef.current = 0;
      scheduleSessionStart(0);
    };

    window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('click', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, [isSupported, scheduleSessionStart]);

  // Ativação por toque manual (Push-to-Talk): acorda na hora sem abortar sessão ativa saudável
  const triggerPushToTalk = useCallback(async () => {
    if (!isSupported) {
      showFeedback('Comando de voz não suportado neste aparelho.', 'error', 3000);
      return;
    }

    let justRequestedMic = false;
    if (!isMicrophonePermissionGranted()) {
      justRequestedMic = true;
      const ok = await requestMicrophonePermission();
      if (!ok && !isMicrophonePermissionGranted()) {
        showFeedback('Permissão de microfone negada.', 'error', 3000);
        return;
      }
    }

    if (!isContinuousRef.current) {
      isContinuousRef.current = true;
      setContinuousVoiceEnabled(true);
      setIsContinuous(true);
    }

    if (isPlayingRef.current) {
      onWakeRef.current?.();
    }

    consecutiveFailuresRef.current = 0;
    nextRetryAtRef.current = 0;
    finalizedIndicesRef.current.clear();
    pendingInterimRef.current = null;
    lastResultAtRef.current = Date.now();

    activateAwake(6000);
    showFeedback('🎤 Ouvindo comando... (Ex: "Tela cheia", "Pausar", "Pular abertura")', 'listening', 5500);

    // Preserva sessão já ouvindo ou inicialização já em curso sem abrir janela surda
    if (recognitionRef.current && isListeningRef.current) {
      return;
    }
    if (isStartingRef.current) {
      return;
    }

    if (justRequestedMic) {
      // Aguarda o SO/WebView liberar o hardware após getUserMedia().stop() antes do rec.start()
      scheduleSessionStart(120, true);
    } else if (!restartTimerRef.current) {
      startRecognitionSession(true);
    }
  }, [isSupported, showFeedback, activateAwake, scheduleSessionStart, startRecognitionSession]);

  // Alterna o assistente de voz (desliga se ativo, ou acorda em escuta imediata se desligado)
  const toggleContinuousMode = useCallback(async () => {
    if (!isSupported) {
      showFeedback('Comando de voz não suportado neste aparelho.', 'error', 3000);
      return;
    }

    if (isContinuousRef.current) {
      setIsContinuous(false);
      isContinuousRef.current = false;
      setContinuousVoiceEnabled(false);
      oneShotPendingRef.current = false;
      clearRestartTimer();
      deactivateAwake(0);
      safeStopCurrentRecognition();
      onWakeExpiredRef.current?.();
      showFeedback('Assistente de voz desativado.', 'info', 2000);
    } else {
      await triggerPushToTalk();
    }
  }, [isSupported, showFeedback, clearRestartTimer, deactivateAwake, safeStopCurrentRecognition, triggerPushToTalk]);

  return {
    isSupported,
    isListening,
    isContinuous,
    isAwake,
    feedback,
    triggerPushToTalk,
    toggleContinuousMode
  };
}
