async function checkDevtools() {
  const res = await fetch("https://v1.watchplay.shop/js/devtools/devtools.js?v=1.0");
  const text = await res.text();
  console.log("Devtools length:", text.length);
  console.log(text.slice(0, 1000));
}

checkDevtools();
