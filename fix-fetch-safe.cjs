const fs = require('fs');
const glob = require('glob');

const files = glob.sync('server/**/*.ts');
let updated = 0;

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let original = content;

  // Match fetch(..., { ... })
  content = content.replace(/fetch\s*\(\s*([^,]+)\s*,\s*(\{[\s\S]*?\})\s*\)/g, (match, url, options) => {
    if (options.includes('signal')) return match; 
    const newOptions = options.replace(/^\{/, '{ signal: AbortSignal.timeout(15000),');
    return `fetch(${url}, ${newOptions})`;
  });

  // Match fetch(url) without options
  content = content.replace(/(await\s+)?fetch\s*\(\s*([^,]+?)\s*\)/g, (match, awaitStr, url) => {
    if (url.includes('{')) return match;
    return `${awaitStr || ''}fetch(${url}, { signal: AbortSignal.timeout(15000) })`;
  });

  if (content !== original) {
    fs.writeFileSync(f, content);
    updated++;
    console.log('Updated', f);
  }
});
console.log(updated, 'files updated.');
