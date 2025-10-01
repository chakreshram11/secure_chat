// frontend/src/components/ChatWindow.jsx
import React, { useEffect, useState, useRef } from "react";
import api from "../services/api";
import * as cryptoLib from "../lib/crypto";

// 🔑 load private ECDH key from localStorage
async function loadLocalPrivateKey() {
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

export default function ChatWindow({ other, socket, myUserId }) {
  const [history, setHistory] = useState([]);
  const [text, setText] = useState("");
  const [aesKey, setAesKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef();

  const appendNewMessage = (m) => setHistory((prev) => [...prev, m]);

  /* ---------- Load AES key + history ---------- */
  useEffect(() => {
    (async () => {
      try {
        const { data: otherUser } = await api.get(`/api/users/${other._id}`);
        const myPriv = await loadLocalPrivateKey();
        if (!myPriv) {
          alert("⚠️ Missing local ECDH private key. Please re-login.");
          return;
        }
        if (!otherUser.ecdhPublicKey) {
          alert("⚠️ Other user has no public key.");
          return;
        }

        let importedKey;
        const cached = cryptoLib.loadAesKeyForUser(other._id);

        if (cached) {
          // ✅ Load from cache
          importedKey = await cryptoLib.importAesKeyFromRawBase64(cached);
        } else {
          // ✅ Derive fresh, then persist
          const derived = await cryptoLib.deriveSharedAESKey(
            myPriv,
            otherUser.ecdhPublicKey
          );
          importedKey = await cryptoLib.importAesKeyFromRawBase64(
            derived.rawKeyBase64
          );
          cryptoLib.saveAesKeyForUser(other._id, derived.rawKeyBase64);
        }

        setAesKey(importedKey);

        // fetch + decrypt history
// fetch + decrypt history
const { data } = await api.get(`/api/messages/history/${other._id}`);
const decrypted = await Promise.all(
  data.map(async (m) => {
    if (!m.ciphertext) {
      // 🛡 handle messages without ciphertext (system, file meta, etc.)
      return { ...m, plaintext: "[No ciphertext]", isMe: m.senderId === myUserId };
    }
    try {
      const plaintext = await cryptoLib.decryptWithAesKey(importedKey, m.ciphertext);
      return { ...m, plaintext, isMe: m.senderId === myUserId };
    } catch {
      return { ...m, plaintext: "[Decryption Error]", isMe: false };
    }
  })
);
setHistory(decrypted);


      } catch (err) {
        console.error("❌ Error loading chat:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [other, myUserId]);

  /* ---------- Incoming messages ---------- */
  useEffect(() => {
    if (!socket || !aesKey) return;

    const handler = async (m) => {
      try {
        if (!m.senderId || !m.ciphertext) return;

        console.log("📩 Received ciphertext:", {
          len: m.ciphertext.length,
          preview: m.ciphertext.slice(0, 40),
        });

        let text;
        try {
          // First try with cached AES key
          text = await cryptoLib.decryptWithAesKey(aesKey, m.ciphertext);
        } catch (err) {
          console.warn("⚠️ Cached key failed, trying senderPublicKey…");

          // Fallback: derive new key if senderPublicKey provided
          if (m.meta?.senderPublicKey) {
            const myPriv = await cryptoLib.loadLocalPrivateKey();
            const { aesKey: derived, rawKeyBase64 } =
              await cryptoLib.deriveSharedAESKey(myPriv, m.meta.senderPublicKey);

            // retry decrypt
            text = await cryptoLib.decryptWithAesKey(derived, m.ciphertext);

            // save for future use
            cryptoLib.saveAesKeyForUser(m.senderId, rawKeyBase64);
            setAesKey(derived);
          } else {
            text = "[Decryption Error]";
          }
        }

        appendNewMessage({
          ...m,
          plaintext: text,
          isMe: String(m.senderId) === String(myUserId),
        });
      } catch (err) {
        console.error("❌ Decrypt failed:", err);
        appendNewMessage({
          ...m,
          plaintext: "[Decryption Error]",
          isMe: String(m.senderId) === String(myUserId),
        });
      }
    };

    socket.on("message", handler);
    return () => socket.off("message", handler);
  }, [socket, aesKey, myUserId]);

  /* ---------- Auto-scroll ---------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  /* ---------- Send text ---------- */
  async function send() {
  if (!text.trim() || !aesKey) return;
  try {
//   console.log("🔐 Encrypting:", plaintext, "len:", ciphertext.byteLength + 12);
//    const c = await cryptoLib.encryptWithAesKey(aesKey, text);
   const c = await cryptoLib.encryptWithAesKey(aesKey, text);
  console.log("📤 Outgoing ciphertext:", c.slice(0, 50), "len:", c.length);

    // optimistic append
    appendNewMessage({
      senderId: myUserId,
      receiverId: other._id,
      plaintext: text,
      ciphertext: c,
      type: "text",
      createdAt: new Date(),
      isMe: true,
      read: false,
    });

    socket.emit("sendMessage", {
  receiverId: other._id,
  ciphertext: c,   // ✅ this should not be empty
  type: "text",
  meta: {
    senderPublicKey: cryptoLib.getLocalPublicKey(),
    
  },
});

    setText("");
  } catch (err) {
    console.error("❌ Failed to send", err);
  }
}

  /* ---------- File upload ---------- */
  async function handleFiles(files) {
    if (!files.length || !aesKey) return;

    for (let file of files) {
      const id = Date.now() + file.name;
      const uploadEntry = { id, name: file.name, progress: 0 };
      setUploadingFiles((prev) => [...prev, uploadEntry]);

      try {
        const form = new FormData();
        form.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/messages/upload");
        xhr.setRequestHeader(
          "Authorization",
          "Bearer " + localStorage.getItem("token")
        );

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadingFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, progress: percent } : f))
            );
          }
        };

        xhr.onload = async () => {
          if (xhr.status === 200) {
            const { url } = JSON.parse(xhr.responseText);
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);

            appendNewMessage({
              senderId: myUserId,
              receiverId: other._id,
              plaintext: isImage ? "🖼️ Image" : `📎 ${file.name}`,
              type: "file",
              meta: { url, name: file.name, isImage },
              createdAt: new Date(),
              isMe: true,
              read: false,
            });

            const c = await cryptoLib.encryptWithAesKey(
              aesKey,
              `File: ${file.name}`
            );

            console.log("📤 Outgoing file ciphertext:", {
              len: c.length,
              preview: c.slice(0, 40),
            });
            console.log("📤 Sending with senderPublicKey:", cryptoLib.getLocalPublicKey());

            socket.emit("sendMessage", {
              receiverId: other._id,
              type: "file",
              meta: {
                url,
                name: file.name,
                isImage,
                senderPublicKey: cryptoLib.getLocalPublicKey(),
                
              },
              ciphertext: c,
            });
          }
          setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
        };

        xhr.onerror = () => {
          console.error("❌ Upload failed");
          setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
        };

        xhr.send(form);
      } catch (err) {
        console.error("❌ File upload failed", err);
      }
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-3 font-semibold bg-gray-100 flex justify-between">
        <span>{other.displayName || other.username}</span>
        <button
          className="text-blue-600 hover:underline"
          onClick={() => fileInputRef.current.click()}
        >
          📎
        </button>
        <input
          type="file"
          multiple
          hidden
          ref={fileInputRef}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Messages (scrollable only) */}
      <div
        className="flex-1 p-4 overflow-y-auto bg-white space-y-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {loading ? (
          <div className="text-center text-gray-500">⏳ Loading...</div>
        ) : (
          history.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs sm:max-w-md p-2 rounded-lg shadow text-sm ${
                  m.isMe ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
                }`}
              >
                {m.type === "file" && m.meta?.url ? (
                  m.meta.isImage ? (
                    <img
                      src={m.meta.url}
                      alt={m.meta.name}
                      className="rounded max-h-60 object-contain"
                    />
                  ) : (
                    <a
                      href={m.meta.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {m.plaintext}
                    </a>
                  )
                ) : (
                  <div>{m.plaintext}</div>
                )}
                <div className="text-xs opacity-70 mt-1 flex justify-between">
                  <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                  {m.isMe && <span>{m.read ? "✅" : "✔️"}</span>}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Upload progress bars */}
        {uploadingFiles.map((f) => (
          <div key={f.id} className="text-sm text-gray-600">
            {f.name} - {f.progress}%
          </div>
        ))}
        <div ref={messagesEndRef}></div>
      </div>

      {/* Input - fixed at bottom */}
      <div className="p-3 border-t flex gap-2 bg-gray-50">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          onClick={send}
        >
          Send
        </button>
      </div>
    </div>
  );
}
