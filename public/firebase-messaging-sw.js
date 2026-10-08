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

// Mensagens de dados (data-only) em background: exibe manualmente.
// Mensagens com bloco `notification` são exibidas automaticamente pelo navegador.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Play Infinity";
  const body = (payload.notification && payload.notification.body) || "";
  self.registration.showNotification(title, {
    body,
    icon: "/logo.png",
    badge: "/favicon.png",
    tag: "play-infinity-push"
  });
});
