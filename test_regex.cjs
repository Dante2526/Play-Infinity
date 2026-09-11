const html = `class="episodeOption active" data-contentid="17243" data-season="1" data-episode="1"`;
const match1 = html.match(/data-contentid=["'](\d+)["'][^>]*data-season=["']1["'][^>]*data-episode=["']1["']/i);
console.log(match1);
