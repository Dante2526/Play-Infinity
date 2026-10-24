import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export function createByseTickets(key: Buffer) {
  if (key.length !== 32) throw new Error('Invalid proxy key');
  return {
    seal(url: string, fileId = "", context = "") {
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(JSON.stringify({ url, fileId, context, expires: Date.now() + 6 * 3600000 })), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
    },
    open(ticket: string) { return this.openMedia(ticket).url; },
    openMedia(ticket: string) {
      if (ticket.length > 16384) throw new Error('Invalid ticket');
      const data = Buffer.from(ticket, 'base64url');
      if(data.toString('base64url')!==ticket)throw new Error('Invalid ticket');
      const cipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0,12)); cipher.setAuthTag(data.subarray(12,28));
      const result = JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString());
      if (result.expires <= Date.now() || typeof result.url !== 'string') throw new Error('Expired ticket');
      return {context:typeof result.context === "string"?result.context:"",url:result.url as string,fileId:typeof result.fileId === "string" ? result.fileId : ""};
    },
  };
}
let tickets: ReturnType<typeof createByseTickets> | undefined;
export function getByseTickets() {
  if (tickets) return tickets;
  const file = path.join(process.cwd(), 'data', 'byse-proxy.key');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(file, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (error: any) { if (error.code !== 'EEXIST') throw error; }
  return tickets = createByseTickets(fs.readFileSync(file));
}
