// frontend/src/components/ChatWindow.jsx
import React, { useEffect, useState, useRef } from "react";
import api from "../services/api";
import * as cryptoLib from "../lib/crypto";
import { toast } from "react-toastify";

// 🔑 load private ECDH key from localStorage
export async function loadLocalPrivateKey() {
  const b64 = localStorage.getItem("ecdhPrivateKey");
  if (!b64) return null;
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  return await window.crypto.subtle.importKey(
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
  const [hasRecipientKey, setHasRecipientKey] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
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
          toast.error("⚠️ Missing local ECDH private key. Please re-login.");
          return;
        }

        // 🚨 Handle case: recipient has no ECDH public key yet
        if (!otherUser.ecdhPublicKey) {
  toast.warning(
    `⚠️ ${otherUser.displayName || otherUser.username} hasn’t logged in yet. You can message them once they’re online.`,
    {
      toastId: `no-key-${otherUser._id}`, // ✅ unique per user, prevents duplicates
      position: "top-center",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: "light",
    }
  );
  setHasRecipientKey(false);
  setLoading(false);
  return;
}

        else {
          setHasRecipientKey(true);
        }

        let importedKey;
        const cached = cryptoLib.loadAesKeyForUser(other._id);

        if (cached) {
          importedKey = await cryptoLib.importAesKeyFromRawBase64(cached);
        } else {
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
        const { data } = await api.get(`/api/messages/history/${other._id}`);
        const decrypted = await Promise.all(
          data.map(async (m) => {
            if (!m.ciphertext) {
              return {
                ...m,
                plaintext: "[No ciphertext]",
                isMe: m.senderId === myUserId,
              };
            }
            try {
              const plaintext = await cryptoLib.decryptWithAesKey(
                importedKey,
                m.ciphertext
              );
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
        let text;
        try {
          text = await cryptoLib.decryptWithAesKey(aesKey, m.ciphertext);
        } catch (err) {
          if (m.meta?.senderPublicKey) {
            const myPriv = await loadLocalPrivateKey();
            const { aesKey: derived, rawKeyBase64 } =
              await cryptoLib.deriveSharedAESKey(myPriv, m.meta.senderPublicKey);

            text = await cryptoLib.decryptWithAesKey(derived, m.ciphertext);
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
      const c = await cryptoLib.encryptWithAesKey(aesKey, text);
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
      ciphertext: c,
      type: "text",
      meta: {
        senderPublicKey: await cryptoLib.getLocalPublicKey(), // ✅ ensure fresh public key
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

            socket.emit("sendMessage", {
            receiverId: other._id,
            ciphertext: c,
            type: "text",
            meta: {
              senderPublicKey: await cryptoLib.getLocalPublicKey(), // ✅ ensure base64
            },
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

 /* ---------- Render ---------- */
return (
  <div className="flex flex-col h-full bg-white relative">
    {/* Header */}
    <div className="border-b p-3 font-semibold bg-gray-100 flex justify-between items-center">
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

    {/* Messages (scrollable fixed area) */}
    <div
      className="flex-1 overflow-y-auto p-4 flex flex-col-reverse space-y-reverse space-y-3"
      style={{ minHeight: 0 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
      ref={messagesEndRef}
      onScroll={(e) => {
        const el = e.target;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
        setIsNearBottom(atBottom);
      }}
    >
      {loading ? (
        <div className="text-center text-gray-500">⏳ Loading...</div>
      ) : (
        history
          .slice()
          .reverse()
          .map((m, i) => (
            <div
              key={i}
              className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs sm:max-w-md p-2 rounded-lg shadow text-sm ${
                  m.isMe
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-800"
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

      {/* Upload progress */}
      {uploadingFiles.map((f) => (
        <div key={f.id} className="text-sm text-gray-600">
          {f.name} - {f.progress}%
        </div>
      ))}
    </div>

    {/* Floating “New Messages” button */}
    {!isNearBottom && (
      <button
        onClick={() => {
          const container = messagesEndRef.current;
          if (container) {
            container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
          }
        }}
        className="absolute bottom-20 right-5 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-blue-700 transition"
      >
        ⬇ New Messages
      </button>
    )}

    {/* Input (sticky bottom) */}
    {!hasRecipientKey ? (
      <div className="p-4 text-center text-yellow-700 bg-yellow-50 border-t border-yellow-300">
        ⚠️ {other.displayName || other.username} hasn’t logged in yet.
        <br />
        You’ll be able to message them once they log in.
      </div>
    ) : (
      <div className="p-3 border-t flex gap-2 bg-gray-50 sticky bottom-0">
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
    )}
  </div>
);
}