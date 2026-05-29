// Device keypair + offline transaction signing using Web Crypto (ECDSA P-256).
// Private key never leaves the device. Public key is registered with the server
// so any signed token can be verified.

const DB_NAME = "wallet-secure";
const STORE = "keypair";
const KEY_ID = "device-keypair-v1";

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(store: string, key: string, val: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type DeviceKeypair = {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  publicKeyB64: string; // compact base64url(JSON(jwk))
};

export async function getOrCreateDeviceKeypair(): Promise<DeviceKeypair> {
  const existing = await idbGet<DeviceKeypair>(STORE, KEY_ID);
  if (existing) return existing;
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const publicKeyB64 = b64u(new TextEncoder().encode(JSON.stringify(publicKeyJwk)));
  const created: DeviceKeypair = { publicKeyJwk, privateKeyJwk, publicKeyB64 };
  await idbPut(STORE, KEY_ID, created);
  return created;
}

export type TxPayload = {
  jti: string;
  from: string;
  to: string;
  amount_cents: number;
  note?: string;
  iat: number;
  exp: number;
  pk: string; // base64url(JSON(public jwk))
};

export async function signTxPayload(payload: TxPayload, privateKeyJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey(
    "jwk", privateKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return `${b64u(data)}.${b64u(sig)}`;
}

export type DecodedToken = { payload: TxPayload; signatureB64: string; payloadB64: string };

export function decodeToken(token: string): DecodedToken {
  const [p, s] = token.split(".");
  if (!p || !s) throw new Error("Malformed token");
  const payload = JSON.parse(new TextDecoder().decode(b64uDecode(p))) as TxPayload;
  return { payload, signatureB64: s, payloadB64: p };
}

export async function verifyToken(token: string): Promise<boolean> {
  const { payload, signatureB64, payloadB64 } = decodeToken(token);
  const jwk = JSON.parse(new TextDecoder().decode(b64uDecode(payload.pk))) as JsonWebKey;
  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    b64uDecode(signatureB64),
    b64uDecode(payloadB64),
  );
}

export function newJti(): string {
  return crypto.randomUUID();
}
