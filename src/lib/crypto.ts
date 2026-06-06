import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getConfig } from "./config";

/**
 * AES-256-GCM symmetric encryption for tokens at rest.
 *
 * Wire format: "enc:v1:" + base64( iv(12) | tag(16) | ciphertext ).
 * The 32-byte key is `getConfig().tokenEncKey` (decoded from base64 TOKEN_ENC_KEY).
 */

const PREFIX = "enc:v1:";
const IV_LEN = 12; // 96-bit nonce, the standard for GCM
const TAG_LEN = 16; // 128-bit auth tag

/** Encrypt a secret. Returns "enc:v1:" + base64(iv(12) | tag(16) | ciphertext). */
export function encryptSecret(plain: string): string {
  const key = getConfig().tokenEncKey;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return PREFIX + packed.toString("base64");
}

/**
 * Decrypt. null/undefined -> null. A value NOT starting with "enc:v1:" is treated as
 * legacy plaintext and returned unchanged (enables zero-downtime migration).
 * A GCM auth-tag mismatch (tampering) throws.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext passthrough

  const key = getConfig().tokenEncKey;
  const packed = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + TAG_LEN);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(), // throws on auth-tag mismatch
  ]);
  return plain.toString("utf8");
}

/** True if the value is in the "enc:v1:" encrypted wire format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}
