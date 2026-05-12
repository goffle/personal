const crypto = require("crypto");
const { APP_SECRET } = require("../config");

const ALGO = "aes-256-gcm";
const KEY = crypto.createHash("sha256").update(APP_SECRET).digest();

function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function decrypt(payload) {
  if (!payload || typeof payload !== "string" || !payload.startsWith("v1:")) return payload;
  const [, ivB64, tagB64, encB64] = payload.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

function encryptFields(obj, fields) {
  const out = { ...(obj || {}) };
  for (const f of fields) if (out[f] != null) out[f] = encrypt(out[f]);
  return out;
}

function decryptFields(obj, fields) {
  const out = { ...(obj || {}) };
  for (const f of fields) if (out[f] != null) out[f] = decrypt(out[f]);
  return out;
}

module.exports = { encrypt, decrypt, encryptFields, decryptFields };
