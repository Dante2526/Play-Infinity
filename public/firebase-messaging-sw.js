/*
 * Service Worker do Firebase Cloud Messaging (Push Web — Play Infinity)
 * A versão do SDK importado deve casar com a versão do pacote `firebase` do projeto (12.19.0).
 */
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAvv3XgTuTfUHUH8pRdRJ8XiH98uCUcSAs",
  authDomain: "play-infinity-63eaa.firebaseapp.com",
  projectId: "play-infinity-63eaa",
  storageBucket: "play-infinity-63eaa.firebasestorage.app",
  messagingSenderId: "341774996820",
  appId: "1:341774996820:web:871c91206a157cce6ce4c1"
});

const messaging = firebase.messaging();

// Mensagens de dados em background: exibe com logotipo oficial e vibração
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || "Play Infinity";
  const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || "";
  const url = (payload.data && payload.data.url) || "/admin";
  const tag = (payload.data && payload.data.tag) || (payload.notification && payload.notification.tag) || "play-infinity-sentinel";

  self.registration.showNotification(title, {
    body,
    icon: "/logo.png",
    badge: "/favicon.png",
    data: { url },
    tag,
    vibrate: [200, 100, 200],
    renotify: true
  });
});

// Ação de toque na notificação (Samsung Internet / Chrome Mobile)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || "/admin";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Se já houver uma aba aberta com o Play Infinity, foca e redireciona para a aba certa
      for (const client of windowClients) {
        if ("focus" in client) {
          if (client.navigate) {
            client.navigate(urlToOpen);
          }
          return client.focus();
        }
      }
      // Se o navegador estiver fechado ou em outra página, abre nova janela direto no painel
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
