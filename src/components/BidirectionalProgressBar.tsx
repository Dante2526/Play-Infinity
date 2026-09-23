import React from "react";
import { Sparkles, CheckCircle2 } from "lucide-react";

interface BidirectionalProgressBarProps {
  /**
   * Progresso atual de 0 a 100
   */
  progress: number;
  /**
   * Quantidade de pontos de origem / pausinhos (padrão: 4, conforme o conceito do usuário)
   */
  segments?: number;
  /**
   * Altura da barra (padrão: "h-6")
   */
  height?: string;
  /**
   * Classes extras para o contêiner externo
   */
  className?: string;
  /**
   * Se deve exibir o percentual numérico
   */
  showPercentage?: boolean;
  /**
   * Texto de status abaixo ou acima
   */
  statusText?: string;
  /**
   * Estilo do contêiner: "orange" (fiel ao desenho do usuário) | "blue" | "emerald"
   */
  colorScheme?: "orange" | "blue" | "emerald";
}

/**
 * Barra de Progresso Bidirecional Multissegmentada
 * 
 * Conceito do usuário: Em vez de carregar do início ao fim (0% à esquerda -> 100% à direita),
 * são distribuídos 3 a 4 "pausinhos" dentro da barra. Conforme o download avança, cada um
 * deles se expande simultaneamente para AMBOS os lados (esquerda e direita) até se encontrarem
 * e preencherem toda a caixa, gerando uma forte ilusão perceptiva de conclusão muito mais rápida.
 */
export function BidirectionalProgressBar({
  progress = 0,
  segments = 4,
  height = "h-6",
  className = "",
  showPercentage = true,
  statusText,
  colorScheme = "orange"
}: BidirectionalProgressBarProps) {
  // Limita o progresso entre 0 e 100
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const isCompleted = clampedProgress >= 100;

  // Paletas de cores para o contêiner e para os pausinhos
  const schemeStyles = {
    orange: {
      border: "border-2 border-orange-500/90 shadow-[0_0_15px_rgba(249,115,22,0.35)]",
      barBg: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
      glow: "from-emerald-400 to-green-500",
      accentText: "text-orange-400",
      badgeBg: "bg-orange-500/20 text-orange-300 border-orange-500/40"
    },
    blue: {
      border: "border-2 border-blue-500/90 shadow-[0_0_15px_rgba(59,130,246,0.35)]",
      barBg: "bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)]",
      glow: "from-blue-400 to-cyan-400",
      accentText: "text-blue-400",
      badgeBg: "bg-blue-500/20 text-blue-300 border-blue-500/40"
    },
    emerald: {
      border: "border-2 border-emerald-500/90 shadow-[0_0_15px_rgba(16,185,129,0.35)]",
      barBg: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
      glow: "from-emerald-400 to-teal-400",
      accentText: "text-emerald-400",
      badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    }
  }[colorScheme];

  // Gera o array de índices de segmentos (ex: [0, 1, 2, 3])
  const segmentList = Array.from({ length: Math.max(2, Math.min(6, segments)) }, (_, i) => i);

  return (
    <div className={`w-full ${className}`}>
      {/* Cabeçalho com status e porcentagem se habilitado */}
      {(statusText || showPercentage) && (
        <div className="flex items-center justify-between text-xs font-semibold mb-2">
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>100% Concluído</span>
              </span>
            ) : (
              <span className="text-neutral-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>{statusText || "Baixando em paralelo (alta velocidade)..."}</span>
              </span>
            )}
          </div>

          {showPercentage && (
            <div className="flex items-center gap-1.5">
              <span className={`font-mono font-black text-sm ${isCompleted ? "text-emerald-400" : schemeStyles.accentText}`}>
                {Math.round(clampedProgress)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* CONTÊINER PRINCIPAL (Conforme o contêiner laranja do desenho) */}
      <div 
        className={`relative w-full ${height} rounded-2xl bg-black/80 backdrop-blur-md overflow-hidden ${schemeStyles.border} transition-all duration-300 flex items-center`}
      >
        {/* Fundo sutil quadriculado / linha de centro */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_49%,rgba(255,255,255,0.03)_50%,transparent_51%)] pointer-events-none"></div>

        {/* CADA SEGMENTO COM SEU "PAUSINHO" QUE SE EXPANDE PARA AMBOS OS LADOS */}
        {segmentList.map((idx) => {
          // Quando progress é 0, mantém uma barra fina (min-width) para exibir os pausinhos iniciais
          const isZero = clampedProgress === 0;
          const widthPercent = isZero ? 0 : clampedProgress;

          return (
            <div
              key={idx}
              className="relative h-full flex items-center justify-center overflow-hidden"
              style={{ width: `${100 / segmentList.length}%` }}
            >
              {/* O pausinho interno que cresce simetricamente para esquerda e direita */}
              <div
                className={`h-full rounded-sm transition-all duration-150 ease-out ${schemeStyles.barBg} ${
                  isCompleted ? "rounded-none" : ""
                }`}
                style={{
                  // Se for 0%, exibe uma linha fina de 3.5px visível (o pausinho inicial do desenho)
                  width: isZero ? "3.5px" : `${Math.max(widthPercent, 3)}%`,
                  minWidth: isZero ? "3.5px" : undefined
                }}
              />
            </div>
          );
        })}

        {/* Efeito de brilho / luz que passa na barra quando completa */}
        {isCompleted && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse pointer-events-none"></div>
        )}
      </div>

      {/* Rodapé informativo sobre os 4 núcleos */}
      <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1.5 px-1">
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-orange-400" />
          <span>{segments} pontos de download simultâneo (MixDrop Turbo)</span>
        </span>
        <span className="font-mono text-neutral-400">
          {isCompleted ? "Download pronto" : "Expansão bidirecional ativa"}
        </span>
      </div>
    </div>
  );
}

export default BidirectionalProgressBar;
