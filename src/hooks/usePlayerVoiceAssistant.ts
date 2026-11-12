import { useState, useEffect, useRef, useCallback } from 'react';
import { parseVoiceCommand, hasWakeWord, PlayerVoiceAction } from '../utils/voiceCommandParser';

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
  const [isContinuous, setIsContinuous] = useState(false);
  const [feedback, setFeedback] = useState<VoiceAssistantFeedback>({
    visible: false,
    text: '',
    type: 'info'
  });

  const recognitionRef = useRef<any>(null);
  const onCommandRef = useRef(onCommand);
  const onWakeRef = useRef(onWakeWordDetected);
  const isPlayingRef = useRef(isPlaying);
  const isContinuousRef = useRef(isContinuous);
  const isManualListeningRef = useRef(false);
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

  // Checagem de suporte
  useEffect(() => {
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) {
      setIsSupported(false);
    }
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
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
      isManualListeningRef.current = false;
    }
  }, [showFeedback]);

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
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal || text.length > 3) {
            handleTranscript(text);
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          showFeedback('Permissão de microfone negada.', 'error', 3000);
          setIsContinuous(false);
        } else if (event.error === 'network') {
          showFeedback('Erro de rede na voz.', 'error', 2500);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // Se a escuta contínua estiver ativada, reinicia automaticamente
        if (isContinuousRef.current) {
          setTimeout(() => {
            if (isContinuousRef.current) {
              try {
                recognition.start();
              } catch {}
            }
          }, 350);
        }
      };

      return recognition;
    } catch (err) {
      console.warn('[VoiceAssistant] Erro ao criar SpeechRecognition:', err);
      setIsSupported(false);
      return null;
    }
  }, [lang, handleTranscript, showFeedback]);

  // Ativação por toque no microfone (Push-to-Talk)
  const triggerPushToTalk = useCallback(async () => {
    if (!isSupported) {
      showFeedback('Comando de voz não suportado neste aparelho.', 'error', 3000);
      return;
    }

    // Se estiver tocando, pausa para não conflitar com a voz
    if (isPlayingRef.current) {
      onWakeRef.current?.();
    }

    showFeedback('🎤 Fale um comando (ex: Pause, Próximo, Volume +)', 'listening', 4500);
    isManualListeningRef.current = true;

    // Solicita permissão se necessário
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch {}
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    const rec = createRecognition();
    if (rec) {
      recognitionRef.current = rec;
      try { rec.start(); } catch {}
    }
  }, [isSupported, showFeedback, createRecognition]);

  // Alterna o modo contínuo de escuta (wake word "Infinity")
  const toggleContinuousMode = useCallback(async () => {
    if (!isSupported) {
      showFeedback('Comando de voz não suportado neste aparelho.', 'error', 3000);
      return;
    }

    if (isContinuous) {
      setIsContinuous(false);
      isContinuousRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      showFeedback('Assistente de voz desativado.', 'info', 2000);
    } else {
      // Solicita permissão de microfone
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
        } catch {
          showFeedback('Permissão de microfone negada.', 'error', 3000);
          return;
        }
      }

      setIsContinuous(true);
      isContinuousRef.current = true;
      showFeedback('Assistente ativado! Diga "Infinity" a qualquer momento.', 'success', 3500);

      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }

      const rec = createRecognition();
      if (rec) {
        recognitionRef.current = rec;
        try { rec.start(); } catch {}
      }
    }
  }, [isSupported, isContinuous, showFeedback, createRecognition]);

  return {
    isSupported,
    isListening,
    isContinuous,
    feedback,
    triggerPushToTalk,
    toggleContinuousMode
  };
}
