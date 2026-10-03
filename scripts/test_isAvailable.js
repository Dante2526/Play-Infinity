import fetch from 'node-fetch';

async function test() {
    try {
        const url = 'http://localhost:3000/api/myembed-stream?id=939243&type=movie';
        const res = await fetch(url);
        const text = await res.text();
        console.log("has UNAVAILABLE:", text.includes("UNAVAILABLE"));
    } catch (e) {
        console.log(e);
    }
}
test();
