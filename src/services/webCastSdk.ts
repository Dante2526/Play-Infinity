/**
 * Google Cast Framework SDK (sender web) — carregamento tardio e wiring mínimo.
 *
 * Por que lazy (e não <script> no index.html):
 *  - evita o custo do SDK em TODOS os page views do site;
 *  - evita carregar o SDK dentro do WebView do app Android (lá o cast é do
 *    plugin nativo @caprockapps/capacitor-chromecast; o caminho web do
 *    CastModal nem roda quando Capacitor.isNativePlatform() = true);
 *  - Safari/Firefox não suportam o SDK — sem desperdício (no Safari o AirPlay
 *    segue pelo Remote Playback API dentro do CastModal).
 *
 * Receiver: CC1AD845 (Default Media Receiver) — o MESMO que o strings.xml do
 * app Android impõe ao plugin nativo. A TV busca o stream direto da URL; não
 * há registro no Google Cloud e não precisa de receiver customizado para
 * HLS/MP4. Requisito único: site em HTTPS (play-infinity.stream já está).
 */

// Default Media Receiver — mesmo app_id do Android (android/app/src/main/res/values/strings.xml).
export const CAST_DEFAULT_RECEIVER_APP_ID = 'CC1AD845';

const CAST_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

let sdkPromise: Promise<any> | null = null;
let optionsApplied = false;

/**
 * Chromium real (Chrome/Edge desktop, Chrome Android). CriOS/FxiOS/EdgiOS são
 * WebKit no iOS (o SDK não roda — AirPlay cobre o Safari). Navegador de TV não
 * transmite para TV (o fluxo natural lá é abrir o site direto pelo QR).
 */
export function isChromiumBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/CriOS|FxiOS|EdgiOS/i.test(ua)) return false;
  if (/SmartTV|SMART-TV|Tizen|Web0S|WebOS|BRAVIA|AFT[TSMB]\b|GoogleTV|Android TV|NetCast|Vidaa|Hisense|Roku|CrKey/i.test(ua)) return false;
  return /Chrome|Chromium|Edg\//.test(ua);
}

/** Instância do CastContext se o SDK já carregou; senão null. */
function getCastContext(): any | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  const CastContext = w?.cast?.framework?.CastContext;
  return CastContext ? CastContext.getInstance() : null;
}

function applyOptions(ctx: any): any {
  if (!optionsApplied) {
    try {
      ctx.setOptions({
        receiverApplicationId: CAST_DEFAULT_RECEIVER_APP_ID,
        autoJoinPolicy: 'origin_scoped',
        language: 'pt-BR'
      });
    } catch (e) {
      // setOptions duplicado em versões antigas do SDK — já configurado, segue.
    }
    optionsApplied = true;
  }
  return ctx;
}

/**
 * Carrega o SDK do Cast (uma única vez) e devolve o CastContext configurado.
 * Rejeita se o navegador não tiver Cast disponível, se a carga falhar ou se
 * estourar o timeout — o chamador decide se cai para AirPlay/Presentation.
 */
export function loadCastFramework(): Promise<any> {
  const existing = getCastContext();
  if (existing) return Promise.resolve(applyOptions(existing));
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const w = window as any;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      sdkPromise = null;
      reject(new Error('Tempo esgotado ao carregar o transmissor do Cast'));
    }, 12000);

    // O callback global precisa existir ANTES do script entrar no DOM.
    w.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (settled) return;
      const ctx = getCastContext();
      if (!isAvailable || !ctx) {
        settled = true;
        clearTimeout(timer);
        sdkPromise = null;
        reject(new Error('Cast indisponível neste navegador'));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(applyOptions(ctx));
    };

    const script = document.createElement('script');
    script.src = CAST_SDK_URL;
    script.async = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sdkPromise = null;
      reject(new Error('Falha ao carregar o transmissor do Cast'));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

/** Cancelamento do seletor nativo do Chrome NÃO é erro (mesma regra do plugin Android). */
export function isCastUserCancel(err: any): boolean {
  const reason = err == null ? '' : String((err && (err.message || err.errorCode)) || err);
  return /cancel/i.test(reason);
}

/** Monta o LoadRequest (MediaInfo + metadata + autoplay) para o receiver default. */
export function buildWebCastLoadRequest(opts: { url: string; isLive: boolean; title?: string }): any {
  const chromeAny = (window as any).chrome;
  const isHls = opts.isLive || /\.m3u8(\?|#|$)/i.test(opts.url);
  const mediaInfo = new chromeAny.cast.media.MediaInfo(
    opts.url,
    isHls ? 'application/x-mpegURL' : 'video/mp4'
  );
  mediaInfo.streamType = opts.isLive
    ? chromeAny.cast.media.StreamType.LIVE
    : chromeAny.cast.media.StreamType.BUFFERED;
  const metadata = new chromeAny.cast.media.GenericMediaMetadata();
  metadata.title = opts.title || 'Play Infinity';
  mediaInfo.metadata = metadata;
  const request = new chromeAny.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;
  return request;
}
