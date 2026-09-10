const fs = require('fs');
const content = fs.readFileSync('src/components/NetflixPlayerSkin.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('isExternalPlayer')) {
    console.log(`Line ${idx + 1}: ${line}`);
  }
});
