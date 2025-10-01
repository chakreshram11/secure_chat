// frontend/src/pages/Chat.jsx
import React, { useEffect, useState, useRef } from "react";
import api, { setToken } from "../services/api";
import io from "socket.io-client";
import ChatWindow from "../components/ChatWindow";
import AdminPanel from "../pages/AdminPanel";
import { Menu } from "lucide-react";

export default function Chat({ token, onLogout }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null); // ✅ logged-in user
  const [selectedUser, setSelectedUser] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [lastSeen, setLastSeen] = useState({});
  const socketRef = useRef();

  useEffect(() => {
    setToken(token);

    (async () => {
      try {
        // ✅ fetch logged-in user
        const { data: me } = await api.get("/api/users/me");
        setCurrentUser(me);

        // ✅ fetch all users
        const { data: allUsers } = await api.get("/api/users");
        setUsers(allUsers);
      } catch (err) {
        console.error("Failed to load users", err);
      }
    })();

    // ✅ init socket
    socketRef.current = io(import.meta.env.VITE_API_BASE || "http://localhost:5000", {
      auth: { token },
    });

    socketRef.current.on("message", (m) => {
      console.log("incoming message", m);
    });

    // ✅ handle online/offline updates
    socketRef.current.on("onlineUsers", ({ online, lastSeen }) => {
      setOnlineUsers(online);
      setLastSeen(lastSeen);
    });

    return () => socketRef.current.disconnect();
  }, [token]);

  function handleLogout() {
    localStorage.removeItem("token");
    onLogout();
  }

  function formatLastSeen(ts) {
    if (!ts) return "offline";
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60) return "last seen just now";
    if (diff < 3600) return `last seen ${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `last seen ${Math.floor(diff / 3600)}h ago`;
    return `last seen ${Math.floor(diff / 86400)}d ago`;
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 bg-white w-72 border-r p-4 z-40 transform transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <h3 className="font-bold mb-3">Users</h3>
        <div className="space-y-2 flex-1 overflow-y-auto">
          {users.map((u) => {
            const isOnline = onlineUsers.includes(u._id);
            return (
              <div
                key={u._id}
                className={`p-2 border rounded cursor-pointer ${
                  selectedUser?._id === u._id ? "bg-gray-100" : ""
                }`}
                onClick={() => {
                  setSelectedUser(u);
                  setShowAdminPanel(false);
                  setSidebarOpen(false);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{u.displayName || u.username}</div>
                  <span
                    className={`h-3 w-3 rounded-full ${
                      isOnline ? "bg-green-500" : "bg-gray-400"
                    }`}
                    title={isOnline ? "Online" : formatLastSeen(lastSeen[u._id])}
                  ></span>
                </div>
                <div className="text-xs text-gray-500">
                  {isOnline ? "🟢 Online" : formatLastSeen(lastSeen[u._id])}
                </div>
              </div>
            );
          })}
        </div>

        {/* ✅ Only visible if logged-in user is admin */}
        {currentUser?.role === "admin" && (
          <div className="mt-4">
            <button
              className="bg-green-600 text-white px-3 py-2 rounded w-full"
              onClick={() => {
                setShowAdminPanel(true);
                setSelectedUser(null);
                setSidebarOpen(false);
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

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 w-full bg-white border-b flex items-center justify-between p-3 z-50">
        <button
          className="p-2 rounded hover:bg-gray-100"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={24} />
        </button>
        <h2 className="font-bold">Secure Chat</h2>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Main content */}
      <main className="flex-1 p-4 overflow-y-auto mt-12 lg:mt-0">
        {showAdminPanel ? (
          <AdminPanel />
        ) : selectedUser ? (
          <ChatWindow
            other={selectedUser}
            socket={socketRef.current}
            myUserId={currentUser?._id} // ✅ pass logged-in user id
          />
        ) : (
          <div className="text-gray-500">Select a user to chat</div>
        )}
      </main>
    </div>
  );
}
