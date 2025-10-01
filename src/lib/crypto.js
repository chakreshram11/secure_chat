// frontend/src/lib/crypto.js
// Enhanced: adds debug logging and key fingerprinting to help diagnose OperationError

// ---------- Helpers ----------
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

async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(h);
}
function shortB64(buf) {
  // return first 8 chars of base64 for compact fingerprint
  return toBase64(buf).slice(0, 8);
}

// ---------- ECDH KEYPAIR ----------
export async function generateECDHKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );

  const raw = await crypto.subtle.exportKey("raw", kp.publicKey);
  return {
    keyPair: kp,
    publicKeyRawBase64: toBase64(raw),
  };
}

export async function importRemotePublicKeyRaw(base64Raw) {
  const raw = fromBase64(base64Raw);
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

export async function importPrivateKeyPkcs8(base64Pkcs8) {
  const raw = fromBase64(base64Pkcs8);
  return await crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

// ---------- KEY FINGERPRINT (for debugging) ----------
export async function getKeyFingerprintFromAesKey(aesCryptoKey) {
  try {
    const raw = await crypto.subtle.exportKey("raw", aesCryptoKey);
    const digest = await sha256(raw);
    // return first 8 chars of base64 of digest for concise identification
    return toBase64(digest).slice(0, 8);
  } catch (err) {
    console.warn("getKeyFingerprintFromAesKey failed:", err);
    return null;
  }
}
export async function getRawFingerprintBase64FromRawKeyBase64(rawKeyBase64) {
  try {
    const raw = fromBase64(rawKeyBase64);
    const digest = await sha256(raw);
    return toBase64(digest).slice(0, 8);
  } catch (err) {
    return null;
  }
}




// ---------- SHARED AES KEY (HKDF deterministic) ----------
export async function deriveSharedAESKey(localPrivateKey, remotePublicRawBase64) {
  if (!remotePublicRawBase64) throw new Error("deriveSharedAESKey: remotePublicRawBase64 missing");

  const remotePub = await importRemotePublicKeyRaw(remotePublicRawBase64);
  console.log("🔑 deriveSharedAESKey with remote pub:", remotePublicRawBase64);

  // Raw shared secret (256 bits)
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: remotePub },
    localPrivateKey,
    256
  );

  // HKDF → AES-GCM-256
  const salt = enc("chat-app-fixed-salt");
  const info = enc("chat-app-aes-key-derivation");

  const hkdfKey = await crypto.subtle.importKey("raw", derivedBits, "HKDF", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", salt, info, hash: "SHA-256" },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const rawKey = await crypto.subtle.exportKey("raw", aesKey);
  const rawKeyB64 = toBase64(rawKey);

  // ✅ Now it's safe to log fingerprint
  try {
    const digest = await sha256(rawKey);
    console.log("🔑 Derived AES key fingerprint:", toBase64(digest).slice(0, 8));
  } catch (e) {
    /* ignore */
  }

  return { aesKey, rawKeyBase64: rawKeyB64 };
}

// ---------- IMPORT AES ----------
export async function importAesKeyFromRawBase64(rawBase64) {
  if (!rawBase64) {
    throw new Error("importAesKeyFromRawBase64: rawBase64 missing");
  }

  const raw = fromBase64(rawBase64);

  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

// ---------- ENCRYPT / DECRYPT ----------
export async function encryptWithAesKey(aesKey, plaintext) {
  if (!aesKey) throw new Error("encryptWithAesKey: aesKey missing");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc(plaintext));

  // concatenate IV + ciphertext
  const combined = new Uint8Array(iv.byteLength + ciphertextBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuf), iv.byteLength);

  // debug: lengths and fingerprint
  try {
    const rawKey = await crypto.subtle.exportKey("raw", aesKey);
    const keyDigest = await sha256(rawKey);
    console.log(
      "🔐 encrypt: ivLen=",
      iv.length,
      "combinedLen=",
      combined.length,
      "keyFP=",
      toBase64(keyDigest).slice(0, 8)
    );
  } catch (e) {
    console.log("🔐 encrypt: combinedLen=", combined.length);
  }

  return toBase64(combined.buffer);
}

export async function decryptWithAesKey(aesKey, combinedBase64) {
  try {
    if (!combinedBase64) throw new Error("decryptWithAesKey: combinedBase64 missing");

    // Validate base64 length first (quick sanity)
    if (typeof combinedBase64 !== "string" || combinedBase64.length < 16) {
      console.warn("decryptWithAesKey: suspicious ciphertext base64 length:", combinedBase64?.length);
    }

    const buf = fromBase64(combinedBase64);
    const arr = new Uint8Array(buf);

    if (arr.length < 13) {
      // IV(12) + at least 1 byte ciphertext required
      throw new Error("decryptWithAesKey: combined buffer too small (needs >=13 bytes)");
    }

    const iv = arr.slice(0, 12);
    const ciphertext = arr.slice(12);

    if (iv.length !== 12) {
      throw new Error("decryptWithAesKey: IV length is not 12 bytes");
    }

    // 🔎 Debug: log sizes + key fingerprint
    try {
      const rawKey = await crypto.subtle.exportKey("raw", aesKey);
      const keyDigest = await sha256(rawKey);
      const keyFP = toBase64(keyDigest).slice(0, 8);

      console.log(
        "🔐 decrypt:",
        "ivLen=", iv.length,
        "cipherLen=", ciphertext.length,
        "keyFP=", keyFP,
        "b64Preview=", combinedBase64.slice(0, 30) // small preview of ciphertext
      );
    } catch (e) {
      console.log("🔐 decrypt: cipherLen=", ciphertext.length);
    }

    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
    return dec(pt);
  } catch (err) {
    console.error("❌ Decryption error:", err);
    throw err; // rethrow so callers can see full error and run fallback logic
  }
}


// ---------- FILE METADATA ENCRYPTION ----------
export async function encryptFileMeta(aesKey, metaObj) {
  const metaJson = JSON.stringify(metaObj);
  return await encryptWithAesKey(aesKey, metaJson);
}

export async function decryptFileMeta(aesKey, ciphertextB64) {
  const json = await decryptWithAesKey(aesKey, ciphertextB64);
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ---------- Persistent AES Key Storage ----------
export function saveAesKeyForUser(userId, rawKeyBase64) {
  try {
    localStorage.setItem(`aesKey-${userId}`, rawKeyBase64);
  } catch (e) {
    console.warn("saveAesKeyForUser failed:", e);
  }
}
export function loadAesKeyForUser(userId) {
  return localStorage.getItem(`aesKey-${userId}`);
}

// ---------- Private Key Storage ----------
export async function saveLocalPrivateKey(privateKey) {
  const raw = await crypto.subtle.exportKey("pkcs8", privateKey);
  const b64 = toBase64(raw);
  localStorage.setItem("ecdhPrivateKey", b64);
}

export function loadLocalPrivateKey() {
  const b64 = localStorage.getItem("ecdhPrivateKey");
  if (!b64) return null;
  return importPrivateKeyPkcs8(b64);
}

export function getLocalPublicKey() {
  return localStorage.getItem("ecdhPublicKey");
}

export function saveLocalPublicKey(pubKeyB64) {
  localStorage.setItem("ecdhPublicKey", pubKeyB64);
}
