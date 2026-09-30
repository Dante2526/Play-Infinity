const cheerio = require('cheerio');
fetch('https://www.subtitlecat.com/index.php?search=Re+ZERO+Starting+Life+in+Another+World+S01E01')
  .then(r => r.text())
  .then(h => {
    const $ = cheerio.load(h);
    const href = $('tbody tr td a').first().attr('href');
    console.log("First link:", href);
    if(href) {
       fetch('https://www.subtitlecat.com/' + href).then(r=>r.text()).then(html => {
          const $2 = cheerio.load(html);
          let dl = '';
          $2('a').each((i, el) => {
             const h2 = $2(el).attr('href');
             if(h2 && h2.includes('pt-BR')) dl = h2;
          });
          console.log("DL:", dl);
       });
    }
  });
