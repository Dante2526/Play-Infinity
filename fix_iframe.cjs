const fs = require('fs');
let code = fs.readFileSync('src/components/VideoPlayerModal.tsx', 'utf8');

const targetStr = `      <div
        className={\`relative bg-[#111111] overflow-hidden flex flex-col transition-all duration-300 \${
          isMiniPlayer
            ? "w-[300px] xs:w-[340px] sm:w-[380px] rounded-2xl border border-neutral-700 shadow-2xl shadow-black/90"
            : isExpanded
            ? "w-screen h-screen max-w-none max-h-none border-0 rounded-none bg-black p-0 m-0"
            : "w-full max-w-5xl border border-neutral-800 rounded-2xl md:rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)] max-h-[96vh]"
        }\`}
      >`;

const replaceStr = targetStr + `
        {/* Alerta Sandbox */}
        {!isMiniPlayer && (() => { try { return window.self !== window.top; } catch(e){ return true; } })() && (
          <div className="bg-orange-600 text-white text-[11px] sm:text-xs font-semibold px-3 py-1.5 sm:px-4 sm:py-2 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">
                <strong>Aviso de Ambiente:</strong> Alguns players bloqueiam a reprodução dentro da pré-visualização. Se encontrar erro, abra o aplicativo em uma nova guia.
              </span>
              <span className="sm:hidden">
                Players bloqueados na pré-visualização.
              </span>
            </span>
            <button onClick={() => window.open(window.location.href, '_blank')} className="bg-white/20 hover:bg-white/30 px-2 py-1 sm:px-3 sm:py-1 rounded transition-colors whitespace-nowrap ml-2 cursor-pointer flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 hidden sm:block" /> Abrir App
            </button>
          </div>
        )}`;

if (code.includes('isMiniPlayer')) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('src/components/VideoPlayerModal.tsx', code);
  console.log("Successfully injected banner");
} else {
  console.log("Could not find target");
}
