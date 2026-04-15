import { useState, useEffect, useRef } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { useAuth } from "../../contexts/AuthContext";
import { getOutlets } from "../../api/outlets";
import { updateItem } from "../../api/items";
import api from "../../api/client";

function EditModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({
    item_name: item.item_name || "",
    barcode: item.barcode || "",
    category: item.category || "",
    rack_number: item.rack_number || "",
    shelf: item.shelf || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (f, v) => setForm((p) => ({ ...p, [f]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await updateItem(item.id, form);
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Edit Product</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{item.item_code}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && <Alert type="error">{error}</Alert>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Item Name</label>
            <input
              type="text"
              value={form.item_name}
              onChange={(e) => setField("item_name", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Barcode</label>
            <input
              type="text"
              value={form.barcode}
              onChange={(e) => setField("barcode", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Leave blank to clear"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setField("category", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rack No.</label>
              <input
                type="text"
                value={form.rack_number}
                onChange={(e) => setField("rack_number", e.target.value)}
                placeholder="e.g. R3"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shelf</label>
              <input
                type="text"
                value={form.shelf}
                onChange={(e) => setField("shelf", e.target.value)}
                placeholder="e.g. S2"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductMasterPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState("");
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const searchTimer = useRef(null);
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (isAdmin) {
      getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
    }
  }, [isAdmin]);

  const fetchItems = (p, outlet, q) => {
    setLoading(true);
    const params = { page: p, page_size: PAGE_SIZE };
    if (outlet) params.outlet = outlet;
    if (q) params.q = q;
    api.get("/items/", { params })
      .then(({ data }) => {
        const results = data.results ?? data;
        setItems(Array.isArray(results) ? results : []);
        const count = data.count ?? results.length;
        setTotalCount(count);
        setTotalPages(Math.max(1, Math.ceil(count / PAGE_SIZE)));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(page, selectedOutlet, search); }, [page, selectedOutlet]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchItems(1, selectedOutlet, val);
    }, 300);
  };

  const handleSaved = (updated) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? { ...it, ...updated } : it)));
    setEditItem(null);
    setSuccessMsg("Product updated successfully.");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Product Master</h1>
            <p className="text-sm text-gray-500 mt-1">Edit item details: name, barcode, category, rack, shelf.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {isAdmin && outlets.length > 0 && (
              <select
                value={selectedOutlet}
                onChange={(e) => { setSelectedOutlet(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">All Outlets</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.outlet_name}</option>
                ))}
              </select>
            )}
            {totalCount > 0 && (
              <span className="text-sm text-gray-500 whitespace-nowrap">{totalCount} products</span>
            )}
          </div>
        </div>

        {successMsg && (
          <div className="mb-4">
            <Alert type="success">{successMsg}</Alert>
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by item code or name…"
            value={search}
            onChange={handleSearchChange}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {loading && <div className="text-center py-12 text-gray-400">Loading…</div>}

        {!loading && items.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">{search ? "No products match your search." : "No products found."}</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Item Code</th>
                    <th className="px-4 py-3 font-medium">Item Name</th>
                    <th className="px-4 py-3 font-medium">Barcode</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Rack</th>
                    <th className="px-4 py-3 font-medium">Shelf</th>
                    {isAdmin && <th className="px-4 py-3 font-medium">Outlet</th>}
                    <th className="px-4 py-3 font-medium text-right">Cost (LKR)</th>
                    <th className="px-4 py-3 font-medium text-right">Sell (LKR)</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.item_code}</td>
                      <td className="px-4 py-3 text-gray-900 max-w-xs truncate">{item.item_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.barcode || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{item.category || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{item.rack_number || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{item.shelf || <span className="text-gray-300">—</span>}</td>
                      {isAdmin && <td className="px-4 py-3 text-gray-500 text-xs">{item.outlet_name}</td>}
                      <td className="px-4 py-3 text-right text-gray-700 text-xs tabular-nums">
                        {item.latest_cost_price != null ? Number(item.latest_cost_price).toFixed(2) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 text-xs tabular-nums">
                        {item.latest_selling_price != null ? Number(item.latest_selling_price).toFixed(2) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {item.status === "active" ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-medium">Active</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setEditItem(item)}
                          className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {editItem && (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={handleSaved}
        />
      )}
    </Layout>
  );
}
