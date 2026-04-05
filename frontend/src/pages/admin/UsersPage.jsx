import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getUsers, createUser, updateUser, deleteUser } from "../../api/users";
import { getOutlets } from "../../api/outlets";

const ROLES = [
  { value: "store_user", label: "Store User" },
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Store Manager" },
  { value: "admin", label: "Admin" },
];

const ROLE_BADGE = {
  store_user: "bg-gray-100 text-gray-700",
  staff: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  admin: "bg-red-100 text-red-700",
};

const EMPTY_ADD = { username: "", password: "", role: "store_user", outlet: "", is_active: true };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getUsers(), getOutlets()])
      .then(([usersRes, outletsRes]) => {
        setUsers(usersRes.data);
        setOutlets(outletsRes.data);
      })
      .catch(() => setFeedback({ type: "error", message: "Failed to load data." }))
      .finally(() => setLoading(false));
  }, []);

  function flash(type, message) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  function errMsg(err, fallback) {
    const data = err.response?.data;
    if (!data) return fallback;
    const first = Object.values(data)[0];
    return Array.isArray(first) ? first[0] : fallback;
  }

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...addForm, outlet: addForm.outlet || null };
      const res = await createUser(payload);
      setUsers((prev) => [...prev, res.data].sort((a, b) => a.username.localeCompare(b.username)));
      setAddForm(EMPTY_ADD);
      setShowAddForm(false);
      flash("success", `User "${res.data.username}" created.`);
    } catch (err) {
      flash("error", errMsg(err, "Failed to create user."));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(user) {
    setEditId(user.id);
    setEditForm({
      username: user.username,
      role: user.role,
      outlet: user.outlet_id || "",
      is_active: user.is_active,
      password: "",
    });
  }

  async function handleSaveEdit(id) {
    setSaving(true);
    try {
      const payload = { ...editForm, outlet: editForm.outlet || null };
      if (!payload.password) delete payload.password;
      const res = await updateUser(id, payload);
      setUsers((prev) => prev.map((u) => (u.id === id ? res.data : u)));
      setEditId(null);
      flash("success", "User updated.");
    } catch (err) {
      flash("error", errMsg(err, "Failed to update user."));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(user) {
    try {
      const res = await updateUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.data : u)));
    } catch {
      flash("error", "Failed to update status.");
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setConfirmDelete(null);
      flash("success", "User deleted.");
    } catch (err) {
      flash("error", err.response?.data?.detail || "Failed to delete user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <button
            onClick={() => { setShowAddForm((v) => !v); setEditId(null); }}
            className="px-4 py-2 bg-brand-700 text-white text-sm rounded hover:bg-brand-800"
          >
            {showAddForm ? "Cancel" : "Add User"}
          </button>
        </div>

        {feedback && (
          <div className="mb-4">
            <Alert type={feedback.type}>{feedback.message}</Alert>
          </div>
        )}

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="bg-white border rounded-lg p-4 mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Username *</label>
              <input
                type="text"
                required
                className="w-full border rounded px-3 py-2 text-sm"
                value={addForm.username}
                onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Password *</label>
              <input
                type="password"
                required
                minLength={6}
                className="w-full border rounded px-3 py-2 text-sm"
                value={addForm.password}
                onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role *</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={addForm.role}
                onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Outlet</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={addForm.outlet}
                onChange={(e) => setAddForm((f) => ({ ...f, outlet: e.target.value }))}
              >
                <option value="">— No outlet —</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addForm.is_active}
                  onChange={(e) => setAddForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
              <button
                type="submit"
                disabled={saving}
                className="ml-auto px-4 py-2 bg-brand-700 text-white text-sm rounded hover:bg-brand-800 disabled:opacity-50"
              >
                Create User
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-gray-500 text-sm">No users yet.</p>
        ) : (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Username</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Outlet</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    {editId === user.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editForm.username}
                            onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editForm.role}
                            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                          >
                            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editForm.outlet}
                            onChange={(e) => setEditForm((f) => ({ ...f, outlet: e.target.value }))}
                          >
                            <option value="">— No outlet —</option>
                            {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="password"
                            placeholder="New password (optional)"
                            className="w-32 border rounded px-2 py-1 text-sm"
                            value={editForm.password}
                            onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <button
                            onClick={() => handleSaveEdit(user.id)}
                            disabled={saving}
                            className="px-3 py-1 bg-brand-700 text-white text-xs rounded hover:bg-brand-800 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="px-3 py-1 text-gray-600 text-xs border rounded hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : confirmDelete === user.id ? (
                      <>
                        <td colSpan={4} className="px-4 py-2 text-sm text-red-700">
                          Delete <strong>{user.username}</strong>? This cannot be undone.
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={saving}
                            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-3 py-1 text-gray-600 text-xs border rounded hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">{user.username}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[user.role] || "bg-gray-100 text-gray-700"}`}>
                            {ROLES.find((r) => r.value === user.role)?.label || user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{user.outlet_name || "—"}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              user.is_active
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            {user.is_active ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            onClick={() => { startEdit(user); setShowAddForm(false); }}
                            className="px-3 py-1 text-xs border rounded hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setConfirmDelete(user.id)}
                            className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
