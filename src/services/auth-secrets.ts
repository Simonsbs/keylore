import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export function hashSecret(secret: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(secret, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifySecret(secret: string, salt: string, expectedHash: string): boolean {
  const derived = scryptSync(secret, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
