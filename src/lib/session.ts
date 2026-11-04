// Signed session cookie. Runs in middleware (edge) and on the server, so it only uses Web Crypto.
export const SESSION_COOKIE = "tm_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

export type Session = { id: string; version: number; exp: number; mustChange: boolean };

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

function key(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  keyPromise ??= crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return keyPromise;
}

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signSession(s: Omit<Session, "exp">): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${s.id}.${s.version}.${exp}.${s.mustChange ? 1 : 0}`;
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [id, ver, exp, must, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d+$/.test(ver) || !/^\d+$/.test(exp)) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(sig), enc.encode(`${id}.${ver}.${exp}.${must}`));
  } catch {
    return null;
  }
  if (!ok || Number(exp) < Date.now() / 1000) return null;
  return { id, version: Number(ver), exp: Number(exp), mustChange: must === "1" };
}
