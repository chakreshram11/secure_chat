import React, { useEffect, useState } from "react";
import api from "../services/api";
import { toast } from "react-toastify";
import io from "socket.io-client";

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

    socket.on("userUpdated", () => loadUsers());
    socket.on("userDeleted", () => loadUsers());
    socket.on("userAdded", () => loadUsers());

    socket.on("groupUpdated", () => loadGroups());
    socket.on("groupDeleted", () => loadGroups());
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
      await api.post("/api/auth/register", newUser);
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
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">⚙️ Admin Panel</h1>

      {/* USERS */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">👥 Users</h2>
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u._id}
              className="flex items-center justify-between p-4 bg-white shadow rounded"
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
              <div className="space-x-2">
                <button
                  onClick={() => toggleUserRole(u._id, u.role)}
                  className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                  Toggle Role
                </button>
                <button
                  onClick={() => deleteUser(u._id)}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add User Form */}
        <div className="mt-6 p-6 bg-white shadow rounded">
          <h3 className="text-lg font-semibold mb-4">➕ Add User</h3>
          <div className="grid grid-cols-2 gap-4">
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
              className="border p-2 rounded"
              placeholder="Display Name"
              value={newUser.displayName}
              onChange={(e) =>
                setNewUser({ ...newUser, displayName: e.target.value })
              }
            />
            <select
              className="border p-2 rounded"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            onClick={addUser}
            disabled={loading}
            className={`mt-4 px-4 py-2 rounded text-white ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {loading ? "Adding..." : "Add User"}
          </button>
        </div>
      </div>

      {/* GROUPS */}
      <div>
        <h2 className="text-xl font-semibold mb-4">👥 Groups</h2>
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g._id} className="p-4 bg-white shadow rounded space-y-2">
              {editingGroup && editingGroup._id === g._id ? (
                <>
                  {/* Edit Group Form */}
                  <input
                    className="border p-2 rounded w-full mb-2"
                    value={editingGroup.name}
                    onChange={(e) =>
                      setEditingGroup({ ...editingGroup, name: e.target.value })
                    }
                  />

                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Members
                  </label>
                  <select
                    multiple
                    className="border p-2 rounded w-full h-32"
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

                  <div className="mt-3 space-x-2">
                    <button
                      onClick={saveGroupEdits}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingGroup(null)}
                      className="px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{g.name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({g.members.length} members)
                      </span>
                    </div>
                    <div className="space-x-2">
                      <button
                        onClick={() =>
                          setEditingGroup({
                            _id: g._id,
                            name: g.name,
                            members: g.members.map((m) => m._id || m),
                          })
                        }
                        className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteGroup(g._id)}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add Group Form */}
        <div className="mt-6 p-6 bg-white shadow rounded">
          <h3 className="text-lg font-semibold mb-4">➕ Add Group</h3>
          <input
            className="border p-2 rounded w-full mb-3"
            placeholder="Group Name"
            value={newGroup.name}
            onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
          />

          <label className="block mb-2 text-sm font-medium text-gray-700">
            Select Members
          </label>
          <select
            multiple
            className="border p-2 rounded w-full h-32"
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
            className="mt-4 px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700"
          >
            Add Group
          </button>
        </div>
      </div>
    </div>
  );
}
