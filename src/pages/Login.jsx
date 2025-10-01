import React, { useState } from "react";
import api, { setToken } from "../services/api";
import * as cryptoLib from "../lib/crypto";

// 🔑 Save private key locally
async function savePrivateKey(privateKey) {
  const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  const privB64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  localStorage.setItem("ecdhPrivateKey", privB64);
}

// 🔑 Load private key if already exists
async function loadPrivateKey() {
  const b64 = localStorage.getItem("ecdhPrivateKey");
  if (!b64) return null;
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  return window.crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");

  async function registerOrLogin(e) {
    e.preventDefault();

    let privateKey = await loadPrivateKey();
    let publicKeyRawBase64;

    if (mode === "register") {
  const { keyPair, publicKeyRawBase64: pub } =
    await cryptoLib.generateECDHKeyPair();
  privateKey = keyPair.privateKey;
  publicKeyRawBase64 = pub;

  // Save private + public locally
  await savePrivateKey(privateKey);
 cryptoLib.saveLocalPublicKey(pub);   // ✅ fix
} else {
  if (!privateKey) {
    alert("No local private key found. Please register first.");
    return;
  }

// - publicKeyRawBase64 = undefined;
 // ✅ Always send the local public key (to refresh server if needed)
 publicKeyRawBase64 = cryptoLib.getLocalPublicKey();
}


    // Build payload
    const payload = { username, password };
 if (publicKeyRawBase64) {
   payload.ecdhPublicKey = publicKeyRawBase64;
 }


    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const { data } = await api.post(url, payload);

      setToken(data.token);
      onLogin(data.token);
    } catch (err) {
      alert(err.response?.data?.error || "Authentication failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        className="bg-white p-6 rounded shadow w-96"
        onSubmit={registerOrLogin}
      >
        <h2 className="text-xl mb-4 font-semibold text-center">
          {mode === "login" ? "Login" : "Register"}
        </h2>

        <input
          className="w-full mb-2 p-2 border rounded"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          className="w-full mb-4 p-2 border rounded"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded flex-1"
            type="submit"
          >
            {mode === "login" ? "Login" : "Register"}
          </button>
          <button
            type="button"
            className="px-4 py-2 border rounded flex-1"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            Switch
          </button>
        </div>
      </form>
    </div>
  );
}
