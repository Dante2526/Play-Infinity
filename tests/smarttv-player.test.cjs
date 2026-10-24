const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('BYSE wrapper HTML includes MANIFEST_PARSED and autoplay muted handling', () => {
  const coreFile = path.join(process.cwd(), 'server', 'services', 'byse', 'core.ts');
  const content = fs.readFileSync(coreFile, 'utf8');

  assert.ok(content.includes('window.Hls.Events.MANIFEST_PARSED'), 'Must register MANIFEST_PARSED event on Hls instance');
  assert.ok(content.includes('WATCHPLAY_AUTOPLAY_MUTED'), 'Must report autoplay muted to parent skin when sound is blocked');
  assert.ok(content.includes('v.muted = true'), 'Must mute video on play error fallback');
});

test('VideoPlayerModal includes loading safety watchdog and TCL/BrowseHere detection', () => {
  const modalFile = path.join(process.cwd(), 'src', 'components', 'VideoPlayerModal.tsx');
  const content = fs.readFileSync(modalFile, 'utf8');

  assert.ok(content.includes('loadingSafetyTimer'), 'Must have loading safety timer for the overlay');
  assert.ok(content.includes('TCL'), 'Must detect TCL in user agent');
  assert.ok(content.includes('BrowseHere'), 'Must detect BrowseHere in user agent');
  assert.ok(content.includes('setIframeVisible(true)'), 'Must force iframe visible on load safety');
});

test('NetflixPlayerSkin supports Smart TV remote control keys (Enter, MediaPlayPause)', () => {
  const skinFile = path.join(process.cwd(), 'src', 'components', 'NetflixPlayerSkin.tsx');
  const content = fs.readFileSync(skinFile, 'utf8');

  assert.ok(content.includes('case "enter":'), 'Must handle enter key for remote OK');
  assert.ok(content.includes('case "mediaplaypause":'), 'Must handle media play pause remote button');
  assert.ok(content.includes('data-tv-primary="true"'), 'Must have data-tv-primary on play button');
});

test('useSmartTV hook detects TCL TVs and BrowseHere browser', () => {
  const hookFile = path.join(process.cwd(), 'src', 'hooks', 'useSmartTV.ts');
  const content = fs.readFileSync(hookFile, 'utf8');

  assert.ok(content.includes('tcl'), 'Must include tcl in user agent check');
  assert.ok(content.includes('browsehere'), 'Must include browsehere in user agent check');
});
