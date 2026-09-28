import { getAdminDb } from "./server/firebaseAdmin.js";

async function main() {
  const db = getAdminDb();
  if (!db) {
    console.error("No admin DB");
    return;
  }
  const snap = await db.collection("usuarios").where("email", "==", "test@example.com").get();
  snap.forEach(doc => {
    console.log("Found in usuarios:", doc.id, doc.data());
  });
  
  const snap2 = await db.collection("users").where("email", "==", "test@example.com").get();
  snap2.forEach(doc => {
    console.log("Found in users:", doc.id, doc.data());
  });
}

main().catch(console.error);
