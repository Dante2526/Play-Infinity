const fs = require('fs');
let code = fs.readFileSync('src/components/VideoPlayerModal.tsx', 'utf8');

const targetStr = `<button onClick={() => window.open(window.location.href, '_blank')} className="bg-white/20 hover:bg-white/30 px-2 py-1 sm:px-3 sm:py-1 rounded transition-colors whitespace-nowrap ml-2 cursor-pointer flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 hidden sm:block" /> Abrir App
            </button>`;

const replaceStr = `<a href={window.location.href} target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/30 px-2 py-1 sm:px-3 sm:py-1 rounded transition-colors whitespace-nowrap ml-2 cursor-pointer flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 hidden sm:block" /> Abrir App
            </a>`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('src/components/VideoPlayerModal.tsx', code);
  console.log("Replaced button with a tag");
} else {
  console.log("Could not find button");
}
