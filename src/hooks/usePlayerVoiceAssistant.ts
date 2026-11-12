import { useState, useEffect, useRef, useCallback } from 'react';
import { parseVoiceCommand, hasWakeWord, PlayerVoiceAction } from '../utils/voiceCommandParser';
import {
  isContinuousVoiceEnabledByDefault,
  setContinuousVoiceEnabled,
  requestMicrophonePermission,
  isMicrophonePermissionGranted
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

export function usePlayerVoiceAssistant({
  onCommand,
  onWakeWordDetected,
  isPlaying = false,
  lang = 'pt-BR'
}: UsePlayerVoiceAssistantOptions) {
  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isContinuous, setIsContinuous] = useState(() => isContinuousVoiceEnabledByDefault());
  const [feedback, setFeedback] = useState<VoiceAssistantFeedback>({
    visible: false,
    text: '',
    type: 'info'
  });

  const recognitionRef = useRef<any>(null);
  const isStartingRef = useRef(false);
  const startingAtRef = useRef(0);
  const isListeningRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const lastResultAtRef = useRef(0);
  const onCommandRef = useRef(onCommand);
  const onWakeRef = useRef(onWakeWordDetected);
  const isPlayingRef = useRef(isPlaying);
  const isContinuousRef = useRef(isContinuous);
  const startSessionRef = useRef<() => void>(() => {});
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
      setFeedback(prev => ({ ...prev, visible: false }));
    }, durationMs);
  }, []);

  // Encerra a instância atual limpando handlers para evitar disparos zumbis
  const safeStopCurrentRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        const old = recognitionRef.current;
        old.onstart = null;
        old.onresult = null;
        old.onerror = null;
        old.onend = null;
        old.abort();
      } catch {}
      recognitionRef.current = null;
    }
    isListeningRef.current = false;
    setIsListening(false);
  }, []);

  const handleTranscript = useCallback((transcript: string) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;

    // Se detectou "Infinity", auto-pausa a reprodução imediatamente
    if (hasWakeWord(trimmed)) {
      if (isPlayingRef.current) {
        onWakeRef.current?.();
      }
      showFeedback('🎤 Ouvindo comando...', 'listening', 3500);
    }

    const command = parseVoiceCommand(trimmed);
    if (command) {
      showFeedback(`✓ ${command.label}`, 'success', 2500);
      onCommandRef.current(command.action, command.label);
    }
  }, [showFeedback]);

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
        sessionStartedAtRef.current = Date.now();
      };

      recognition.onresult = (event: any) => {
        lastResultAtRef.current = Date.now();
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal || text.length > 3) {
            handleTranscript(text);
          }
        }
      };

      recognition.onerror = (event: any) => {
        isStartingRef.current = false;
        const err = event.error;

        // 'no-speech' e 'aborted' são ocorrências normais em escuta contínua no Chromium.
        // NÃO devem exibir toast de erro nem desativar o assistente.
        if (err === 'no-speech' || err === 'aborted') {
          return;
        }

        if (err === 'not-allowed') {
          showFeedback('Permissão de microfone negada.', 'error', 3000);
          setIsContinuous(false);
          isContinuousRef.current = false;
          setContinuousVoiceEnabled(false);
          safeStopCurrentRecognition();
          return;
        }

        if (err === 'network') {
          // Quedas de rede temporárias
          console.warn('[VoiceAssistant] Oscilação de rede na voz, reiniciando...');
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        setIsListening(false);
        recognitionRef.current = null;
        isStartingRef.current = false;

        // Se o modo contínuo estiver ativo, agenda o reinício ultra-rápido (80ms) com nova instância
        if (isContinuousRef.current) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (isContinuousRef.current && document.visibilityState === 'visible') {
              startSessionRef.current();
            }
          }, 80);
        }
      };

      return recognition;
    } catch (err) {
      console.warn('[VoiceAssistant] Erro ao instanciar SpeechRecognition:', err);
      setIsSupported(false);
      isStartingRef.current = false;
      return null;
    }
  }, [lang, handleTranscript, showFeedback, safeStopCurrentRecognition]);

  // Inicia uma sessão de reconhecimento limpa com destravamento anti-deadlock
  const startRecognitionSession = useCallback(() => {
    if (!isSupported) return;
    if (isStartingRef.current) {
      // Se start() ficou travado sem disparar onstart por > 2s, destrava forçadamente
      if (Date.now() - startingAtRef.current < 2000) return;
      console.warn('[VoiceAssistant] Destravando start() pendente após 2s.');
    }
    isStartingRef.current = true;
    startingAtRef.current = Date.now();

    safeStopCurrentRecognition();

    const rec = createRecognition();
    if (!rec) {
      isStartingRef.current = false;
      return;
    }

    try {
      recognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      console.warn('[VoiceAssistant] Erro ao dar start no recognition:', err?.message || err);
      isStartingRef.current = false;
    }
  }, [isSupported, safeStopCurrentRecognition, createRecognition]);

  useEffect(() => {
    startSessionRef.current = startRecognitionSession;
  }, [startRecognitionSession]);

  // Checagem inicial de suporte da Web Speech API
  useEffect(() => {
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) {
      setIsSupported(false);
    }
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      safeStopCurrentRecognition();
    };
  }, [safeStopCurrentRecognition]);

  // Efeito principal de controle da escuta contínua
  useEffect(() => {
    if (isContinuous && isSupported) {
      startRecognitionSession();
    } else {
      safeStopCurrentRecognition();
    }
  }, [isContinuous, isSupported, startRecognitionSession, safeStopCurrentRecognition]);

  // Watchdog Timer Ágil (1.5s, sem reset por oscilação) + Renovação Preventiva a cada 45s
  useEffect(() => {
    if (!isContinuous || !isSupported) return;

    const watchdogInterval = setInterval(() => {
      if (!isContinuousRef.current) return;
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();

      // 1. Se não há instância ativa ou isListening está false, reanima imediatamente
      if (!recognitionRef.current || !isListeningRef.current) {
        startSessionRef.current();
        return;
      }

      // 2. Renovação preventiva aos 45s (antes do timeout silencioso de ~60s do Google Speech),
      // evitando renovar bem no meio de uma frase dita nos últimos 2.5s
      if (
        sessionStartedAtRef.current > 0 &&
        now - sessionStartedAtRef.current >= 45000 &&
        now - lastResultAtRef.current > 2500
      ) {
        startSessionRef.current();
      }
    }, 1500);

    return () => clearInterval(watchdogInterval);
  }, [isContinuous, isSupported]);

  // Reativação imediata ao voltar de segundo plano / outra aba / desbloqueio de tela
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && isContinuousRef.current && isSupported) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (isContinuousRef.current) {
            startSessionRef.current();
          }
        }, 80);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [isSupported]);

  // Ativação por toque manual (Push-to-Talk)
  const triggerPushToTalk = useCallback(async () => {
    if (!isSupported) {
      showFeedback('Comando de voz não suportado neste aparelho.', 'error', 3000);
      return;
    }

    // Se estiver tocando vídeo, pausa para escutar o comando com clareza
    if (isPlayingRef.current) {
      onWakeRef.current?.();
    }

    showFeedback('🎤 Fale um comando (ex: Pause, Próximo, Volume +)', 'listening', 4500);

    // Garante permissão
    if (!isMicrophonePermissionGranted()) {
      await requestMicrophonePermission();
    }

    startRecognitionSession();
  }, [isSupported, showFeedback, startRecognitionSession]);

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
      safeStopCurrentRecognition();
      showFeedback('Assistente de voz desativado.', 'info', 2000);
    } else {
      // Solicita permissão se ainda não foi concedida
      if (!isMicrophonePermissionGranted()) {
        const ok = await requestMicrophonePermission();
        if (!ok && !isMicrophonePermissionGranted()) {
          showFeedback('Permissão de microfone necessária.', 'error', 3000);
          return;
        }
      }

      setIsContinuous(true);
      isContinuousRef.current = true;
      setContinuousVoiceEnabled(true);
      showFeedback('Assistente ativado! Diga "Infinity" a qualquer momento.', 'success', 3500);
      startRecognitionSession();
    }
  }, [isSupported, isContinuous, showFeedback, safeStopCurrentRecognition, startRecognitionSession]);

  return {
    isSupported,
    isListening,
    isContinuous,
    feedback,
    triggerPushToTalk,
    toggleContinuousMode
  };
}
