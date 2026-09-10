async function testLocalServer() {
  try {
    const res = await fetch("http://localhost:3000/api/health");
    console.log("Status localhost:3000:", res.status);
    const data = await res.json();
    console.log("Health:", data);
  } catch (e) {
    console.log("Erro ao conectar em localhost:3000:", e.message);
  }
}

testLocalServer();
