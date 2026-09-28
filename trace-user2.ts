import { getAdminDb } from "./server/firebaseAdmin.js";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

async function main() {
  const serviceAccount = JSON.parse(fs.readFileSync("./secrets/firebase-service-account.json", "utf8"));
  try {
    initializeApp({ credential: cert(serviceAccount) });
  } catch(e) {}
  const db = getFirestore();
  
  const snap = await db.collection("usuarios").where("email", "==", "test@example.com").get();
  console.log("Found in usuarios:", snap.size);
  
  const snap2 = await db.collection("users").where("email", "==", "test@example.com").get();
  console.log("Found in users:", snap2.size);
}
main().catch(console.error);
