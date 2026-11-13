import { useState, useEffect, useRef, useCallback } from 'react';
import { parseVoiceCommand, hasWakeWord, PlayerVoiceAction } from '../utils/voiceCommandParser';
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
  const sessionStartedAtRef = useRef(0);
  const lastResultAtRef = useRef(0);
  const lastAbortAtRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const nextRetryAtRef = useRef(0);
  const oneShotPendingRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const onWakeRef = useRef(onWakeWordDetected);
  const isPlayingRef = useRef(isPlaying);
  const isContinuousRef = useRef(isContinuous);
  const startSessionRef = useRef<(allowOneShot?: boolean) => void>(() => {});
  const restartTimerRef = useRef<any>(null);
  const feedbackTimeoutRef = useRef<any>(null);

  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { onWakeRef.current = onWakeWordDetected; }, [onWakeWordDetected]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isContinuousRef.current = isContinuous; }, [isContinuous]);

  const showFeedback = useCallback((text: string, type: VoiceAssistantFeedback['type'] = 'info', durationMs = 3000) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setFeedback({ visible: true, text, type });
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(prev => ({ ...prev, visible: false, type: 'info' }));
    }, durationMs);
  }, []);

  const activateAwake = useCallback((durationMs = 4500) => {
    if (awakeTimerRef.current) clearTimeout(awakeTimerRef.current);
    isAwakeRef.current = true;
    setIsAwake(true);
    awakeTimerRef.current = setTimeout(() => {
      isAwakeRef.current = false;
      setIsAwake(false);
    }, durationMs);
  }, []);

  const deactivateAwake = useCallback((delayMs = 0) => {
    if (awakeTimerRef.current) clearTimeout(awakeTimerRef.current);
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

  const scheduleSessionStart = useCallback((delayMs = 0, allowOneShot = false) => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
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
  }, []);

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

  const handleTranscript = useCallback((transcript: string, isFinal = true, resultIndex = -1) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;

    const wakeDetected = hasWakeWord(trimmed);

    // 1. Acorda rapidamente mesmo no interim (no máximo 1x por segmento) para pausar o filme na hora
    if (wakeDetected) {
      const alreadyWoke = resultIndex >= 0 && wakeFiredResultIdxRef.current === resultIndex;
      if (!alreadyWoke) {
        if (resultIndex >= 0) wakeFiredResultIdxRef.current = resultIndex;
        activateAwake(4500);
        if (isPlayingRef.current) {
          onWakeRef.current?.();
        }
        showFeedback('🎤 Ouvindo comando...', 'listening', 4500);
      }
    }

    // 2. Comandos só executam após estabilização (isFinal), evitando corte no meio e execução dupla
    if (!isFinal) return;
    if (resultIndex >= 0 && consumedResultIdxRef.current === resultIndex) return;

    // 3. Só executa quando acordado por "Infinity" ou Push-to-Talk
    if (!wakeDetected && !isAwakeRef.current) {
      return;
    }

    const command = parseVoiceCommand(trimmed);
    if (command) {
      const now = Date.now();
      if (lastExecutedRef.current.action === command.action && now - lastExecutedRef.current.at < 1500) {
        return;
      }
      if (resultIndex >= 0) consumedResultIdxRef.current = resultIndex;
      lastExecutedRef.current = { action: command.action, at: now };

      showFeedback(`✓ ${command.label}`, 'success', 2200);
      onCommandRef.current(command.action, command.label);
      deactivateAwake(0);
    }
  }, [showFeedback, activateAwake, deactivateAwake]);

  // Cria sempre uma nova instância limpa de reconhecimento
  const createRecognition = useCallback(() => {
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) return null;

    try {
      const recognition = new SpeechClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
        isStartingRef.current = false;
        consecutiveFailuresRef.current = 0;
        nextRetryAtRef.current = 0;
        wakeFiredResultIdxRef.current = -1;
        consumedResultIdxRef.current = -1;
        sessionStartedAtRef.current = Date.now();
      };

      recognition.onresult = (event: any) => {
        lastResultAtRef.current = Date.now();
        consecutiveFailuresRef.current = 0;
        nextRetryAtRef.current = 0;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          handleTranscript(text, !!res.isFinal, i);
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
        lastAbortAtRef.current = Date.now();

        if (isContinuousRef.current) {
          const waitMs = Math.max(ABORT_COOLDOWN_MS, nextRetryAtRef.current - Date.now());
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
  }, [lang, handleTranscript, showFeedback, safeStopCurrentRecognition, registerFailure, scheduleSessionStart]);

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
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (awakeTimerRef.current) clearTimeout(awakeTimerRef.current);
      safeStopCurrentRecognition();
    };
  }, [safeStopCurrentRecognition]);

  // Efeito principal de controle da escuta contínua
  useEffect(() => {
    if (isContinuous && isSupported) {
      if (!recognitionRef.current && !isStartingRef.current) {
        startRecognitionSession();
      }
    } else {
      if (restartTimerRef.current && !oneShotPendingRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      safeStopCurrentRecognition();
    }
  }, [isContinuous, isSupported, startRecognitionSession, safeStopCurrentRecognition]);

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

      // 2. Renovação preventiva aos 45s quando ocioso, usando cooldown seguro pós-abort()
      if (
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

  // Ativação por toque manual (Push-to-Talk)
  const triggerPushToTalk = useCallback(async () => {
    if (!isSupported) {
      showFeedback('Comando de voz não suportado neste aparelho.', 'error', 3000);
      return;
    }

    if (isPlayingRef.current) {
      onWakeRef.current?.();
    }

    activateAwake(4500);
    showFeedback('🎤 Fale um comando (ex: Pause, Próximo, Volume +)', 'listening', 4500);

    if (!isMicrophonePermissionGranted()) {
      await requestMicrophonePermission();
    }

    consecutiveFailuresRef.current = 0;
    nextRetryAtRef.current = 0;
    startRecognitionSession(true);
  }, [isSupported, showFeedback, startRecognitionSession, activateAwake]);

  // Alterna o modo contínuo de escuta (wake word "Infinity")
  const toggleContinuousMode = useCallback(async () => {
    if (!isSupported) {
      showFeedback('Comando de voz não suportado neste aparelho.', 'error', 3000);
      return;
    }

    if (isContinuous) {
      setIsContinuous(false);
      isContinuousRef.current = false;
      setContinuousVoiceEnabled(false);
      oneShotPendingRef.current = false;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      deactivateAwake(0);
      safeStopCurrentRecognition();
      showFeedback('Assistente de voz desativado.', 'info', 2000);
    } else {
      if (!isMicrophonePermissionGranted()) {
        const ok = await requestMicrophonePermission();
        if (!ok && !isMicrophonePermissionGranted()) {
          showFeedback('Permissão de microfone necessária.', 'error', 3000);
          return;
        }
      }

      consecutiveFailuresRef.current = 0;
      nextRetryAtRef.current = 0;
      setIsContinuous(true);
      isContinuousRef.current = true;
      setContinuousVoiceEnabled(true);
      showFeedback('Assistente ativado! Diga "Infinity" a qualquer momento.', 'success', 3500);
      startRecognitionSession();
    }
  }, [isSupported, isContinuous, showFeedback, safeStopCurrentRecognition, startRecognitionSession, deactivateAwake]);

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
