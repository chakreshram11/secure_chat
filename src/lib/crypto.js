// frontend/src/lib/crypto.js

// Helper enc/dec
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromBase64(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

// ✅ Properly export functions
export async function generateECDHKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']   // ✅ required
  );

  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  return {
    keyPair: kp,
    publicKeyRawBase64: toBase64(raw),
  };
}


export async function importRemotePublicKeyRaw(base64Raw) {
  const raw = fromBase64(base64Raw);
  return await crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

export async function deriveSharedAESKey(localPrivateKey, remotePublicRawBase64) {
  const remotePub = await importRemotePublicKeyRaw(remotePublicRawBase64);
  const derived = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remotePub },
    localPrivateKey,
    256
  );

  // Derive AES key using HKDF
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const info = enc('chat-app-aes-key-derivation');
  const hkdfKey = await crypto.subtle.importKey('raw', derived, 'HKDF', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', salt, info, hash: 'SHA-256' },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const rawKey = await crypto.subtle.exportKey('raw', aesKey);
  return { aesKey, rawKeyBase64: toBase64(rawKey), saltBase64: toBase64(salt.buffer) };
}

export async function importAesKeyFromRawBase64(rawBase64) {
  const raw = fromBase64(rawBase64);
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptWithAesKey(aesKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc(plaintext));
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return toBase64(combined.buffer);
}

export async function decryptWithAesKey(aesKey, combinedBase64) {
  const buf = fromBase64(combinedBase64);
  const arr = new Uint8Array(buf);
  const iv = arr.slice(0, 12);
  const ciphertext = arr.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return dec(pt);
}
