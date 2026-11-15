const {test}=require('node:test');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const Module=require('node:module');
const path=require('node:path');
const compiled=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/utils/playerIntegration.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const m=new Module(__filename+'.fixture',module);m._compile(compiled.outputFiles[0].text,__filename+'.fixture');
const {isExternalIframePlayer}=m.exports;
test('BYSE wrapper keeps Netflix controls on initial selection and episode transitions',()=>{
 for(const url of ['/api/byse-proxy-iframe?id=213375&s=1&e=1','/api/byse-proxy-iframe?id=213375&s=1&e=2&start=42','https://play-infinity.stream/api/byse-proxy-iframe?fileId=a4cdcik0li1a'])assert.equal(isExternalIframePlayer(url),false);
});
test('existing integrated players keep controls and external players retain pass-through',()=>{
 for(const url of ['/api/streamtape-proxy-iframe?fileId=x','/api/md-stream?url=x','/api/native-player?url=x','/api/watchplayer-stream?id=1'])assert.equal(isExternalIframePlayer(url),false);
 assert.equal(isExternalIframePlayer('https://example.org/embed/1'),true);
 assert.equal(isExternalIframePlayer('/api/byse-proxy-iframe?id=1','https://upns.xyz/embed/1'),true);
});

test('BYSE is primary while explicit choices, saved preferences and admin exclusions are respected',()=>{
 const choose=m.exports.preferredPlaybackServer;
 assert.equal(choose(['srv_streamtape','srv_byse','srv_mixdrop']),'srv_byse');
 assert.equal(choose(['srv_byse','srv_mixdrop'],null,'srv_mixdrop'),'srv_mixdrop');
 assert.equal(choose(['srv_byse','srv_mixdrop'],'srv_byse','srv_mixdrop'),'srv_byse');
 assert.equal(choose(['srv_streamtape','srv_mixdrop'],'blocked'),'srv_streamtape');
});

test('episode advancement remains available independently of the removed Vizer player',()=>{
 const next=m.exports.computeNextEpisode({isSeries:true,season:1,episode:1,totalEpisodes:7,availableSeasons:[1],episodesList:Array.from({length:7},(_,i)=>({episode_number:i+1,name:`Episódio ${i+1}`}))});
 assert.equal(next.episode_number,2);assert.equal(next.seasonNumber,1);assert.equal(next.isNextSeason,false);
});


{
  const nodeTest = require('node:test');
  const assertStrict = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const esbuild = require('esbuild');

  const integrationPath = path.resolve(__dirname, '../src/utils/playerIntegration.ts');
  const compiled = esbuild.buildSync({
    entryPoints: [integrationPath],
    bundle: false,
    write: false,
    format: 'cjs',
    platform: 'node',
  });
  const mod = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, {
    module: mod,
    exports: mod.exports,
    require,
    console,
  });
  const { normalizeVisibleServerKey, filterVisibleServers } = mod.exports;

  const sampleServers = [
    { key: 'srv_mixdrop', internalOnly: false },
    { key: 'srv_saimo_hls', internalOnly: false },
    { key: 'srv_saimo_mp4', internalOnly: false },
    { key: 'srv_streamtape', internalOnly: true },
  ];

  nodeTest('normalizeVisibleServerKey rejeita internalOnly e normaliza srv_saimo legado', () => {
    assertStrict.equal(normalizeVisibleServerKey('srv_streamtape', sampleServers), undefined);
    assertStrict.equal(normalizeVisibleServerKey('srv_saimo', sampleServers), 'srv_saimo_hls');
    assertStrict.equal(
      normalizeVisibleServerKey('srv_saimo', [{ key: 'srv_saimo_mp4' }, { key: 'srv_streamtape', internalOnly: true }]),
      'srv_saimo_mp4'
    );
    assertStrict.equal(normalizeVisibleServerKey('srv_mixdrop', sampleServers), 'srv_mixdrop');
    assertStrict.equal(normalizeVisibleServerKey('srv_blocked', sampleServers), undefined);
  });

  nodeTest('filterVisibleServers oculta internalOnly normalmente, mas exibe quando está ativo', () => {
    const withMixdropActive = filterVisibleServers(sampleServers, 'srv_mixdrop').map((s) => s.key);
    assertStrict.deepEqual(withMixdropActive, ['srv_mixdrop', 'srv_saimo_hls', 'srv_saimo_mp4']);

    const withStreamtapeActive = filterVisibleServers(sampleServers, 'srv_streamtape').map((s) => s.key);
    assertStrict.deepEqual(withStreamtapeActive, ['srv_mixdrop', 'srv_saimo_hls', 'srv_saimo_mp4', 'srv_streamtape']);
  });

  nodeTest('VideoPlayerModal e NetflixPlayerSkin mantêm StreamTape após MixDrop e seletor visível', () => {
    const modalSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/VideoPlayerModal.tsx'), 'utf8');
    const skinSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/NetflixPlayerSkin.tsx'), 'utf8');

    const seriesMixdropIdx = modalSrc.indexOf('key: "srv_mixdrop"');
    const seriesStreamtapeIdx = modalSrc.indexOf('key: "srv_streamtape"');
    assertStrict.ok(seriesMixdropIdx !== -1 && seriesStreamtapeIdx !== -1 && seriesMixdropIdx < seriesStreamtapeIdx);

    const movieMixdropIdx = modalSrc.indexOf('key: "srv_mixdrop"', seriesMixdropIdx + 1);
    const movieStreamtapeIdx = modalSrc.indexOf('key: "srv_streamtape"', seriesStreamtapeIdx + 1);
    assertStrict.ok(movieMixdropIdx !== -1 && movieStreamtapeIdx !== -1 && movieMixdropIdx < movieStreamtapeIdx);

    assertStrict.match(modalSrc, /filterVisibleServers\(servers,\s*selectedServerKey\)/);
    assertStrict.match(modalSrc, /normalizeVisibleServerKey\(selectedServerKey,\s*serversRef\.current\)/);
    assertStrict.match(skinSrc, /selectedServerBtnRef\.current\?\.scrollIntoView/);
  });
}
