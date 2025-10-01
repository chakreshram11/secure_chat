import React, { useState } from 'react';
import api, { setToken } from '../services/api';
import * as cryptoLib from '../lib/crypto';  // rename to avoid clashing with window.crypto

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login');

  async function registerOrLogin(e) {
    e.preventDefault();

    // Generate ECDH key pair (from lib/crypto.js)
    const { keyPair, publicKeyRawBase64 } = await cryptoLib.generateECDHKeyPair();

    // Export and store private key (only on client)
    const exportedPriv = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const privB64 = btoa(String.fromCharCode(...new Uint8Array(exportedPriv)));
    sessionStorage.setItem('ecdhPrivateKey', privB64);

    const payload = { username, password, ecdhPublicKey: publicKeyRawBase64 };

    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const { data } = await api.post(url, payload);

      // Save token and set it for axios
      setToken(data.token);
      onLogin(data.token);
    } catch (err) {
      alert(err.response?.data?.error || 'Authentication failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form className="bg-white p-6 rounded shadow w-96" onSubmit={registerOrLogin}>
        <h2 className="text-xl mb-4">{mode === 'login' ? 'Login' : 'Register'}</h2>
        <input
          className="w-full mb-2 p-2 border"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="w-full mb-4 p-2 border"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            type="submit"
          >
            {mode === 'login' ? 'Login' : 'Register'}
          </button>
          <button
            type="button"
            className="px-4 py-2 border rounded"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            Switch
          </button>
        </div>
      </form>
    </div>
  );
}
