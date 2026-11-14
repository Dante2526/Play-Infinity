import { useState, useEffect, useRef, useCallback } from 'react';
import {
  parseBestVoiceAlternative,
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
const SPEECH_SILENCE_GUARD_MS = 3500;
const MAX_BACKOFF_MS = 30000;

/** Calcula backoff exponencial (1s, 2s, 4s... máx 30s) para falhas consecutivas. */
export function computeVoiceBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, consecutiveFailures - 1));
}

export function usePlayerVoiceAssistant({
  onCommand,
  onWakeWordDetected,
  onWakeExpired,
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
  const wakeFiredResultIdxRef = useRef(-1);
  const consumedResultIdxRef = useRef(-1);
  const pendingInterimRef = useRef<{ command: ParsedVoiceCommand; resultIndex: number } | null>(null);
  const sessionStartedAtRef = useRef(0);
  const lastResultAtRef = useRef(0);
  const lastAbortAtRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const nextRetryAtRef = useRef(0);
  const oneShotPendingRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const onWakeRef = useRef(onWakeWordDetected);
  const onWakeExpiredRef = useRef(onWakeExpired);
  const isPlayingRef = useRef(isPlaying);
  const isContinuousRef = useRef(isContinuous);
  const startSessionRef = useRef<(allowOneShot?: boolean) => void>(() => {});
  const restartTimerRef = useRef<any>(null);
  const feedbackTimeoutRef = useRef<any>(null);

  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { onWakeRef.current = onWakeWordDetected; }, [onWakeWordDetected]);
  useEffect(() => { onWakeExpiredRef.current = onWakeExpired; }, [onWakeExpired]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
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
    if (recognitionRef.current) {
      hadActive = true;
      try {
        const old = recognitionRef.current;
        old.onstart = null;
        old.onresult = null;
        old.onerror = null;
        old.onend = null;
        old.abort();
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

  const executeVoiceCommand = useCallback((command: ParsedVoiceCommand, resultIndex = -1): boolean => {
    const now = Date.now();
    if (lastExecutedRef.current.action === command.action && now - lastExecutedRef.current.at < 1500) {
      return false;
    }
    if (resultIndex >= 0) consumedResultIdxRef.current = resultIndex;
    pendingInterimRef.current = null;
    lastExecutedRef.current = { action: command.action, at: now };

    showFeedback(`✓ ${command.label}`, 'success', 2200);
    onCommandRef.current(command.action, command.label);
    deactivateAwake(0);
    return true;
  }, [showFeedback, deactivateAwake]);

  const flushPendingInterim = useCallback((): boolean => {
    const pending = pendingInterimRef.current;
    if (!pending) return false;
    pendingInterimRef.current = null;
    if (pending.resultIndex >= 0 && consumedResultIdxRef.current === pending.resultIndex) {
      return false;
    }
    return executeVoiceCommand(pending.command, pending.resultIndex);
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

  const registerFailure = useCallback((reason: string, notifyAtThird = false) => {
    consecutiveFailuresRef.current += 1;
    const backoff = computeVoiceBackoffMs(consecutiveFailuresRef.current);
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

    if (pendingInterimRef.current && pendingInterimRef.current.resultIndex !== resultIndex) {
      flushPendingInterim();
    }

    const { wakeDetected, command } = parseBestVoiceAlternative(alternatives);

    let wakeJustActivated = false;

    // 1. Acorda rapidamente mesmo no interim (no máximo 1x por segmento) para pausar o filme na hora
    if (wakeDetected) {
      const alreadyWoke = resultIndex >= 0 && wakeFiredResultIdxRef.current === resultIndex;
      if (!alreadyWoke) {
        if (resultIndex >= 0) wakeFiredResultIdxRef.current = resultIndex;
        wakeJustActivated = true;
        activateAwake(4500);
        if (isPlayingRef.current) {
          onWakeRef.current?.();
        }
        showFeedback('🎤 Ouvindo comando...', 'listening', 4500);
      }
    }

    // 2. Enquanto fala (!isFinal): guarda comando como fallback e renova janela para não cortar de longe
    if (!isFinal) {
      if ((wakeDetected || isAwakeRef.current) && command) {
        pendingInterimRef.current = { command, resultIndex };
      }
      if (isAwakeRef.current && !wakeJustActivated) {
        activateAwake(4500);
      }
      return;
    }

    if (pendingInterimRef.current?.resultIndex === resultIndex) {
      pendingInterimRef.current = null;
    }
    if (resultIndex >= 0 && consumedResultIdxRef.current === resultIndex) return;

    // 3. Só executa quando acordado por "Infinity" ou Push-to-Talk
    if (!wakeDetected && !isAwakeRef.current) {
      return;
    }

    if (command) {
      executeVoiceCommand(command, resultIndex);
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
        wakeFiredResultIdxRef.current = -1;
        consumedResultIdxRef.current = -1;
        pendingInterimRef.current = null;
        sessionStartedAtRef.current = Date.now();
      };

      recognition.onresult = (event: any) => {
        lastResultAtRef.current = Date.now();
        consecutiveFailuresRef.current = 0;
        nextRetryAtRef.current = 0;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
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
          handleTranscript(alternatives, !!res?.isFinal, i);
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
          syncMicrophonePermission('denied');
          showFeedback('Permissão de microfone negada.', 'error', 3000);
          setIsContinuous(false);
          isContinuousRef.current = false;
          safeStopCurrentRecognition();
          return;
        }

        if (err === 'network' || err === 'audio-capture' || err === 'service-not-allowed') {
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
          const waitMs = Math.max(abortWait, nextRetryAtRef.current - now);
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

    const rec = createRecognition();
    if (!rec) return;

    wakeFiredResultIdxRef.current = -1;
    consumedResultIdxRef.current = -1;
    isStartingRef.current = true;
    startingAtRef.current = now;
    recognitionRef.current = rec;

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
  }, [isSupported, safeStopCurrentRecognition, scheduleSessionStart, createRecognition, registerFailure]);

  useEffect(() => {
    startSessionRef.current = startRecognitionSession;
  }, [startRecognitionSession]);

  // Checagem inicial de suporte da Web Speech API + sincronização real de permissão
  useEffect(() => {
    let cancelled = false;
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) {
      setIsSupported(false);
    } else if (isContinuousVoiceEnabledByDefault()) {
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

    return () => {
      cancelled = true;
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
      if (now < nextRetryAtRef.current) return;

      // 1. Se caiu fora de um agendamento ativo (ou start ficou preso > 2s), reanima
      const stuckStarting = isStartingRef.current && now - startingAtRef.current >= 2000;
      if (stuckStarting || ((!recognitionRef.current || !isListeningRef.current) && !restartTimerRef.current)) {
        startSessionRef.current();
        return;
      }

      // 2. Renovação preventiva aos 45s quando ocioso e não acordado, usando cooldown seguro pós-abort()
      if (
        isListeningRef.current &&
        !isAwakeRef.current &&
        sessionStartedAtRef.current > 0 &&
        now - sessionStartedAtRef.current >= PREVENTIVE_RENEW_MS &&
        now - lastResultAtRef.current > SPEECH_SILENCE_GUARD_MS
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
    wakeFiredResultIdxRef.current = -1;
    consumedResultIdxRef.current = -1;
    pendingInterimRef.current = null;
    lastResultAtRef.current = Date.now();

    activateAwake(6000);
    showFeedback('🎤 Ouvindo comando... (Ex: "Pausar", "Pular abertura")', 'listening', 5500);

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
