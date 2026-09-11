const fs = require('fs');
let code = fs.readFileSync('src/components/VideoPlayerModal.tsx', 'utf8');

const targetStr = `      <div
        className={\`relative bg-[#111111] overflow-hidden flex flex-col transition-all duration-300 \${`;

const replaceStr = `      <div
        className={\`relative bg-[#111111] overflow-hidden flex flex-col transition-all duration-300 \${
          isMiniPlayer
            ? "w-[300px] xs:w-[340px] sm:w-[380px] rounded-2xl border border-neutral-700 shadow-2xl shadow-black/90"
            : isExpanded
            ? "w-screen h-screen max-w-none max-h-none border-0 rounded-none bg-black p-0 m-0"
            : "w-full max-w-5xl border border-neutral-800 rounded-2xl md:rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)] max-h-[96vh]"
        }\`}
      >
        {/* Alerta Sandbox */}
        {!isMiniPlayer && window.self !== window.top && (
          <div className="bg-orange-600/90 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Aviso de Ambiente:</strong> Alguns players bloqueiam a reprodução dentro da pré-visualização. Se encontrar erro, abra o aplicativo em uma nova guia.
              </span>
            </span>
            <a href={window.location.href} target="_blank" rel="noreferrer" className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition-colors whitespace-nowrap ml-2 cursor-pointer">
              Abrir App
            </a>
          </div>
        )}`;

// Wait, the regex logic will be cleaner.
