/**
 * Serviço de Solicitação Proativa de Microfone para Assistente de Voz "Infinity"
 * Permite solicitar e validar a permissão antecipadamente (novos cadastros,
 * usuários inativos, primeiro toque no app) sem aguardar o clique no player.
 */

const PERM_KEY = 'playinfinity_mic_permission';
const PROMPTED_KEY = 'playinfinity_mic_prompted_at';
const CONTINUOUS_VOICE_KEY = 'playinfinity_voice_continuous';

export type MicPermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

function emitPermissionChanged(status: 'granted' | 'denied', error?: string) {
  try {
    window.dispatchEvent(
      new CustomEvent('playinfinity:mic_permission_changed', {
        detail: error ? { status, error } : { status }
      })
    );
  } catch {}
}

/**
 * Sincroniza o estado persistido da permissão de microfone no localStorage.
 */
export function syncMicrophonePermission(status: 'granted' | 'denied' | 'prompt') {
  if (typeof window === 'undefined') return;
  if (status === 'prompt') {
    localStorage.removeItem(PERM_KEY);
    return;
  }
  localStorage.setItem(PERM_KEY, status);
}

/**
 * Verifica o status atual da permissão de microfone.
 * Consulta a Permissions API primeiro para não confiar em cache obsoleto.
 */
export async function checkMicrophonePermissionStatus(): Promise<MicPermissionState> {
  if (typeof window === 'undefined') return 'unsupported';

  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as any });
      if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
        syncMicrophonePermission(status.state);
        return status.state;
      }
    } catch {
      // Navegadores/WebViews sem suporte a query de microfone caem no cache local
    }
  }

  return (localStorage.getItem(PERM_KEY) as MicPermissionState) || 'prompt';
}

/**
 * Solicita a permissão do microfone via getUserMedia.
 * Encerra os tracks imediatamente após obter a permissão para não prender o hardware.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || !mediaDevices.getUserMedia) {
    console.warn('[VoicePermission] getUserMedia não suportado neste ambiente.');
    return false;
  }

  try {
    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch {
      stream = await mediaDevices.getUserMedia({ audio: true });
    }
    // Fecha imediatamente todas as faixas para liberar o microfone
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });

    syncMicrophonePermission('granted');
    localStorage.setItem(PROMPTED_KEY, Date.now().toString());
    // Ativa por padrão o modo contínuo se a permissão foi concedida
    if (localStorage.getItem(CONTINUOUS_VOICE_KEY) === null) {
      localStorage.setItem(CONTINUOUS_VOICE_KEY, 'true');
    }

    emitPermissionChanged('granted');

    return true;
  } catch (err: any) {
    console.warn('[VoicePermission] Permissão de microfone não concedida:', err?.name || err);
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      syncMicrophonePermission('denied');
    }
    localStorage.setItem(PROMPTED_KEY, Date.now().toString());

    emitPermissionChanged('denied', err?.name);

    return false;
  }
}

/**
 * Retorna true se a permissão já foi salva como concedida.
 */
export function isMicrophonePermissionGranted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PERM_KEY) === 'granted';
}

/**
 * Retorna true se o modo de assistente contínuo deve ser iniciado ativado.
 */
export function isContinuousVoiceEnabledByDefault(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(CONTINUOUS_VOICE_KEY);
  if (stored !== null) {
    return stored === 'true';
  }
  // Se já tem permissão concedida, ativa por padrão
  return isMicrophonePermissionGranted();
}

/**
 * Salva a preferência do modo contínuo de voz.
 */
export function setContinuousVoiceEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONTINUOUS_VOICE_KEY, enabled ? 'true' : 'false');
}
