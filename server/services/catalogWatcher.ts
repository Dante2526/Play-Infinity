import fs from "fs";
import path from "path";
import { getAdminMessaging, getAdminDb } from "../firebaseAdmin";

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_PATH = path.join(DATA_DIR, "encontrei-catalog.json");
const PUBLIC_CATALOG_PATH = path.join(process.cwd(), "public", "data", "encontrei-catalog.json");
const STATE_PATH = path.join(DATA_DIR, "catalog-state.json");

interface Episode {
  id: number;
  seriesId: number;
  season: number;
  episode: number;
  [key: string]: any;
}

interface Movie {
  id: number;
  title: string;
  [key: string]: any;
}

interface CatalogData {
  movies?: Movie[];
  episodes?: Episode[];
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
    let activeCatalogPath = fs.existsSync(CATALOG_PATH) ? CATALOG_PATH : PUBLIC_CATALOG_PATH;
    
    if (!fs.existsSync(activeCatalogPath)) {
      console.warn("[CatalogWatcher] Arquivo encontrei-catalog.json não encontrado.");
      return;
    }

    const catalogRaw = fs.readFileSync(activeCatalogPath, "utf-8");
    const catalogData: CatalogData = JSON.parse(catalogRaw);

    const episodes = catalogData.episodes || [];
    
    // Agrupar contagem por seriesId
    const currentCounts: Record<string, number> = {};
    for (const ep of episodes) {
      if (ep.seriesId) {
        currentCounts[ep.seriesId] = (currentCounts[ep.seriesId] || 0) + 1;
      }
    }

    // Ler estado antigo
    let previousCounts: Record<string, number> = {};
    if (fs.existsSync(STATE_PATH)) {
      previousCounts = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    }

    // Comparar e descobrir novas séries atualizadas
    const updatedSeriesIds: string[] = [];
    
    for (const seriesId of Object.keys(currentCounts)) {
      const current = currentCounts[seriesId];
      const previous = previousCounts[seriesId] || 0;
      
      if (current > previous && previous > 0) { // previous > 0 evita floodar push na primeira vez que a série é adicionada
        updatedSeriesIds.push(seriesId);
      }
    }

    if (updatedSeriesIds.length > 0) {
      console.log(`[CatalogWatcher] Detectados novos episódios para ${updatedSeriesIds.length} séries. Disparando Push...`);
      await sendNotificationsForUpdatedSeries(updatedSeriesIds, catalogData);
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

async function sendNotificationsForUpdatedSeries(updatedSeriesIds: string[], catalogData: CatalogData) {
  const db = getAdminDb();
  const messaging = getAdminMessaging();

  if (!db || !messaging) return;

  for (const seriesId of updatedSeriesIds) {
    try {
      // 1. Achar o nome da série 
      // O catálogo não tem o array 'series', então pegaremos do TMDB local se existir.
      let seriesName = `sua série favorita`;
      
      // Buscar usuários que favoritaram esse seriesId
      // Como 'favoritos' é array numérico, fazemos a query correspondente.
      const sIdNum = parseInt(seriesId, 10);
      
      const snapshot = await db.collection("usuarios")
        .where("favoritos", "array-contains", sIdNum)
        .get();
        
      if (snapshot.empty) continue;

      let tokens: string[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.fcmToken) {
          tokens.push(data.fcmToken);
        }
      });

      if (tokens.length > 0) {
        // Enviar PUSH
        const title = `Novo Episódio! 🍿`;
        const body = `Acabou de sair um episódio inédito de uma série que está na sua Lista de Favoritos. Vem assistir!`;
        
        // Push em lotes de 500
        for (let i = 0; i < tokens.length; i += 500) {
          const chunk = tokens.slice(i, i + 500);
          const message = {
            notification: { title, body },
            tokens: chunk,
          };
          await messaging.sendEachForMulticast(message);
        }
        console.log(`[CatalogWatcher] Push enviado para ${tokens.length} usuários (Série ID: ${seriesId}).`);
      }
      
    } catch (err) {
      console.error(`[CatalogWatcher] Erro ao notificar série ${seriesId}:`, err);
    }
  }
}
