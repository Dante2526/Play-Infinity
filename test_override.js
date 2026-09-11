// Mock watchplay
global.window = global;
global.loadArtPlayer = function(url, cap) { console.log("Original load:", url); }

// Our injection
const _oldLoad = window.loadArtPlayer;
window.loadArtPlayer = function(url, cap) {
  console.log("INTERCEPTED!", url, cap);
  _oldLoad(url, cap);
}

// Watchplay calls it
window.loadArtPlayer("https://abc.m3u8", "cap.vtt");
