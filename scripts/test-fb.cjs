const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
console.log(typeof initializeApp, typeof cert, typeof getApps, typeof getFirestore);
