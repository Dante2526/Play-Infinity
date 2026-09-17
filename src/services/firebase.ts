/// <reference types="vite/client" />
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAvv3XgTuTfUHUH8pRdRJ8XiH98uCUcSAs",
  authDomain: "play-infinity-63eaa.firebaseapp.com",
  projectId: "play-infinity-63eaa",
  storageBucket: "play-infinity-63eaa.firebasestorage.app",
  messagingSenderId: "341774996820",
  appId: "1:341774996820:web:871c91206a157cce6ce4c1"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("[Auth] Erro ao definir persistência local:", err);
  });
}
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
