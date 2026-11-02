/**
 * Harness de simulação do provedor AnimesDigital com a SKIN NETFLIX REAL.
 *
 * Monta o componente NetflixPlayerSkin genuíno (src/components/) sobre o
 * iframe /api/anidigital-proxy-iframe — mesma topologia do VideoPlayerModal:
 * skin overlay + iframe player com protocolo postMessage WATCHPLAY.
 *
 * Servido pelo próprio backend em /sim/anidigital (build via
 * scripts/build-anidigital-sim.cjs → scratch/anidigital-sim/).
 *
 * Query params:
 *   name=Tank Chair  → título a buscar no animesdigital
 *   e=5              → episódio
 *   type=tv|movie    → default tv
 *   audio=leg|dub    → default leg
 */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NetflixPlayerSkin } from "../../src/components/NetflixPlayerSkin";
import "../../src/index.css";

const qs = new URLSearchParams(window.location.search);
const NAME = qs.get("name") || "Tank Chair";
const EP = Number(qs.get("e") || 5);
const TYPE = qs.get("type") === "movie" ? "movie" : "tv";
const AUDIO = qs.get("audio") === "dub" ? "dub" : "leg";

const iframeParams = new URLSearchParams({ name: NAME, type: TYPE, audio: AUDIO });
if (TYPE === "tv") {
  iframeParams.set("s", "1");
  iframeParams.set("e", String(EP));
}
const IFRAME_SRC = `/api/anidigital-proxy-iframe?${iframeParams}`;

const SERVERS = [
  { key: "srv_anidigital", label: "Anime Digital", name: "AnimesDigital", badge: "Anime FHD • Legendado/Dublado" },
  { key: "srv_byse", label: "BYSE HD", name: "BYSE", badge: "HLS • Player integrado" },
];

function SimApp() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<string>("iniciando");
  const [log, setLog] = useState<string[]>([]);
  const simRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    const sim = simRef.current;
    (window as any).__SIM__ = sim;
    const t0 = Date.now();
    const push = (line: string) => setLog((prev) => [...prev.slice(-40), line]);

    sim.iframeSrc = IFRAME_SRC;
    sim.startedAt = t0;

    const onMessage = (e: MessageEvent) => {
      const d: any = e.data;
      if (!d || typeof d.type !== "string") return;
      if (d.type === "WATCHPLAY_STATUS") {
        sim.currentTime = d.currentTime;
        sim.duration = d.duration;
        sim.paused = d.paused;
        sim.readyState = d.readyState;
        sim.buffered = d.buffered;
        sim.lastStatusAt = Date.now();
        setStatus(
          `${d.paused ? "⏸ pausado" : "▶ reproduzindo"} • t=${Number(d.currentTime || 0).toFixed(1)}s` +
          ` / ${Number(d.duration || 0).toFixed(0)}s • buffer=${Number(d.buffered || 0).toFixed(1)}s`
        );
      } else if (d.type === "WATCHPLAY_VIDEO_PLAYING") {
        push(`▶ PLAY confirmado pelo player (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } else if (d.type === "WATCHPLAY_VIDEO_PAUSED") {
        push(`⏸ PAUSE confirmado pelo player (t=${Number(sim.currentTime || 0).toFixed(1)}s)`);
      } else if (d.type === "WATCHPLAY_VIDEO_ENDED") {
        push("🏁 ENDED");
      } else if (d.type === "WATCHPLAY_ERROR") {
        push(`🚨 ERRO: ${d.reason}`);
        sim.error = d.reason;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
      {/* Mesma topologia do VideoPlayerModal: iframe embaixo, skin por cima */}
      <iframe
        ref={iframeRef}
        src={IFRAME_SRC}
        title={NAME}
        style={{ backgroundColor: "#000", width: "100%", height: "100%", border: 0 }}
        allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *; screen-wake-lock; accelerometer; gyroscope"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <NetflixPlayerSkin
        title={NAME}
        isSeries={TYPE === "tv"}
        season={1}
        episode={EP}
        onClose={() => setLog((prev) => [...prev.slice(-40), "[ui] close"])}
        onSkipIntro={() => {}}
        skipDurationSeconds={75}
        isIntroActive={false}
        isFullscreen={false}
        onToggleFullscreen={() => {}}
        iframeRef={iframeRef}
        activeServerKey="srv_anidigital"
        serversList={SERVERS}
        onServerChange={() => {}}
        mediaId={`sim:${NAME}`}
      />
      {/* Painel de telemetria da simulação (canto superior esquerdo) */}
      <div
        style={{
          position: "fixed",
          top: 8,
          left: 8,
          zIndex: 99999,
          background: "rgba(0,0,0,0.82)",
          color: "#7dd3fc",
          font: "12px/1.5 ui-monospace, monospace",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid rgba(125,211,252,0.35)",
          maxWidth: 430,
          pointerEvents: "none",
        }}
      >
        <div style={{ color: "#e50914", fontWeight: 700, marginBottom: 4 }}>
          SIMULAÇÃO ANIMESDIGITAL • skin Netflix real • {NAME} {TYPE === "tv" ? `EP${EP}` : ""}
        </div>
        <div>{status}</div>
        <div style={{ color: "#94a3b8", marginTop: 4, maxHeight: 120, overflow: "hidden" }}>
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<SimApp />);
