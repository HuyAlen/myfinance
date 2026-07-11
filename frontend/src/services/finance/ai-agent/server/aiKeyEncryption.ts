import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const EXPECTED_KEY_BYTES = 32;
const EXPECTED_HEX_LENGTH = EXPECTED_KEY_BYTES * 2;

export type EncryptedAIKey = {
  ciphertext: string;
  iv: string;
  authTag: string;
  hint: string;
};

function getEncryptionKey(): Buffer {
  const rawKey = process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim();

  if (!rawKey) {
    throw new Error("AI_SETTINGS_ENCRYPTION_KEY is missing.");
  }

  if (!/^[a-fA-F0-9]+$/.test(rawKey) || rawKey.length !== EXPECTED_HEX_LENGTH) {
    throw new Error(
      "AI_SETTINGS_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.",
    );
  }

  const key = Buffer.from(rawKey, "hex");

  if (key.length !== EXPECTED_KEY_BYTES) {
    throw new Error(
      "AI_SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  }

  return key;
}

export function maskAIKey(apiKey: string): string {
  const normalized = apiKey.trim();

  if (!normalized) return "";
  if (normalized.length <= 8) return "••••••••";

  return `${normalized.slice(0, 3)}••••••••${normalized.slice(-4)}`;
}

export function encryptAIKey(apiKey: string): EncryptedAIKey {
  const normalized = apiKey.trim();

  if (!normalized) {
    throw new Error("API key is required.");
  }

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    hint: maskAIKey(normalized),
  };
}

export function decryptAIKey(input: {
  ciphertext: string;
  iv: string;
  authTag: string;
}): string {
  if (!input.ciphertext || !input.iv || !input.authTag) {
    throw new Error("Encrypted API key payload is incomplete.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(input.iv, "base64"),
  );

  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
