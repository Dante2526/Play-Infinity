/**
 * Server Blocks — bloqueio de servidor específico para conteúdo específico
 *
 * Permite ao admin bloquear/ignorar um servidor (ex: srv_watchplay) para
 * um filme/série específico (ex: F1: O Filme, TMDB 911430) sem afetar
 * os demais servidores do app.
 *
 * Armazenamento: data/server-blocks.json (file-based, persistente, single-VPS)
 * Em memória: carregado 1x, atualizado em write-through.
 *
 * Endpoints:
 *   GET  /api/server-blocks               — lista todos os blocks (admin UI)
 *   GET  /api/server-blocks?tmdb_id=X     — lista server_keys bloqueados para X
 *   POST /api/admin/server-blocks         — adiciona um block
 *   DELETE /api/admin/server-blocks/:id   — remove um block
 *
 * Auth admin: header x-admin-token (Firebase UID do Firestore "administradores")
 */
import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";

const router = Router();

interface ServerBlock {
  id: string;              // `${tmdbId}_${serverKey}`
  tmdbId: number;
  serverKey: string;       // ex: "srv_watchplay", "srv_mixdrop", "srv_vip", "srv_nixplay", "srv_vidsrc"
  contentType: "movie" | "series";
  title: string;
  reason: string;
  blockedAt: string;       // ISO timestamp
  blockedBy: string;       // admin email
}

const BLOCKS_FILE = path.join(process.cwd(), "data", "server-blocks.json");
const BLOCKS_DIR = path.dirname(BLOCKS_FILE);

// In-memory cache
let _blocks: ServerBlock[] = [];
let _blocksByTmdb: Map<number, Set<string>> = new Map(); // tmdbId → Set<serverKey>
let _loaded = false;

const ADMIN_TOKEN_HEADER = "x-admin-token";

/** Lê o arquivo de blocks do disco e popula o cache em memória */
function loadBlocks(): void {
  try {
    if (!fs.existsSync(BLOCKS_FILE)) {
      // Cria dir se não existe
      if (!fs.existsSync(BLOCKS_DIR)) {
        fs.mkdirSync(BLOCKS_DIR, { recursive: true });
      }
      // Seed inicial com os blocks hardcoded anteriores
      const seed: ServerBlock[] = [
        {
          id: "911430_srv_watchplay",
          tmdbId: 911430,
          serverKey: "srv_watchplay",
          contentType: "movie",
          title: "F1: O Filme",
          reason: "Versão WatchPlayer estava em inglês; outras fontes têm PT-BR",
          blockedAt: new Date().toISOString(),
          blockedBy: "system-seed",
        },
        {
          id: "969681_srv_watchplay",
          tmdbId: 969681,
          serverKey: "srv_watchplay",
          contentType: "movie",
          title: "Homem-Aranha: Um Novo Dia",
          reason: "Versão WatchPlayer estava em inglês; outras fontes têm PT-BR",
          blockedAt: new Date().toISOString(),
          blockedBy: "system-seed",
        },
      ];
      fs.writeFileSync(BLOCKS_FILE, JSON.stringify(seed, null, 2), "utf-8");
      _blocks = seed;
    } else {
      const raw = fs.readFileSync(BLOCKS_FILE, "utf-8");
      _blocks = JSON.parse(raw || "[]");
    }
  } catch (err) {
    console.warn("[server-blocks] Falha ao carregar:", err);
    _blocks = [];
  }
  _blocksByTmdb.clear();
  for (const b of _blocks) {
    if (!_blocksByTmdb.has(b.tmdbId)) {
      _blocksByTmdb.set(b.tmdbId, new Set());
    }
    _blocksByTmdb.get(b.tmdbId)!.add(b.serverKey);
  }
  _loaded = true;
}

/** Garante que o cache está carregado antes de qualquer operação */
function ensureLoaded(): void {
  if (!_loaded) {
    loadBlocks();
  }
}

/** Salva o array atual de blocks no disco (write-through) */
function persistBlocks(): void {
  try {
    if (!fs.existsSync(BLOCKS_DIR)) {
      fs.mkdirSync(BLOCKS_DIR, { recursive: true });
    }
    fs.writeFileSync(BLOCKS_FILE, JSON.stringify(_blocks, null, 2), "utf-8");
  } catch (err) {
    console.error("[server-blocks] Falha ao persistir:", err);
  }
}

/**
 * Verifica token de admin consultando Firestore "administradores" via SDK admin.
 * Como este projeto usa Firebase client SDK no backend (server.ts inicializa db),
 * usamos db.collection("administradores").doc(token).get() — não precisa de Admin SDK.
 *
 * Caso o token seja "system-seed" (deploy script), permite operação (não usar em prod).
 */
async function isAdminToken(req: Request): Promise<boolean> {
  const token = req.header(ADMIN_TOKEN_HEADER);
  if (!token) return false;

  // Bypass apenas para scripts de deploy automatizados (não exibir no client)
  if (token === "system-seed" && process.env.NODE_ENV !== "production") {
    return true;
  }

  try {
    // db é exportado por server.ts (.Firebase backend SDK)
    const { db } = await import("../../server");
    if (!db) return false;
    // Como server.ts exporta db com client SDK do Firebase JS, usamos getDoc via dynamic import
    const { getDoc, doc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, "administradores", token));
    return snap.exists();
  } catch (err) {
    console.warn("[server-blocks] Auth check falhou:", err);
    return false;
  }
}

/** Valida serverKey contra whitelist */
const VALID_SERVER_KEYS = new Set([
  "srv_watchplay",
  "srv_mixdrop",
  "srv_vip",
  "srv_nixplay",
  "srv_vidsrc",
]);

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * GET /api/server-blocks
 *   Sem query: retorna todos os blocks (para UI do admin)
 *   ?tmdb_id=X: retorna { tmdbId, blockedServerKeys: string[] } (para VideoPlayerModal)
 */
router.get("/api/server-blocks", async (req: Request, res: Response) => {
  try {
    ensureLoaded();
    const tmdbIdParam = req.query.tmdb_id as string | undefined;
    if (tmdbIdParam) {
      const tmdbId = parseInt(tmdbIdParam, 10);
      if (isNaN(tmdbId)) {
        return res.status(400).json({ error: "tmdb_id inválido" });
      }
      const blocked = _blocksByTmdb.get(tmdbId) || new Set<string>();
      return res.json({
        success: true,
        tmdbId,
        blockedServerKeys: Array.from(blocked),
      });
    }
    // Sem tmdb_id → retorna lista completa (admin)
    return res.json({
      success: true,
      blocks: _blocks,
    });
  } catch (err: any) {
    console.error("[server-blocks] GET error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * POST /api/admin/server-blocks
 * Body: { tmdbId, serverKey, contentType, title, reason }
 * Header: x-admin-token (Firebase admin UID)
 */
router.post("/api/admin/server-blocks", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const { tmdbId, serverKey, contentType, title, reason } = req.body || {};
    if (typeof tmdbId !== "number" || isNaN(tmdbId)) {
      return res.status(400).json({ error: "tmdbId deve ser número" });
    }
    if (typeof serverKey !== "string" || !VALID_SERVER_KEYS.has(serverKey)) {
      return res.status(400).json({
        error: `serverKey inválido. Válidos: ${Array.from(VALID_SERVER_KEYS).join(", ")}`,
      });
    }
    if (contentType && !["movie", "series"].includes(contentType)) {
      return res.status(400).json({ error: "contentType deve ser 'movie' ou 'series'" });
    }

    ensureLoaded();

    const id = `${tmdbId}_${serverKey}`;
    const newBlock: ServerBlock = {
      id,
      tmdbId,
      serverKey,
      contentType: contentType || "movie",
      title: String(title || "").slice(0, 200),
      reason: String(reason || "").slice(0, 500),
      blockedAt: new Date().toISOString(),
      blockedBy: req.header(ADMIN_TOKEN_HEADER) || "unknown",
    };

    // Remove block anterior com mesmo id (upsert)
    _blocks = _blocks.filter(b => b.id !== id);
    _blocks.push(newBlock);

    // Atualiza índice em memória
    if (!_blocksByTmdb.has(tmdbId)) {
      _blocksByTmdb.set(tmdbId, new Set());
    }
    _blocksByTmdb.get(tmdbId)!.add(serverKey);

    persistBlocks();

    return res.json({
      success: true,
      block: newBlock,
      totalBlocks: _blocks.length,
    });
  } catch (err: any) {
    console.error("[server-blocks] POST error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * DELETE /api/admin/server-blocks/:id
 * Header: x-admin-token
 */
router.delete("/api/admin/server-blocks/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "id obrigatório" });
    }

    ensureLoaded();

    const before = _blocks.length;
    const removed = _blocks.find(b => b.id === id);
    _blocks = _blocks.filter(b => b.id !== id);

    if (_blocks.length === before) {
      return res.status(404).json({ error: "Block não encontrado" });
    }

    // Rebuild índice por tmdbId (remoção)
    _blocksByTmdb.clear();
    for (const b of _blocks) {
      if (!_blocksByTmdb.has(b.tmdbId)) {
        _blocksByTmdb.set(b.tmdbId, new Set());
      }
      _blocksByTmdb.get(b.tmdbId)!.add(b.serverKey);
    }

    persistBlocks();

    return res.json({
      success: true,
      removed,
      totalBlocks: _blocks.length,
    });
  } catch (err: any) {
    console.error("[server-blocks] DELETE error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * PATCH /api/admin/server-blocks/:id
 * Atualiza o motivo de um bloqueio existente
 * Body: { reason: string }
 * Header: x-admin-token
 */
router.patch("/api/admin/server-blocks/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "id obrigatório" });
    }

    const { reason } = req.body || {};
    ensureLoaded();

    const block = _blocks.find(b => b.id === id);
    if (!block) {
      return res.status(404).json({ error: "Block não encontrado" });
    }

    block.reason = typeof reason === "string" ? reason.trim() : "";
    persistBlocks();

    return res.json({
      success: true,
      block,
    });
  } catch (err: any) {
    console.error("[server-blocks] PATCH error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
