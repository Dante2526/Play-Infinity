import { getApiBaseUrl } from '../utils/apiBaseUrl';

let activeController: AbortController | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function triggerBysePrewarm(input: {
  id: number;
  type?: 'movie' | 'tv' | 'series';
  season?: number;
  episode?: number;
  name?: string;
}) {
  // 1. Limpa qualquer timer anterior pendente (se o usuário mudou de item em < 1.5s)
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // 2. Aborta qualquer requisição anterior que estivesse rodando (limite estrito de 1 por cliente)
  if (activeController) {
    activeController.abort();
    activeController = null;
  }

  const numId = Number(input.id);
  if (!Number.isInteger(numId) || numId < 1) return;

  // 3. Debounce de 1.5 segundos (tempo de intenção do usuário: evita estourar ao folhear vários itens)
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const controller = new AbortController();
    activeController = controller;

    const mediaType = input.type === 'tv' || input.type === 'series' ? 'tv' : 'movie';
    const params = new URLSearchParams({
      id: String(numId),
      type: mediaType,
      s: String(input.season || 1),
      e: String(input.episode || 1),
      name: (input.name || '').slice(0, 160),
    });

    const url = `${getApiBaseUrl()}/api/byse-resolve?${params.toString()}`;

    fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (data?.success && data?.fileId) {
          // Aquecimento completado silenciosamente com sucesso em background
        }
      })
      .catch(() => {
        // Ignora erros de abort ou rede (aquecimento oportunista e não-bloqueante)
      })
      .finally(() => {
        if (activeController === controller) {
          activeController = null;
        }
      });
  }, 1500);
}

export function cancelBysePrewarm() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
}
