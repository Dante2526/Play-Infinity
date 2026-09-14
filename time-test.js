const start = Date.now();
fetch("http://localhost:3002/api/myembed-stream?id=95350&type=tv&s=1&e=5")
  .then(res => res.text())
  .then(text => {
    console.log("Time:", Date.now() - start, "ms");
    console.log("Status:", text.length);
  });
