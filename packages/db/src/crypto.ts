import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// BYOK — симетричне шифрування ключів орендаря (AES-256-GCM). Чисті функції: master-ключ приходить
// параметром, env тут НЕ читаємо (db не знає оточення — його тримають composition-роути api/worker).
// GCM обрано за автентифікацію (authTag): підмінений або побитий шифротекст падає на decrypt, а не
// повертає сміття, яке пішло б у LLM-виклик під виглядом ключа.
const IV_LEN = 12; // рекомендований розмір nonce для GCM
const TAG_LEN = 16;

export interface EncryptedSecret {
  ciphertext: string; // base64(iv | authTag | ciphertext)
  last4: string; // останні 4 символи — лише для маскованого показу в UI
}

export function encryptSecret(plaintext: string, masterKey: Buffer): EncryptedSecret {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, ct]).toString("base64"),
    last4: plaintext.slice(-4),
  };
}

export function decryptSecret(blobB64: string, masterKey: Buffer): string {
  const blob = Buffer.from(blobB64, "base64");
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Парсинг master-ключа з env-рядка: hex(64 символи) або base64, рівно 32 байти (AES-256). Кидає
// одразу — щоб зламана конфігурація впала на старті процесу, а не на першому шифруванні ключа.
export function parseMasterKey(raw: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("BYOK master key must decode to 32 bytes (hex-64 or base64)");
  }
  return key;
}
