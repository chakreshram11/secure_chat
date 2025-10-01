import React, { useEffect, useState, useRef } from "react";
import api, { setToken } from "../services/api";
import io from "socket.io-client";
import ChatWindow from "../components/ChatWindow";
import AdminPanel from "../pages/AdminPanel";

export default function Chat({ token, onLogout }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const socketRef = useRef();

  useEffect(() => {
    if (!token) return;
    setToken(token);

    (async () => {
      try {
        // ✅ 1. Get my user info
        const { data: me } = await api.get("/api/users/me");
        setCurrentUser(me);

        // ✅ 2. If admin → load all users
        if (me.role === "admin") {
          const { data: allUsers } = await api.get("/api/admin/users");
          setUsers(allUsers);
        } else {
          // ✅ 3. Normal users → load visible users
          const { data: allUsers } = await api.get("/api/users");
          setUsers(allUsers);
        }
      } catch (err) {
        console.error("Failed to load users", err);
      }
    })();

    // ✅ setup socket
    socketRef.current = io(
      import.meta.env.VITE_API_BASE || "http://localhost:5000",
      { auth: { token } }
    );

    socketRef.current.on("message", (m) => {
      console.log("incoming message", m);
    });

    return () => socketRef.current.disconnect();
  }, [token]);

  function handleLogout() {
    localStorage.removeItem("token");
    onLogout();
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-80 h-screen border-r p-4 flex flex-col">
        <h3 className="font-bold mb-3">Users</h3>
        <div className="space-y-2 flex-1 overflow-y-auto">
          {users.map((u) => (
            <div
              key={u._id}
              className={`p-2 border rounded cursor-pointer ${
                selectedUser?._id === u._id ? "bg-gray-100" : ""
              }`}
              onClick={() => {
                setSelectedUser(u);
                setShowAdminPanel(false);
              }}
            >
              <div className="font-semibold">
                {u.displayName || u.username}
              </div>
              <div className="text-xs text-gray-500">ID: {u._id}</div>
            </div>
          ))}
        </div>

        {/* ✅ Show admin panel only for admin */}
        {currentUser?.role === "admin" && (
          <div className="mt-4">
            <button
              className="bg-green-600 text-white px-3 py-2 rounded w-full"
              onClick={() => {
                setShowAdminPanel(true);
                setSelectedUser(null);
              }}
            >
              Open Admin Panel
            </button>
          </div>
        )}

        <div className="mt-4">
          <button
            className="bg-red-500 text-white px-3 py-2 rounded w-full"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 overflow-y-auto">
        {showAdminPanel ? (
          <AdminPanel />
        ) : selectedUser ? (
          <ChatWindow other={selectedUser} socket={socketRef.current} />
        ) : (
          <div className="text-gray-500">Select a user to chat</div>
        )}
      </main>
    </div>
  );
}
