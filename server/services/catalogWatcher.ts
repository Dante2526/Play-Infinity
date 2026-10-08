import fs from "fs";
import path from "path";
import { getAdminMessaging, getAdminDb } from "../firebaseAdmin";

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_PATH = path.join(DATA_DIR, "encontrei-catalog.json");
const PUBLIC_CATALOG_PATH = path.join(process.cwd(), "public", "data", "encontrei-catalog.json");
const STATE_PATH = path.join(DATA_DIR, "catalog-state.json");

interface CatalogEpisode {
  episode_id?: number;
  serie_id?: number;
  season?: number;
  episode?: number;
  tmdb_id?: number;
  audio?: string;
  [key: string]: any;
}

interface CatalogSeries {
  serie_id?: number;
  slug?: string;
  [key: string]: any;
}

interface CatalogData {
  movies?: any[];
  series?: CatalogSeries[];
  episodes?: CatalogEpisode[];
}

/**
 * Extrai todos os tokens FCM de um doc de usuário.
 * Suporta o campo legado `fcmToken` (string única) e o array `fcmTokens` (multi-dispositivo).
 */
function extractTokensFromUserDoc(data: any): string[] {
  const tokens = new Set<string>();
  if (typeof data.fcmToken === "string" && data.fcmToken.trim()) {
    tokens.add(data.fcmToken);
  }
  if (Array.isArray(data.fcmTokens)) {
    for (const t of data.fcmTokens) {
      if (typeof t === "string" && t.trim()) {
        tokens.add(t);
      }
    }
  }
  return [...tokens];
}

/**
 * Deriva um nome legível da série a partir do slug do catálogo.
 * Ex: "presidente-curtis-dublado" -> "Presidente Curtis"
 */
function prettySeriesNameFromSlug(slug: string): string {
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

export function startCatalogWatcher() {
  console.log("[CatalogWatcher] Iniciando serviço de monitoramento automático de novos episódios...");
  
  // Roda a cada 60 minutos
  setInterval(() => {
    checkCatalogUpdates();
  }, 60 * 60 * 1000);

  // Roda também na inicialização
  setTimeout(() => checkCatalogUpdates(), 10000); // 10s após boot
}

async function checkCatalogUpdates() {
  try {
    const activeCatalogPath = fs.existsSync(CATALOG_PATH) ? CATALOG_PATH : PUBLIC_CATALOG_PATH;

    if (!fs.existsSync(activeCatalogPath)) {
      console.warn("[CatalogWatcher] Arquivo encontrei-catalog.json não encontrado.");
      return;
    }

    const catalogRaw = fs.readFileSync(activeCatalogPath, "utf-8");
    const catalogData: CatalogData = JSON.parse(catalogRaw);

    const episodes = catalogData.episodes || [];

    // IMPORTANTE: contagem por tmdb_id — mesmo espaço de IDs usado no array "favoritos"
    // dos usuários no Firestore. (A versão anterior lia um campo `seriesId` inexistente,
    // o que fazia o watcher nunca detectar nenhuma atualização.)
    const currentCounts: Record<string, number> = {};
    const tmdbToSerieId = new Map<number, number>();
    for (const ep of episodes) {
      if (typeof ep.tmdb_id === "number" && ep.tmdb_id > 0) {
        currentCounts[ep.tmdb_id] = (currentCounts[ep.tmdb_id] || 0) + 1;
        if (!tmdbToSerieId.has(ep.tmdb_id) && typeof ep.serie_id === "number") {
          tmdbToSerieId.set(ep.tmdb_id, ep.serie_id);
        }
      }
    }

    // Ler estado antigo
    let previousCounts: Record<string, number> = {};
    if (fs.existsSync(STATE_PATH)) {
      try {
        previousCounts = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
      } catch {
        previousCounts = {}; // estado corrompido: recomeça baseline sem disparar push
      }
    }

    // Comparar e descobrir séries atualizadas
    const updatedTmdbIds: number[] = [];

    for (const tmdbIdStr of Object.keys(currentCounts)) {
      const current = currentCounts[tmdbIdStr];
      const previous = previousCounts[tmdbIdStr] || 0;

      // previous > 0 evita floodar push na primeira vez que a série é adicionada
      if (current > previous && previous > 0) {
        updatedTmdbIds.push(parseInt(tmdbIdStr, 10));
      }
    }

    if (updatedTmdbIds.length > 0) {
      console.log(`[CatalogWatcher] Detectados novos episódios para ${updatedTmdbIds.length} séries (TMDB: ${updatedTmdbIds.join(", ")}). Disparando Push...`);
      await sendNotificationsForUpdatedSeries(updatedTmdbIds, catalogData, tmdbToSerieId);
    }

    // Salvar o novo estado
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_PATH, JSON.stringify(currentCounts), "utf-8");

  } catch (error) {
    console.error("[CatalogWatcher] Erro ao checar catálogo:", error);
  }
}

async function sendNotificationsForUpdatedSeries(
  updatedTmdbIds: number[],
  catalogData: CatalogData,
  tmdbToSerieId: Map<number, number>
) {
  const db = getAdminDb();
  const messaging = getAdminMessaging();

  if (!db || !messaging) {
    console.warn("[CatalogWatcher] Firebase Admin indisponível: push de novos episódios pulado.");
    return;
  }

  // Mapa serie_id -> nome legível da série (via slug do catálogo)
  const seriesNameBySerieId = new Map<number, string>();
  for (const s of catalogData.series || []) {
    if (typeof s.serie_id === "number" && s.slug) {
      seriesNameBySerieId.set(s.serie_id, prettySeriesNameFromSlug(s.slug));
    }
  }

  for (const tmdbId of updatedTmdbIds) {
    try {
      // 1. Resolver o nome da série para o texto da notificação
      const serieId = tmdbToSerieId.get(tmdbId);
      const seriesName = serieId ? (seriesNameBySerieId.get(serieId) || "") : "";
      const seriesLabel = seriesName || "sua série favorita";

      // 2. Buscar usuários que favoritaram essa série.
      // O array "favoritos" no Firestore armazena TMDB IDs numéricos.
      const snapshot = await db.collection("usuarios")
        .where("favoritos", "array-contains", tmdbId)
        .get();

      if (snapshot.empty) continue;

      // 3. Coletar tokens de todos os dispositivos dos fãs
      const tokens: string[] = [];
      snapshot.forEach((docSnap: any) => {
        tokens.push(...extractTokensFromUserDoc(docSnap.data()));
      });

      if (tokens.length === 0) continue;

      const title = `Novo Episódio! 🍿`;
      const body = seriesName
        ? `Novo episódio de "${seriesName}" acaba de ficar disponível. Vem assistir no Play Infinity!`
        : `Acabou de sair um episódio inédito de uma série que está na sua Lista de Favoritos. Vem assistir!`;

      // 4. Enviar PUSH em lotes de 500 (limite do sendEachForMulticast)
      const uniqueTokens = [...new Set(tokens)];
      for (let i = 0; i < uniqueTokens.length; i += 500) {
        const chunk = uniqueTokens.slice(i, i + 500);
        const message = {
          notification: { title, body },
          tokens: chunk,
        };
        await messaging.sendEachForMulticast(message);
      }
      console.log(`[CatalogWatcher] Push enviado para ${uniqueTokens.length} dispositivos (TMDB ID: ${tmdbId}, Série: ${seriesLabel}).`);

    } catch (err) {
      console.error(`[CatalogWatcher] Erro ao notificar série TMDB ${tmdbId}:`, err);
    }
  }
}
