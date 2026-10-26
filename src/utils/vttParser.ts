/**
 * Parser de VTT puro (sem deps React/Firebase) — extraído de
 * NetflixPlayerSkin.tsx para ser testável em node.
 *
 * Segurança (relatório #12): o regex de strip de tags agora cobre TODAS as
 * tags HTML <...>, nao apenas timestamps VTT <00:00:01.000>. Antes,
 * <script>alert(1)</script> ou <img onerror=alert(1)> passavam intactos
 * pelo parseVtt e eram injetados no DOM via dangerouslySetInnerHTML no
 * activeCue (NetflixPlayerSkin.tsx linha 1718). Agora o texto sanitizado
 * e renderizado como texto puro (React escapa automaticamente).
 *
 * Source original: src/components/NetflixPlayerSkin.tsx linhas 112-150.
 */

export interface VttCue {
  start: number;
  end: number;
  text: string;
}

function timeToSeconds(t: string): number {
  const parts = t.trim().split(":");
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    h = parseFloat(parts[0]);
    m = parseFloat(parts[1]);
    s = parseFloat(parts[2]);
  } else {
    m = parseFloat(parts[0]);
    s = parseFloat(parts[1]);
  }
  return h * 3600 + m * 60 + s;
}

/**
 * Parseia um VTT em cues. Stripa TODAS as tags HTML do texto do cue
 * (timestamps VTT <00:00:01.000>, <i>/<b>/<u> de formatação, <script>,
 * <img>, <iframe>, etc.). O texto resultante e seguro para renderização
 * como texto puro em React (que escapa < > automaticamente).
 *
 * Edge case: texto literal com < > (raro em legendas) pode ser parcialmente
 * comido — tradeoff aceito por segurança.
 */
export function parseVtt(vttText: string): VttCue[] {
  const cues: VttCue[] = [];
  const text = vttText.replace(/^\uFEFF/, "").replace(/^WEBVTT[^\n]*\n/, "");
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const arrowIdx = lines.findIndex(l => l.includes("-->"));
    if (arrowIdx === -1) continue;
    const match = lines[arrowIdx].match(/^([\d:.,]+)\s+-->\s+([\d:.,]+)/);
    if (!match) continue;
    const start = timeToSeconds(match[1].replace(",", "."));
    const end = timeToSeconds(match[2].replace(",", "."));
    const textLines = lines.slice(arrowIdx + 1).filter(l => !l.startsWith("NOTE") && l.trim() !== "");
    if (textLines.length === 0) continue;
    // Stripa TODAS as tags HTML <...> (superset do regex antigo que so pegava
    // timestamps VTT <\d{2}:\d{2}[^>]*>). Preven XSS via legendas externas
    // do SubtitleCat injetadas no DOM via dangerouslySetInnerHTML.
    const rawText = textLines.join("\n").replace(/<[^>]+>/g, "");
    cues.push({ start, end, text: rawText });
  }
  return cues;
}
