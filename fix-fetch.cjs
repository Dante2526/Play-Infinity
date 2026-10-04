const fs = require('fs');
const glob = require('glob');

const files = glob.sync('server/**/*.ts');
let updated = 0;

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let original = content;

  // fetch with options
  content = content.replace(/(fetch\([^,]+,\s*\{\s*)(?!.*signal\s*:)/g, '$1signal: AbortSignal.timeout(10000), ');

  // fetch without options
  content = content.replace(/(await\s+fetch\([^,{}]+)\)(\s*;)/g, '$1, { signal: AbortSignal.timeout(10000) })$2');

  if (content !== original) {
    fs.writeFileSync(f, content);
    updated++;
    console.log('Updated', f);
  }
});
console.log(updated, 'files updated.');
