import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, parseMasterKey } from "../src/crypto";

// BYOK-крипто. Найдорожчий клас помилки тут — не виняток, а тихо повернутий пошкоджений ключ, що
// пішов би у LLM-виглядом валідного. Тому окремо перевіряємо, що підміна шифротексту ПАДАЄ.
const KEY = randomBytes(32);

describe("encryptSecret / decryptSecret", () => {
  it("round-trips an OpenAI-shaped key", () => {
    const plain = "sk-proj-abcdef0123456789abcdef0123456789";
    const enc = encryptSecret(plain, KEY);
    expect(enc.ciphertext).not.toContain(plain); // plaintext не має протікати у шифротекст
    expect(enc.last4).toBe("6789");
    expect(decryptSecret(enc.ciphertext, KEY)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-secret-value", KEY);
    const b = encryptSecret("same-secret-value", KEY);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptSecret(a.ciphertext, KEY)).toBe("same-secret-value");
    expect(decryptSecret(b.ciphertext, KEY)).toBe("same-secret-value");
  });

  it("fails to decrypt with the wrong master key", () => {
    const enc = encryptSecret("secret", KEY);
    expect(() => decryptSecret(enc.ciphertext, randomBytes(32))).toThrow();
  });

  it("fails to decrypt a tampered ciphertext (GCM authTag)", () => {
    const enc = encryptSecret("secret", KEY);
    const raw = Buffer.from(enc.ciphertext, "base64");
    raw[raw.length - 1] ^= 0xff; // псуємо останній байт шифротексту
    expect(() => decryptSecret(raw.toString("base64"), KEY)).toThrow();
  });
});

describe("parseMasterKey", () => {
  it("accepts a 64-char hex key", () => {
    expect(parseMasterKey("a".repeat(64)).length).toBe(32);
  });

  it("accepts a 32-byte base64 key", () => {
    expect(parseMasterKey(randomBytes(32).toString("base64")).length).toBe(32);
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => parseMasterKey("tooshort")).toThrow();
    expect(() => parseMasterKey("a".repeat(32))).toThrow(); // 32 hex chars = 16 bytes
  });
});
