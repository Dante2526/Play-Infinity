const cheerio = require('cheerio');
fetch('https://www.subtitlecat.com/subs/1655/Re.ZERO.Starting.Life.in.Another.World.Directors.Cut.2020.S01E01.JAPANESE.WEB-DL.NF.en%20%281%29.html')
  .then(r => r.text())
  .then(html => {
    const $ = cheerio.load(html);
    $('a').each((i, el) => {
      const h = $(el).attr('href');
      if (h && (h.includes('pt-BR') || h.includes('pt.srt'))) {
        console.log("LINK ENCONTRADO:", h);
      }
    });
  });
