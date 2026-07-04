import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "dev-secret-change-me";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const testBuffer = crypto.scryptSync(password, salt, 64);
  if (hashBuffer.length !== testBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, testBuffer);
}

export interface SessionPayload {
  uid: number;
  username: string;
  role: "admin" | "employee";
  exp: number;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  let padded = input.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  return Buffer.from(padded, "base64");
}

export function createSessionToken(payload: SessionPayload): string {
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest();
  return `${body}.${base64url(sig)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", SECRET).update(body).digest();
  let actualSig: Buffer;
  try {
    actualSig = base64urlDecode(sig);
  } catch {
    return null;
  }
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64urlDecode(body).toString()) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
