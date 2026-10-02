import { useState, useEffect, useRef, useCallback } from 'react';

// Declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export interface UseVoiceSearchOptions {
  onResult?: (transcript: string) => void;
  lang?: string;
}

export function useVoiceSearch({ onResult, lang = 'pt-BR' }: UseVoiceSearchOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);

  const isStartingRef = useRef(false);
  const isListeningRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setIsSupported(false);
    }
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const createRecognitionInstance = useCallback(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return null;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isStartingRef.current = false;
        isListeningRef.current = true;
        setIsListening(true);
        setError(null);
        setInterimTranscript('');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentInterim = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            finalTranscript += text;
          } else {
            currentInterim += text;
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim);
        }

        if (finalTranscript) {
          const cleaned = finalTranscript.trim();
          setTranscript(cleaned);
          setInterimTranscript('');
          if (onResultRef.current) {
            onResultRef.current(cleaned);
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        isStartingRef.current = false;
        isListeningRef.current = false;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError('Permissão de microfone negada. Permita o acesso nas configurações do navegador.');
        } else if (event.error === 'no-speech') {
          setError('Nenhuma voz detectada. Tente falar novamente mais próximo ao microfone.');
        } else if (event.error === 'network') {
          setError('Erro de conexão ao processar voz.');
        } else if (event.error !== 'aborted') {
          setError('Não foi possível reconhecer o áudio. Tente novamente.');
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        isStartingRef.current = false;
        isListeningRef.current = false;
        setIsListening(false);
        setInterimTranscript('');
      };

      return recognition;
    } catch (err) {
      console.warn('SpeechRecognition creation error:', err);
      setIsSupported(false);
      return null;
    }
  }, [lang]);

  const startListening = useCallback(async () => {
    if (isListeningRef.current || isStartingRef.current) {
      return;
    }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setError('Busca por voz não suportada neste aparelho.');
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    isStartingRef.current = true;

    // Garante solicitação explícita de permissão do microfone no Android/WebView
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Libera as faixas de áudio imediatamente para que o SpeechRecognition possa usá-las
        stream.getTracks().forEach(track => track.stop());
      } catch (micErr: any) {
        console.warn('Microphone permission request error:', micErr);
        if (micErr?.name === 'NotAllowedError' || micErr?.name === 'PermissionDeniedError') {
          setError('Permissão de microfone negada. Permita o microfone nas configurações do app.');
          isStartingRef.current = false;
          setIsListening(false);
          return;
        }
      }
    }

    // Se já havia uma instância anterior, aborta silenciosamente
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    try {
      const recognition = createRecognitionInstance();
      if (!recognition) {
        isStartingRef.current = false;
        return;
      }
      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      isStartingRef.current = false;
      isListeningRef.current = false;
      setIsListening(false);
      // Ignora erro de já estar rodando sem propagar exceção
      if (err?.name !== 'InvalidStateError') {
        setError('Erro ao iniciar o microfone. Verifique as permissões de áudio.');
      }
    }
  }, [createRecognitionInstance]);

  const stopListening = useCallback(() => {
    isStartingRef.current = false;
    isListeningRef.current = false;
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } catch {}
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening || isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    clearError: () => setError(null)
  };
}
