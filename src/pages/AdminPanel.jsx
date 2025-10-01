import React, { useEffect, useState } from "react";
import api from "../services/api";
import { toast } from "react-toastify";
import { io } from "socket.io-client";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    displayName: "",
    role: "user",
  });

  const [newGroup, setNewGroup] = useState({ name: "", members: [] });
  const [editingGroup, setEditingGroup] = useState(null);

  /* ---------- SOCKET.IO ---------- */
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_BASE || "http://localhost:5000", {
      auth: { token: localStorage.getItem("token") },
    });

    socket.on("userAdded", () => loadUsers());
    socket.on("groupAdded", () => loadGroups());

    return () => socket.disconnect();
  }, []);

  /* ---------- LOAD DATA ---------- */
  async function loadUsers() {
    try {
      const { data } = await api.get("/api/admin/users");
      setUsers(data);
    } catch {
      toast.error("❌ Failed to load users");
    }
  }

  async function loadGroups() {
    try {
      const { data } = await api.get("/api/admin/groups");
      setGroups(data);
    } catch {
      toast.error("❌ Failed to load groups");
    }
  }

  useEffect(() => {
    loadUsers();
    loadGroups();
  }, []);

  /* ---------- USER FUNCTIONS ---------- */
  async function addUser() {
    if (!newUser.username || !newUser.password) {
      return toast.warning("⚠️ Username & Password required");
    }
    setLoading(true);
    try {
      await api.post("/api/admin/users", newUser);
      toast.success("✅ User added");
      setNewUser({ username: "", password: "", displayName: "", role: "user" });
      loadUsers();
    } catch {
      toast.error("❌ Failed to add user");
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(id) {
    if (!window.confirm("Delete this user?")) return;
    try {
      await api.delete(`/api/admin/users/${id}`);
      toast.success("🗑️ User deleted");
      loadUsers();
    } catch {
      toast.error("❌ Failed to delete user");
    }
  }

  async function toggleUserRole(id, currentRole) {
    try {
      const newRole = currentRole === "admin" ? "user" : "admin";
      await api.put(`/api/admin/users/${id}`, { role: newRole });
      toast.success(`✅ Role changed to ${newRole}`);
      loadUsers();
    } catch {
      toast.error("❌ Failed to update role");
    }
  }

  /* ---------- GROUP FUNCTIONS ---------- */
  async function addGroup() {
    if (!newGroup.name) return toast.warning("⚠️ Group name required");
    try {
      await api.post("/api/admin/groups", newGroup);
      toast.success("✅ Group added");
      setNewGroup({ name: "", members: [] });
      loadGroups();
    } catch {
      toast.error("❌ Failed to add group");
    }
  }

  async function deleteGroup(id) {
    if (!window.confirm("Delete this group?")) return;
    try {
      await api.delete(`/api/admin/groups/${id}`);
      toast.success("🗑️ Group deleted");
      loadGroups();
    } catch {
      toast.error("❌ Failed to delete group");
    }
  }

  async function saveGroupEdits() {
    if (!editingGroup) return;
    try {
      await api.put(`/api/admin/groups/${editingGroup._id}`, {
        name: editingGroup.name,
        members: editingGroup.members,
      });
      toast.success("✅ Group updated");
      setEditingGroup(null);
      loadGroups();
    } catch {
      toast.error("❌ Failed to update group");
    }
  }

  /* ---------- RENDER ---------- */
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* 🔝 Sticky Header */}
      <header className="sticky top-0 z-10 bg-white shadow p-4 sm:p-6 flex items-center justify-between">
        <h1 className="text-lg sm:text-2xl font-bold">⚙️ Admin Panel</h1>
        <span className="hidden sm:block text-gray-500 text-sm">
          Manage users & groups
        </span>
      </header>

      <main className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* USERS */}
        <section className="bg-white shadow rounded p-4 sm:p-6 flex flex-col">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">👥 Users</h2>

          {/* User List */}
          <div className="flex-1 space-y-3 overflow-y-auto max-h-64 sm:max-h-80">
            {users.map((u) => (
              <div
                key={u._id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border rounded bg-gray-50"
              >
                <div>
                  <span className="font-medium">{u.displayName || u.username}</span>
                  <span
                    className={`ml-2 px-2 py-1 text-xs rounded-full ${
                      u.role === "admin"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {u.role}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                  <button
                    onClick={() => toggleUserRole(u._id, u.role)}
                    className="px-3 py-1 text-xs sm:text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Toggle Role
                  </button>
                  <button
                    onClick={() => deleteUser(u._id)}
                    className="px-3 py-1 text-xs sm:text-sm bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add User Form */}
          <div className="mt-6">
            <h3 className="text-md font-semibold mb-3">➕ Add User</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="border p-2 rounded"
                placeholder="Username"
                value={newUser.username}
                onChange={(e) =>
                  setNewUser({ ...newUser, username: e.target.value })
                }
              />
              <input
                className="border p-2 rounded"
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
              <input
                className="border p-2 rounded sm:col-span-2"
                placeholder="Display Name"
                value={newUser.displayName}
                onChange={(e) =>
                  setNewUser({ ...newUser, displayName: e.target.value })
                }
              />
              <select
                className="border p-2 rounded"
                value={newUser.role}
                onChange={(e) =>
                  setNewUser({ ...newUser, role: e.target.value })
                }
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={addUser}
                disabled={loading}
                className={`sm:col-span-2 mt-2 px-4 py-2 rounded text-white ${
                  loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {loading ? "Adding..." : "Add User"}
              </button>
            </div>
          </div>
        </section>

        {/* GROUPS */}
        <section className="bg-white shadow rounded p-4 sm:p-6 flex flex-col">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">👥 Groups</h2>

          {/* Group List */}
          <div className="flex-1 space-y-3 overflow-y-auto max-h-64 sm:max-h-80">
            {groups.map((g) => (
              <div
                key={g._id}
                className="p-3 border rounded bg-gray-50 space-y-2"
              >
                {editingGroup && editingGroup._id === g._id ? (
                  <>
                    <input
                      className="border p-2 rounded w-full"
                      value={editingGroup.name}
                      onChange={(e) =>
                        setEditingGroup({ ...editingGroup, name: e.target.value })
                      }
                    />
                    <select
                      multiple
                      className="border p-2 rounded w-full h-24 sm:h-32"
                      value={editingGroup.members.map((m) => m.toString())}
                      onChange={(e) =>
                        setEditingGroup({
                          ...editingGroup,
                          members: Array.from(
                            e.target.selectedOptions,
                            (opt) => opt.value
                          ),
                        })
                      }
                    >
                      {users.map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.displayName || u.username} ({u.role})
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={saveGroupEdits}
                        className="flex-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingGroup(null)}
                        className="flex-1 px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <span className="font-medium">{g.name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({g.members.length} members)
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setEditingGroup({
                            _id: g._id,
                            name: g.name,
                            members: g.members.map((m) => m._id || m),
                          })
                        }
                        className="px-3 py-1 text-xs sm:text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteGroup(g._id)}
                        className="px-3 py-1 text-xs sm:text-sm bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Group Form */}
          <div className="mt-6">
            <h3 className="text-md font-semibold mb-3">➕ Add Group</h3>
            <input
              className="border p-2 rounded w-full mb-2"
              placeholder="Group Name"
              value={newGroup.name}
              onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
            />
            <select
              multiple
              className="border p-2 rounded w-full h-24 sm:h-32"
              value={newGroup.members}
              onChange={(e) =>
                setNewGroup({
                  ...newGroup,
                  members: Array.from(e.target.selectedOptions, (opt) => opt.value),
                })
              }
            >
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.displayName || u.username} ({u.role})
                </option>
              ))}
            </select>
            <button
              onClick={addGroup}
              className="mt-3 w-full sm:w-auto px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700"
            >
              Add Group
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
