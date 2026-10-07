export const getClientId = (): string => {
  let clientId = localStorage.getItem("PLAY_INFINITY_CLIENT_ID");
  if (!clientId) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      clientId = crypto.randomUUID();
    } else {
      clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    localStorage.setItem("PLAY_INFINITY_CLIENT_ID", clientId);
  }
  return clientId;
};
