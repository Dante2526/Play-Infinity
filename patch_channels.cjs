const fs = require('fs');

const path = 'src/data/liveChannels.ts';
let content = fs.readFileSync(path, 'utf8');

const channelsToUpdate = [
  { id: 'premiere-clubes', url: 'http://up.kiwi/351921603109/34939156/898' },
  { id: 'premiere-2', url: 'http://up.kiwi/351921603109/34939156/861' },
  { id: 'sportv', url: 'http://up.kiwi/351921603109/34939156/1231' },
  { id: 'cazetv', url: 'http://up.kiwi/351921603109/34939156/296538' }
];

for (const { id, url } of channelsToUpdate) {
  const regex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?servers:\\s*\\[\\s*\\{\\s*name:\\s*'[^']+',\\s*url:\\s*')[^']+('\\s*,\\s*isProxy:\\s*true)`, 'g');
  content = content.replace(regex, `$1${url}$2`);
}

fs.writeFileSync(path, content);
