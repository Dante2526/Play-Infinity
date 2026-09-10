/**
 * Play Infinity - Serviço de Gerenciamento e Persistência de Comentários
 * Permite que usuários comentem em filmes e séries com persistência no localStorage,
 * suporte a curtidas e sincronização de eventos.
 */

export interface CommentItem {
  id: string | number;
  itemId: string | number;
  user: string;
  avatarLetter: string;
  text: string;
  createdAt: string;
  timeAgo: string;
  likes: number;
  likedByUser?: boolean;
}

const STORAGE_PREFIX = "playinfinity_comments_";

// Comentários padrão da comunidade quando o título ainda não tem comentários próprios salvos
const DEFAULT_COMMUNITY_COMMENTS: Record<string, CommentItem[]> = {
  default: [
    {
      id: "seed-1",
      itemId: "default",
      user: "Alex99",
      avatarLetter: "A",
      text: "Incrível! Qualidade de streaming impressionante sem travamentos.",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      timeAgo: "há 2 horas",
      likes: 24,
      likedByUser: false,
    },
    {
      id: "seed-2",
      itemId: "default",
      user: "CinefiloBr",
      avatarLetter: "C",
      text: "A fotografia e o som estão impecáveis, recomendo assistir com fones.",
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      timeAgo: "há 5 horas",
      likes: 12,
      likedByUser: false,
    },
  ],
};

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "agora mesmo";
    if (diffMins < 60) return `há ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `há ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "ontem";
    return `há ${diffDays} dias`;
  } catch {
    return "recentemente";
  }
}

/**
 * Obtém a lista de comentários para um filme ou série específico
 */
export function getCommentsForItem(itemId: string | number): CommentItem[] {
  if (!itemId) return [];
  const key = `${STORAGE_PREFIX}${itemId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(c => ({
          ...c,
          timeAgo: formatTimeAgo(c.createdAt || new Date().toISOString())
        }));
      }
    }
  } catch (err) {
    console.warn(`[Comments Service] Erro ao ler comentários para item ${itemId}:`, err);
  }

  // Se ainda não houver nenhum salvo, retorna comentários semente padrão
  return (DEFAULT_COMMUNITY_COMMENTS.default || []).map(c => ({
    ...c,
    itemId,
    timeAgo: formatTimeAgo(c.createdAt)
  }));
}

/**
 * Salva a lista de comentários no localStorage
 */
function saveCommentsForItem(itemId: string | number, comments: CommentItem[]): void {
  try {
    const key = `${STORAGE_PREFIX}${itemId}`;
    localStorage.setItem(key, JSON.stringify(comments));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("playinfinity:comments_updated", {
        detail: { itemId, count: comments.length }
      }));
    }
  } catch (err) {
    console.warn(`[Comments Service] Erro ao salvar comentários para item ${itemId}:`, err);
  }
}

/**
 * Adiciona um novo comentário do usuário com persistência imediata
 */
export function addComment(
  itemId: string | number, 
  rawText: string, 
  userName: string = "Você"
): CommentItem | null {
  const text = rawText.trim();
  if (!text || !itemId) return null;

  const currentComments = getCommentsForItem(itemId);
  const now = new Date();

  const newComment: CommentItem = {
    id: `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    itemId,
    user: userName || "Você",
    avatarLetter: (userName || "V").charAt(0).toUpperCase(),
    text: text.slice(0, 500), // Limite de 500 caracteres
    createdAt: now.toISOString(),
    timeAgo: "agora mesmo",
    likes: 0,
    likedByUser: false,
  };

  const updated = [newComment, ...currentComments];
  saveCommentsForItem(itemId, updated);
  return newComment;
}

/**
 * Alterna a curtida (like) em um comentário
 */
export function toggleCommentLike(itemId: string | number, commentId: string | number): CommentItem[] {
  const currentComments = getCommentsForItem(itemId);
  const updated = currentComments.map(c => {
    if (c.id === commentId) {
      const isLiked = !c.likedByUser;
      return {
        ...c,
        likedByUser: isLiked,
        likes: isLiked ? (c.likes + 1) : Math.max(0, c.likes - 1)
      };
    }
    return c;
  });

  saveCommentsForItem(itemId, updated);
  return updated;
}
