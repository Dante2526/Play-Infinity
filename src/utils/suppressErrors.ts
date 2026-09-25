export function suppressExtensionErrors() {
  const ignoredKeywords = [
    "Could not establish connection. Receiving end does not exist",
    "content-youtube-embed",
    "content-all.js",
    "all-frames.js",
    "This script should only be loaded in a browser extension",
    "e.forEach is not a function",
    "Tracking Prevention",
    "ERR_BLOCKED_BY_CLIENT"
  ];

  const shouldIgnore = (message: string) => {
    return ignoredKeywords.some(keyword => message.includes(keyword));
  };

  // Intercepta erros lançados globalmente (Uncaught Errors)
  window.addEventListener("error", (event) => {
    if (
      (event.filename && (
        event.filename.includes("content-all.js") ||
        event.filename.includes("all-frames.js") ||
        event.filename.includes("content-youtube-embed.js") ||
        event.filename.includes("extension")
      )) ||
      (event.message && shouldIgnore(event.message))
    ) {
      event.preventDefault(); // Impede o erro de aparecer no console
    }
  });

  // Intercepta promessas rejeitadas não tratadas (Uncaught in promise)
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason ? String(event.reason) : "";
    if (shouldIgnore(reason)) {
      event.preventDefault();
    }
  });

  // Intercepta console.error / console.warn manuais
  const originalError = console.error;
  console.error = (...args) => {
    const msg = args.map(String).join(" ");
    if (shouldIgnore(msg)) return;
    originalError.apply(console, args);
  };

  const originalWarn = console.warn;
  console.warn = (...args) => {
    const msg = args.map(String).join(" ");
    if (shouldIgnore(msg)) return;
    originalWarn.apply(console, args);
  };
}
