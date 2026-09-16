const https = require('https');

function check(id, s, e) {
  return new Promise((resolve) => {
    const req = https.request(`https://v1.watchplay.shop/tvshow/${id}/${s}/${e}`, { method: 'HEAD' }, (res) => {
      resolve({ ep: e, avail: res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302 });
      res.resume();
    });
    req.on('error', () => resolve({ ep: e, avail: false }));
    req.end();
  });
}

async function run() {
  console.time('Check');
  const promises = [];
  for(let i = 1; i <= 50; i++) promises.push(check(30984, 2, i));
  const results = await Promise.all(promises);
  console.timeEnd('Check');
  console.log('Available:', results.filter(r => r.avail).map(r => r.ep));
}
run();
