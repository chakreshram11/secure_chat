import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import * as cryptoLib from '../lib/crypto';

function loadLocalPrivateKey() {
  const b64 = sessionStorage.getItem('ecdhPrivateKey');
  if (!b64) return null;
  const raw = Uint8Array.from(atob(b64), c=>c.charCodeAt(0)).buffer;
  return crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']   // ✅ this must be set
  );
}


export default function ChatWindow({ other, socket }) {
  const [history, setHistory] = useState([]);
  const [text, setText] = useState('');
  const [aesKey, setAesKey] = useState(null);
  const myPrivRef = useRef(null);

  useEffect(()=>{
    (async ()=>{
      // fetch other user's public ECDH key
      const { data: otherUser } = await api.get(`/api/users/${other._id}`);
      myPrivRef.current = await loadLocalPrivateKey();
      if (!myPrivRef.current) {
        alert('Missing local ECDH private key. Re-login to regenerate and register public key.');
        return;
      }
      if (!otherUser.ecdhPublicKey) {
        alert('Other user has no public key uploaded; cannot derive shared key.');
        return;
      }
      const derived = await cryptoLib.deriveSharedAESKey(myPrivRef.current, otherUser.ecdhPublicKey);
      // store raw base64 AES key for import later
      const aesImported = await cryptoLib.importAesKeyFromRawBase64(derived.rawKeyBase64);
      setAesKey(aesImported);
      // fetch history
      const { data } = await api.get(`/api/messages/history/${other._id}`);
      setHistory(data);
    })();
  }, [other]);

  useEffect(()=>{
    if (!socket) return;
    socket.on('message', async (m)=>{
      // attempt to decrypt if for us
      try {
        if (m.senderId && m.ciphertext && aesKey) {
          const text = await cryptoLib.decryptWithAesKey(aesKey, m.ciphertext);
          setHistory(prev => [...prev, { senderId: m.senderId, ciphertext: m.ciphertext, plaintext: text, createdAt: new Date() }]);
        }
      } catch (err) { console.error('decrypt fail', err); }
    });
    return ()=> socket.off('message');
  }, [socket, aesKey]);

  async function send() {
    if (!text) return;
    const c = await cryptoLib.encryptWithAesKey(aesKey, text);
    await api.post('/api/messages', { receiverId: other._id, ciphertext: c, type: 'text' });
    socket.emit('sendMessage', { receiverId: other._id, ciphertext: c, type: 'text' });
    setHistory(prev=>[...prev, { senderId: 'me', ciphertext: c, plaintext: text, createdAt: new Date() }]);
    setText('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-2 font-semibold">{other.displayName || other.username}</div>
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-white">
        {history.map((m, i)=>(
          <div key={i} className={m.senderId==='me' ? 'text-right' : ''}>
            <div className="inline-block p-2 rounded shadow">{m.plaintext || 'Encrypted message'}</div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t flex gap-2">
        <input className="flex-1 border p-2" value={text} onChange={(e)=>setText(e.target.value)} />
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={send}>Send</button>
      </div>
    </div>
  );
}
