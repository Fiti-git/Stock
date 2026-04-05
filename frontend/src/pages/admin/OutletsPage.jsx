import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getOutlets, createOutlet, updateOutlet, deleteOutlet } from "../../api/outlets";

const EMPTY_FORM = { outlet_name: "", short_code: "", location_code: "" };

export default function OutletsPage() {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [feedback, setFeedback] = useState(null); // { type, message }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOutlets()
      .then((res) => setOutlets(res.data))
      .catch(() => setFeedback({ type: "error", message: "Failed to load outlets." }))
      .finally(() => setLoading(false));
  }, []);

  function flash(type, message) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.outlet_name.trim()) return;
    setSaving(true);
    try {
      const res = await createOutlet(form);
      setOutlets((prev) => [...prev, res.data]);
      setForm(EMPTY_FORM);
      flash("success", "Outlet created.");
    } catch (err) {
      flash("error", err.response?.data?.outlet_name?.[0] || "Failed to create outlet.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(outlet) {
    setEditId(outlet.id);
    setEditForm({
      outlet_name: outlet.outlet_name,
      short_code: outlet.short_code || "",
      location_code: outlet.location_code || "",
    });
  }

  async function handleSaveEdit(id) {
    setSaving(true);
    try {
      const res = await updateOutlet(id, editForm);
      setOutlets((prev) => prev.map((o) => (o.id === id ? res.data : o)));
      setEditId(null);
      flash("success", "Outlet updated.");
    } catch (err) {
      flash("error", err.response?.data?.outlet_name?.[0] || "Failed to update outlet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      await deleteOutlet(id);
      setOutlets((prev) => prev.filter((o) => o.id !== id));
      setConfirmDelete(null);
      flash("success", "Outlet deleted.");
    } catch (err) {
      flash("error", "Failed to delete outlet. It may have associated data.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Outlets</h1>

        {feedback && (
          <div className="mb-4">
            <Alert type={feedback.type}>{feedback.message}</Alert>
          </div>
        )}

        {/* Add form */}
        <form onSubmit={handleAdd} className="bg-white border rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Outlet Name *</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="e.g. Gohagoda"
              value={form.outlet_name}
              onChange={(e) => setForm((f) => ({ ...f, outlet_name: e.target.value }))}
            />
          </div>
          <div className="w-32">
            <label className="block text-xs text-gray-500 mb-1">Short Code</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="e.g. GOH"
              value={form.short_code}
              onChange={(e) => setForm((f) => ({ ...f, short_code: e.target.value }))}
            />
          </div>
          <div className="w-36">
            <label className="block text-xs text-gray-500 mb-1">Location Code</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="e.g. 001"
              value={form.location_code}
              onChange={(e) => setForm((f) => ({ ...f, location_code: e.target.value }))}
            />
          </div>
          <button
            type="submit"
            disabled={saving || !form.outlet_name.trim()}
            className="px-4 py-2 bg-brand-700 text-white text-sm rounded hover:bg-brand-800 disabled:opacity-50"
          >
            Add Outlet
          </button>
        </form>

        {/* Table */}
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : outlets.length === 0 ? (
          <p className="text-gray-500 text-sm">No outlets yet.</p>
        ) : (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Outlet Name</th>
                  <th className="px-4 py-3 text-left">Short Code</th>
                  <th className="px-4 py-3 text-left">Location Code</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outlets.map((outlet) => (
                  <tr key={outlet.id}>
                    {editId === outlet.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editForm.outlet_name}
                            onChange={(e) => setEditForm((f) => ({ ...f, outlet_name: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            className="w-24 border rounded px-2 py-1 text-sm"
                            value={editForm.short_code}
                            onChange={(e) => setEditForm((f) => ({ ...f, short_code: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            className="w-28 border rounded px-2 py-1 text-sm"
                            value={editForm.location_code}
                            onChange={(e) => setEditForm((f) => ({ ...f, location_code: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <button
                            onClick={() => handleSaveEdit(outlet.id)}
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
                    ) : confirmDelete === outlet.id ? (
                      <>
                        <td colSpan={3} className="px-4 py-2 text-sm text-red-700">
                          Delete <strong>{outlet.outlet_name}</strong>? This cannot be undone.
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <button
                            onClick={() => handleDelete(outlet.id)}
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
                        <td className="px-4 py-3 font-medium text-gray-900">{outlet.outlet_name}</td>
                        <td className="px-4 py-3 text-gray-600">{outlet.short_code || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{outlet.location_code || "—"}</td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            onClick={() => startEdit(outlet)}
                            className="px-3 py-1 text-xs border rounded hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setConfirmDelete(outlet.id)}
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
