const fs = require('fs');
const path = require('path');

const injection = `
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Português (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para forçar o modo showing
                              track.addEventListener('load', function() {
                                  this.mode = 'showing';
                              });
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }
`;

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log("Not found: " + filePath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let originalLength = content.length;
  
  // Find all window.addEventListener("message", function(e) { 
  // or window.addEventListener('message', function(e) {
  // or window.addEventListener('message',function(e){
  const regex = /(window\.addEventListener\s*\(\s*['"]message['"]\s*,\s*function\s*\(\s*e\s*\)\s*\{)(?!\s*if\s*\(e\.data\s*&&\s*e\.data\.type\s*===\s*'SET_SUBTITLE_URL'\))/g;
  
  content = content.replace(regex, `$1${injection}`);
  
  if (content.length > originalLength) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${filePath}`);
  } else {
    console.log(`No changes made to ${filePath} (already patched or no match)`);
  }
}

// Apagar Nuvix do serverBlocks.ts
function removeNuvix(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('"srv_nuvix"')) {
    content = content.replace(/\s*"srv_nuvix",?/, '');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Removed srv_nuvix from ${filePath}`);
  }
}

// Apagar Nuvix do nuvixRoutes.ts (deletar o arquivo)
const nuvixFile = path.join(__dirname, 'server', 'routes', 'nuvixRoutes.ts');
if (fs.existsSync(nuvixFile)) {
  fs.unlinkSync(nuvixFile);
  console.log('Deleted nuvixRoutes.ts');
}

patchFile(path.join(__dirname, 'server.ts'));
patchFile(path.join(__dirname, 'server', 'routes', 'videoScrapers.ts'));
patchFile(path.join(__dirname, 'server', 'routes', 'nixplayRoutes.ts'));
patchFile(path.join(__dirname, 'server', 'routes', 'vidsrcRoutes.ts'));
removeNuvix(path.join(__dirname, 'server', 'routes', 'serverBlocks.ts'));
