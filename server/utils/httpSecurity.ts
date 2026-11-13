import { isPrivateOrLocalHost as defaultIsPrivateOrLocalHost } from "./helpers";

export class RedirectBlockedError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "RedirectBlockedError";
    this.statusCode = statusCode;
  }
}

export interface ValidatedRedirectOptions extends RequestInit {
  maxRedirects?: number;
  validateUrl?: (url: URL) => Promise<boolean> | boolean;
  checkPrivateHost?: (hostname: string) => Promise<boolean>;
  timeoutMs?: number;
}

/**
 * Executa fetch com redirecionamento manual validando cada salto contra SSRF
 * e contra a allowlist específica do endpoint (máximo de `maxRedirects` saltos).
 */
export async function fetchWithValidatedRedirects(
  initialUrl: string,
  options: ValidatedRedirectOptions = {}
): Promise<Response> {
  const {
    maxRedirects = 4,
    validateUrl,
    checkPrivateHost = defaultIsPrivateOrLocalHost,
    timeoutMs,
    signal: outerSignal,
    ...restInit
  } = options;
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let combinedSignal = outerSignal;

    if (timeoutMs && timeoutMs > 0) {
      controller = new AbortController();
      timer = setTimeout(() => controller?.abort(), timeoutMs);
      if (outerSignal) {
        if (outerSignal.aborted) {
          controller.abort();
        } else {
          outerSignal.addEventListener("abort", () => controller?.abort(), { once: true });
        }
      }
      combinedSignal = controller.signal;
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(currentUrl, {
        ...restInit,
        redirect: "manual",
        signal: combinedSignal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (![301, 302, 303, 307, 308].includes(upstreamRes.status)) {
      return upstreamRes;
    }

    const location = upstreamRes.headers.get("location");
    try {
      await upstreamRes.body?.cancel?.();
    } catch {}

    if (!location) {
      return upstreamRes;
    }

    if (hop === maxRedirects) {
      throw new RedirectBlockedError("Limite de redirecionamentos excedido.", 502);
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new RedirectBlockedError("Cabeçalho Location de redirecionamento inválido.", 502);
    }

    if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
      throw new RedirectBlockedError("Protocolo inválido no redirecionamento.", 403);
    }

    if (await checkPrivateHost(nextUrl.hostname)) {
      throw new RedirectBlockedError("Redirecionamento para IP privado bloqueado (Anti-SSRF).", 403);
    }

    if (validateUrl && !(await validateUrl(nextUrl))) {
      throw new RedirectBlockedError(`Redirecionamento para domínio '${nextUrl.hostname}' não autorizado.`, 403);
    }

    currentUrl = nextUrl.toString();
  }

  throw new RedirectBlockedError("Limite de redirecionamentos excedido.", 502);
}

/**
 * Lê um corpo de resposta de texto até `maxBytes` via stream (com fallback seguro para mocks)
 * para evitar OOM em manifestos ou respostas gigantes.
 */
export async function readTextWithCap(
  res: Response,
  maxBytes = 2 * 1024 * 1024
): Promise<{ text: string; exceeded: boolean }> {
  const contentLength = Number(res.headers?.get?.("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    try {
      await res.body?.cancel?.();
    } catch {}
    return { text: "", exceeded: true };
  }

  const bodyAny = res.body as any;
  if (!bodyAny || typeof bodyAny.getReader !== "function") {
    const t = typeof res.text === "function"
      ? await res.text()
      : Buffer.from(await res.arrayBuffer()).toString("utf-8");
    if (Buffer.byteLength(t, "utf8") > maxBytes) {
      return { text: "", exceeded: true };
    }
    return { text: t, exceeded: false };
  }

  const reader = bodyAny.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {}
          return { text: "", exceeded: true };
        }
        chunks.push(Buffer.from(value));
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
  return { text: Buffer.concat(chunks).toString("utf-8"), exceeded: false };
}
