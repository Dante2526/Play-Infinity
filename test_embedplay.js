async function test() {
  const url = 'https://embedplayapi.top/embed/299534';
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();
    console.log("Status:", res.status);
    console.log("Length:", html.length);
    console.log("HTML (first 1000):", html.substring(0, 1000));
    
    // Check for API endpoints or interesting scripts
    const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    for (const s of scriptMatches) {
        if (s.includes('fetch') || s.includes('$.ajax') || s.includes('axios')) {
            console.log("Found AJAX in script:", s.substring(0, 500));
        }
    }
  } catch(e) {
    console.log("Error:", e.message);
  }
}
test();
