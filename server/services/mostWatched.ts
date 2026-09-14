
import fs from "fs";
import path from "path";
// Fallback safe for cjs and esm
const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

interface WatchedItem {
  id: number | string;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  type: "movie" | "series";
  imageUrl?: string;
  backdropUrl?: string;
  quality?: "CAM" | "TS" | "HD" | "4K" | "FULL HD";
  playerUrl?: string;
  views: number;
  lastWatched: string;
}

const INITIAL_MOST_WATCHED: WatchedItem[] = [
  {
    id: 299534,
    tmdbId: 299534,
    title: "VINGADORES: ULTIMATO",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/9fRX8UKlIW7Lb9GqNsJVakWWFCi.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/299534",
    views: 185,
    lastWatched: new Date().toISOString()
  },
  {
    id: 66732,
    tmdbId: 66732,
    imdbId: "tt4574334",
    title: "STRANGER THINGS",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/66732/1/1",
    views: 172,
    lastWatched: new Date().toISOString()
  },
  {
    id: 533535,
    tmdbId: 533535,
    title: "DEADPOOL & WOLVERINE",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/cJFqqiDYprqExaXatu4AaoMzDG2.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/533535",
    views: 164,
    lastWatched: new Date().toISOString()
  },
  {
    id: 93405,
    tmdbId: 93405,
    title: "ROUND 6 (SQUID GAME)",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/6gcHdboppvplmBWxvROc96NJnmm.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/93405/1/1",
    views: 153,
    lastWatched: new Date().toISOString()
  },
  {
    id: 969681,
    tmdbId: 969681,
    imdbId: "tt22084616",
    title: "HOMEM-ARANHA: UM NOVO DIA",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/qeQJx07rK2xm8SD2sJxFKhE7gs0.jpg",
    quality: "CAM",
    playerUrl: "https://v1.watchplay.shop/movie/tt22084616",
    views: 147,
    lastWatched: new Date().toISOString()
  },
  {
    id: 119051,
    tmdbId: 119051,
    title: "WANDINHA",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/7rxiQrZjrer0RB9qNA8rHYFo53R.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/119051/1/1",
    views: 138,
    lastWatched: new Date().toISOString()
  },
  {
    id: 157336,
    tmdbId: 157336,
    title: "INTERESTELAR",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/6ricSDD83BClJsFdGB6x7cM0MFQ.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/5XNQBqnBwPA9yT0jZ0p3s8bbLh0.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/157336",
    views: 129,
    lastWatched: new Date().toISOString()
  },
  {
    id: 100088,
    tmdbId: 100088,
    title: "THE LAST OF US",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/ieMLFFCwdep90d67kOT0oFtv2yX.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/100088/1/1",
    views: 118,
    lastWatched: new Date().toISOString()
  },
  {
    id: 1022789,
    tmdbId: 1022789,
    title: "DIVERTIDA MENTE 2",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/lHKNS35r4RTa9GO72vdadMLxoiV.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/p5ozvmdgsmbWe0H8Xk7Rc8SCwAB.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/1022789",
    views: 105,
    lastWatched: new Date().toISOString()
  },
  {
    id: 94997,
    tmdbId: 94997,
    title: "A CASA DO DRAGÃO",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/94997/1/1",
    views: 95,
    lastWatched: new Date().toISOString()
  }
];

function getMostWatchedFilePath(): string {
  return path.join(process.cwd(), "data", "most-watched.json");
}

function loadMostWatchedFromDisk(): WatchedItem[] {
  try {
    const filePath = getMostWatchedFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("[MostWatched] Erro ao carregar arquivo na inicialização:", err);
  }
  return [...INITIAL_MOST_WATCHED];
}

// Cache em RAM carregado no boot (zero I/O bloqueante durante requisições HTTP)
const mostWatchedMemoryCache: WatchedItem[] = loadMostWatchedFromDisk();
let saveDebounceTimer: NodeJS.Timeout | null = null;
let isSavingMostWatched = false;
let hasPendingMostWatchedSave = false;

// Executa gravação atômica com trava sequencial (mutex) para eliminar condições de corrida
async function executeAtomicSaveMostWatched(): Promise<void> {
  if (isSavingMostWatched) {
    hasPendingMostWatchedSave = true;
    return;
  }
  isSavingMostWatched = true;

  try {
    const dir = path.join(process.cwd(), "data");
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = getMostWatchedFilePath();
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;

    // Serializa snapshot da memória
    const payload = JSON.stringify(mostWatchedMemoryCache, null, 2);

    // 1. Grava primeiro no arquivo temporário
    await fs.promises.writeFile(tempPath, payload, "utf-8");

    // 2. Substitui o arquivo de destino de forma atômica
    try {
      await fs.promises.rename(tempPath, filePath);
    } catch {
      // Fallback para plataformas em que rename sobre arquivo existente requer cópia explícita
      await fs.promises.copyFile(tempPath, filePath);
      await fs.promises.unlink(tempPath).catch(() => {});
    }
  } catch (err) {
    console.error("[MostWatched] Falha na persistência atômica da audiência:", err);
  } finally {
    isSavingMostWatched = false;
    // Se novas atualizações chegaram enquanto gravava no disco, processa a fila em sequência
    if (hasPendingMostWatchedSave) {
      hasPendingMostWatchedSave = false;
      executeAtomicSaveMostWatched();
    }
  }
}

// Escrita assíncrona com Debounce de 1.5s
function scheduleAsyncSaveMostWatched(): void {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    executeAtomicSaveMostWatched();
  }, 1500);
}


export type { WatchedItem };
export { INITIAL_MOST_WATCHED, mostWatchedMemoryCache, scheduleAsyncSaveMostWatched };
