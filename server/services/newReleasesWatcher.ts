import fs from "fs";
import path from "path";
import { getAdminDb, getAdminMessaging, getAdminFieldValue } from "../firebaseAdmin";

/**
 * Watcher de NOVOS LANÇAMENTOS (filmes e séries) → push para todos os
 * usuários com notificações ativadas (notifPermission === 'granted').
 *
 * Fluxo:
 *  - Roda a cada 1h lendo encontrei-catalog.json (mesmo arquivo do
 *    catalogWatcher de episódios favoritados).
 *  - Compara os conjuntos de video_id (filmes) e serie_id (séries) com o
 *    estado persistido em data/releases-state.json.
 *  - Primeira execução (sem estado): apenas salva o estado — nunca dispara
 *    push em massa para o catálogo inteiro (mesma guarda do catalogWatcher).
 *  - Títulos: séries vêm do slug do catálogo; filmes são resolvidos via API
 *    do TMDB (pt-BR, até 4 chamadas/ciclo com timeout curto — sem título,
 *    entram na contagem do resumo).
 *  - Mensagem: 1 lançamento com nome conhecido → push específico; vários →
 *    push-resumo citando até 2 títulos + "e mais N novidades".
 *  - Cooldown global de 3h entre pushes de lançamento: se novo conteúdo
 *    aparecer durante o cooldown, o estado NÃO é atualizado e o próximo ciclo
 *    anuncia tudo junto (evita rajada de pushes quando o scraper sincroniza
 *    várias vezes seguidas).
 *  - Envio: multicast FCM em lotes de 500 tokens (limite da API), com limpeza
 *    de tokens inválidos (unregistered) dos docs dos donos.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_PATH = path.join(DATA_DIR, "encontrei-catalog.json");
const PUBLIC_CATALOG_PATH = path.join(process.cwd(), "public", "data", "encontrei-catalog.json");
const STATE_PATH = path.join(DATA_DIR, "releases-state.json");

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1h
const MIN_PUSH_INTERVAL_MS = 3 * 60 * 60 * 1000; // mínimo 3h entre pushes
const MAX_TMDB_LOOKUPS = 4; // títulos de filmes resolvidos por ciclo
const MAX_TITLES_IN_MESSAGE = 2; // títulos citados no corpo do resumo

interface ReleaseState {
  movieIds: number[];
  seriesIds: number[];
  lastPushAt: number;
}

interface ReleaseItem {
  kind: "movie" | "series";
  title: string | null;
}

// ---------------------------------------------------------------------------
// Funções puras (testáveis sem disco/rede)
// ---------------------------------------------------------------------------

/**
 * Deriva um nome legível da série a partir do slug do catálogo.
 * Ex: "presidente-curtis-dublado" -> "Presidente Curtis"
 */
export function prettySeriesNameFromSlug(slug: string): string {
  const cleaned = String(slug || "")
    .replace(/-(dublado|legendado|nacional)$/i, "")
    .replace(/-/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Monta a mensagem de push a partir dos lançamentos detectados.
 * Retorna null quando não há lançamentos.
 */
export function buildReleaseMessage(newMovies: ReleaseItem[], newSeries: ReleaseItem[]): { title: string; body: string } | null {
  const total = newMovies.length + newSeries.length;
  if (total === 0) return null;

  const named = [...newMovies, ...newSeries].filter((r) => r.title);
  const names = named.map((r) => r.title!).slice(0, MAX_TITLES_IN_MESSAGE);
  const remaining = total - names.length;

  // Um único lançamento com nome conhecido → push específico.
  if (total === 1 && named.length === 1) {
    const item = named[0];
    if (item.kind === "movie") {
      return {
        title: `🎬 Novo filme: ${item.title}`,
        body: `"${item.title}" acabou de chegar no Play Infinity. Prepare a pipoca e vem assistir!`,
      };
    }
    return {
      title: `📺 Nova série: ${item.title}`,
      body: `"${item.title}" já está disponível no Play Infinity. Começa a maratona agora!`,
    };
  }

  // Digest — cita até 2 títulos + contagem do restante.
  const parts: string[] = [];
  if (newMovies.length > 0) parts.push(`${newMovies.length} ${newMovies.length === 1 ? "filme" : "filmes"}`);
  if (newSeries.length > 0) parts.push(`${newSeries.length} ${newSeries.length === 1 ? "série" : "séries"}`);
  const digest = parts.join(" e ");

  let body: string;
  if (names.length > 0) {
    body = `Chegaram ${digest} no Play Infinity: ${names.join(", ")}`;
    body += remaining > 0 ? ` e mais ${remaining} ${remaining === 1 ? "novidade" : "novidades"}. Vem conferir!` : ". Vem conferir!";
  } else {
    body = `Chegaram ${digest} novas no Play Infinity. Vem conferir os lançamentos!`;
  }

  return {
    title: `🍿 ${digest} novas no catálogo!`,
    body,
  };
}

/**
 * Calcula os lançamentos novos comparando estado anterior com o atual.
 */
export function diffReleases(
  currentMovieIds: number[],
  currentSeriesIds: number[],
  previous: ReleaseState
): { newMovieIds: number[]; newSeriesIds: number[] } {
  const prevMovies = new Set(previous.movieIds);
  const prevSeries = new Set(previous.seriesIds);
  return {
    newMovieIds: currentMovieIds.filter((id) => !prevMovies.has(id)),
    newSeriesIds: currentSeriesIds.filter((id) => !prevSeries.has(id)),
  };
}

// ---------------------------------------------------------------------------
// Execução (disco + rede + Firestore)
// ---------------------------------------------------------------------------

function loadCatalog(): { movies: any[]; series: any[] } | null {
  const activePath = fs.existsSync(CATALOG_PATH) ? CATALOG_PATH : PUBLIC_CATALOG_PATH;
  if (!fs.existsSync(activePath)) {
    console.warn("[NewReleases] encontrei-catalog.json não encontrado.");
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(activePath, "utf-8"));
    return { movies: raw.movies || [], series: raw.series || [] };
  } catch (err) {
    console.warn("[NewReleases] Falha ao ler o catálogo:", (err as Error).message);
    return null;
  }
}

function loadState(): ReleaseState | null {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    if (!Array.isArray(raw.movieIds) || !Array.isArray(raw.seriesIds)) return null;
    return { movieIds: raw.movieIds, seriesIds: raw.seriesIds, lastPushAt: Number(raw.lastPushAt) || 0 };
  } catch {
    return null;
  }
}

function saveState(state: ReleaseState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state), "utf-8");
  } catch (err) {
    console.warn("[NewReleases] Falha ao salvar estado:", (err as Error).message);
  }
}

/** Resolve o título pt-BR de um filme via TMDB (best effort, timeout 4s). */
async function resolveMovieTitle(tmdbId: number): Promise<string | null> {
  const apiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=pt-BR`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: any = await res.json();
    return typeof data?.title === "string" && data.title.trim() ? data.title.trim() : null;
  } catch {
    return null;
  }
}

/** Extrai tokens FCM de um doc de usuário (legado + multi-dispositivo). */
function extractTokens(data: any): string[] {
  const tokens = new Set<string>();
  if (typeof data.fcmToken === "string" && data.fcmToken.trim()) tokens.add(data.fcmToken.trim());
  if (Array.isArray(data.fcmTokens)) {
    for (const t of data.fcmTokens) {
      if (typeof t === "string" && t.trim()) tokens.add(t.trim());
    }
  }
  return [...tokens];
}

async function sendReleasePush(message: { title: string; body: string }): Promise<void> {
  const db = getAdminDb();
  const messaging = getAdminMessaging();
  if (!db || !messaging) {
    console.warn("[NewReleases] Firebase Admin indisponível: push de lançamentos pulado.");
    return;
  }

  // Filtro direto: só usuários que ACEITARAM notificações persistiram
  // notifPermission === 'granted' (gravado pelo NotificationPermissionGate
  // ou pelo toggle do perfil).
  const snapshot = await db.collection("usuarios").where("notifPermission", "==", "granted").get();
  const seenDocs = new Map<string, string[]>(); // docId -> tokens do doc
  const tokenOwners = new Map<string, any[]>(); // token -> refs dos donos
  for (const docSnap of snapshot.docs) {
    const tokens = extractTokens(docSnap.data());
    if (tokens.length === 0) continue;
    seenDocs.set(docSnap.id, tokens);
    for (const token of tokens) {
      const owners = tokenOwners.get(token) || [];
      owners.push(docSnap.ref);
      tokenOwners.set(token, owners);
    }
  }
  const allTokens = [...tokenOwners.keys()];
  if (allTokens.length === 0) {
    console.info("[NewReleases] Nenhum usuário com notificações ativadas — push não enviado.");
    return;
  }

  let sent = 0;
  const invalidTokens = new Set<string>();
  for (let i = 0; i < allTokens.length; i += 500) {
    const chunk = allTokens.slice(i, i + 500);
    const payload = {
      notification: { title: message.title, body: message.body },
      webpush: {
        notification: { icon: "/logo.png", badge: "/favicon.png" },
        fcmOptions: { link: "https://play-infinity.stream" },
      },
      tokens: chunk,
    };
    const response = await messaging.sendEachForMulticast(payload as any);
    sent += response.successCount;
    response.responses.forEach((r: any, idx: number) => {
      if (!r.success && r.error) {
        const errCode = String((r.error as any)?.code || r.error?.message || "");
        if (/unregistered|invalid/i.test(errCode)) {
          invalidTokens.add(chunk[idx]);
        }
      }
    });
  }

  // Limpeza best-effort de tokens mortos (mesmo padrão do /api/admin/push).
  let cleanedInvalid = 0;
  if (invalidTokens.size > 0) {
    for (const [docId, tokens] of seenDocs.entries()) {
      const remaining = tokens.filter((t) => !invalidTokens.has(t));
      if (remaining.length === tokens.length) continue;
      try {
        const update: any = { fcmTokens: remaining };
        if (remaining.length === 0) {
          const FieldValue = getAdminFieldValue();
          update.fcmToken = FieldValue ? FieldValue.delete() : null;
        } else {
          update.fcmToken = remaining[remaining.length - 1];
        }
        await db.collection("usuarios").doc(docId).update(update);
        cleanedInvalid++;
      } catch { /* best effort */ }
    }
  }

  console.log(`[NewReleases] Push de lançamentos enviado: ${sent}/${allTokens.length} dispositivos (${snapshot.size} usuários com notif ON${cleanedInvalid ? `, ${cleanedInvalid} docs limpos` : ""}).`);
}

export async function checkNewReleases(): Promise<void> {
  try {
    const catalog = loadCatalog();
    if (!catalog) return;

    const currentMovieIds = catalog.movies
      .map((m: any) => (typeof m.video_id === "number" ? m.video_id : null))
      .filter((v: number | null): v is number => v !== null);
    const currentSeriesIds = catalog.series
      .map((s: any) => (typeof s.serie_id === "number" ? s.serie_id : null))
      .filter((v: number | null): v is number => v !== null);

    const previous = loadState();
    if (!previous) {
      // Primeira execução: salva estado sem disparar push em massa.
      saveState({ movieIds: currentMovieIds, seriesIds: currentSeriesIds, lastPushAt: 0 });
      console.log(`[NewReleases] Estado inicial salvo: ${currentMovieIds.length} filmes, ${currentSeriesIds.length} séries (sem push).`);
      return;
    }

    const { newMovieIds, newSeriesIds } = diffReleases(currentMovieIds, currentSeriesIds, previous);
    if (newMovieIds.length === 0 && newSeriesIds.length === 0) {
      // Nada novo — só sincroniza remoções do catálogo no estado.
      saveState({ movieIds: currentMovieIds, seriesIds: currentSeriesIds, lastPushAt: previous.lastPushAt });
      return;
    }

    // Cooldown global: se o último push foi há menos de 3h, NEM salva o estado
    // novo — o próximo ciclo anuncia tudo junto (evita rajada de pushes).
    const now = Date.now();
    if (previous.lastPushAt && now - previous.lastPushAt < MIN_PUSH_INTERVAL_MS) {
      console.log(`[NewReleases] ${newMovieIds.length + newSeriesIds.length} lançamentos segurados (cooldown de 3h). Serão anunciados no próximo ciclo.`);
      return;
    }

    console.log(`[NewReleases] Detectados ${newMovieIds.length} filme(s) e ${newSeriesIds.length} série(s) nova(s).`);

    // Resolve títulos: séries via slug; filmes via TMDB (até 4).
    const seriesById = new Map<number, string>();
    for (const s of catalog.series) {
      if (typeof s.serie_id === "number" && !seriesById.has(s.serie_id) && s.slug) {
        seriesById.set(s.serie_id, s.slug);
      }
    }
    const movieTmdbById = new Map<number, number>();
    for (const m of catalog.movies) {
      if (typeof m.video_id === "number" && !movieTmdbById.has(m.video_id) && typeof m.tmdb_id === "number") {
        movieTmdbById.set(m.video_id, m.tmdb_id);
      }
    }

    const newMovies: ReleaseItem[] = [];
    for (const videoId of newMovieIds.slice(0, MAX_TMDB_LOOKUPS)) {
      const tmdbId = movieTmdbById.get(videoId);
      const title = tmdbId ? await resolveMovieTitle(tmdbId) : null;
      newMovies.push({ kind: "movie", title });
    }
    for (const videoId of newMovieIds.slice(MAX_TMDB_LOOKUPS)) {
      newMovies.push({ kind: "movie", title: null });
    }

    const newSeries: ReleaseItem[] = newSeriesIds.map((serieId) => ({
      kind: "series",
      title: prettySeriesNameFromSlug(seriesById.get(serieId) || "") || null,
    }));

    const message = buildReleaseMessage(newMovies, newSeries);
    if (message) {
      await sendReleasePush(message);
    }

    saveState({ movieIds: currentMovieIds, seriesIds: currentSeriesIds, lastPushAt: now });
  } catch (err) {
    console.error("[NewReleases] Erro ao checar lançamentos:", err);
  }
}

export function startNewReleasesWatcher(): void {
  console.log("[NewReleases] Iniciando watcher de lançamentos (filmes/séries novas → push para usuários com notif ON)...");
  setTimeout(() => void checkNewReleases(), 15000); // 15s após boot (offset do catalogWatcher)
  setInterval(() => void checkNewReleases(), CHECK_INTERVAL_MS);
}
