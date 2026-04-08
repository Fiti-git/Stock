import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getPendingItems, assignBarcode, acceptChange, rejectChange } from "../../api/items";
import { getOutlets } from "../../api/outlets";
import { useAuth } from "../../contexts/AuthContext";

function FieldDiff({ field, diff }) {
  return (
    <div className="text-xs">
      <span className="font-medium text-gray-600 capitalize">{field.replace("_", " ")}:</span>{" "}
      <span className="line-through text-red-500">{diff.old ?? "—"}</span>
      {" → "}
      <span className="text-green-600 font-medium">{diff.new ?? "—"}</span>
    </div>
  );
}

function NewCodeCard({ item, onAssigned }) {
  const [assigning, setAssigning] = useState(false);
  const [inputs, setInputs] = useState({ barcode: "", category: "" });
  const [feedback, setFeedback] = useState(null);

  const setInput = (field, value) => setInputs((prev) => ({ ...prev, [field]: value }));

  const handleAssign = async () => {
    const barcode = inputs.barcode.trim();
    if (!barcode) return;
    setAssigning(true);
    setFeedback(null);
    try {
      await assignBarcode(item.id, barcode, inputs.category);
      setFeedback({ type: "success", msg: "Barcode assigned!" });
      setTimeout(() => onAssigned(item.id), 800);
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to assign barcode.";
      setFeedback({ type: "error", msg });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded mt-0.5 whitespace-nowrap">
          New Item
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{item.item_name}</p>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{item.item_code}</span>
            <span>First seen: {item.first_seen_date}</span>
            <span>Outlet: {item.first_seen_outlet_name}</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="mb-3">
          <Alert type={feedback.type}>{feedback.msg}</Alert>
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Barcode (scan or type)
          </label>
          <input
            type="text"
            autoComplete="off"
            placeholder="e.g. 4009900531030"
            value={inputs.barcode}
            onChange={(e) => setInput("barcode", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAssign()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
          />
        </div>
        <div className="w-40">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Category (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. BISCUITS"
            value={inputs.category}
            onChange={(e) => setInput("category", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleAssign}
            disabled={assigning || !inputs.barcode.trim()}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {assigning ? "Saving…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DataChangedCard({ item, onResolved }) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleAccept = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      await acceptChange(item.id);
      setFeedback({ type: "success", msg: "Change accepted. Item master updated." });
      setTimeout(() => onResolved(item.id), 800);
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.detail || "Failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      await rejectChange(item.id);
      setFeedback({ type: "success", msg: "Change rejected. Item master unchanged." });
      setTimeout(() => onResolved(item.id), 800);
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.detail || "Failed." });
    } finally {
      setLoading(false);
    }
  };

  const changedFields = item.changed_fields || {};

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded mt-0.5 whitespace-nowrap">
          Data Changed
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{item.item_name}</p>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{item.item_code}</span>
            <span>Outlet: {item.first_seen_outlet_name}</span>
            <span>Flagged: {item.first_seen_date}</span>
          </div>
        </div>
      </div>

      {/* Diff view */}
      <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
        {Object.entries(changedFields).map(([field, diff]) => (
          <FieldDiff key={field} field={field} diff={diff} />
        ))}
        {Object.keys(changedFields).length === 0 && (
          <p className="text-xs text-gray-400">No field details available.</p>
        )}
      </div>

      {feedback && (
        <div className="mb-3">
          <Alert type={feedback.type}>{feedback.msg}</Alert>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={loading}
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          Accept Change
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          Keep Old
        </button>
      </div>
    </div>
  );
}

export default function PendingItemsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState("");
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (isAdmin) {
      getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
    }
  }, [isAdmin]);

  const fetchPage = (p, outlet) => {
    setLoading(true);
    getPendingItems(p, outlet || null)
      .then(({ data }) => {
        // DRF PageNumberPagination returns { count, next, previous, results }
        if (data && Array.isArray(data.results)) {
          setTotalCount(data.count);
          setItems(data.results);
        } else {
          // fallback for non-paginated response
          setItems(Array.isArray(data) ? data : []);
          setTotalCount(Array.isArray(data) ? data.length : 0);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPage(page, selectedOutlet); }, [page, selectedOutlet]);

  const removeItem = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setTotalCount((c) => c - 1);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const newItems = items.filter((i) => i.change_type === "new_code" || !i.change_type);
  const changedItems = items.filter((i) => i.change_type === "data_changed");

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pending Review Queue</h1>
            <p className="text-sm text-gray-500 mt-1">
              New items need barcodes. Changed items need review before the master record is updated.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-1">
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
              <span className="text-sm text-gray-500 whitespace-nowrap">
                {totalCount} item{totalCount !== 1 ? "s" : ""} total
              </span>
            )}
          </div>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        )}

        {!loading && items.length === 0 && page === 1 && (
          <div className="text-center py-16 text-gray-400">
            <svg className="mx-auto w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">All caught up! No items awaiting review.</p>
          </div>
        )}

        {/* New items needing barcodes */}
        {newItems.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              New Items — Assign Barcode ({newItems.length})
            </h2>
            <div className="space-y-4">
              {newItems.map((item) => (
                <NewCodeCard key={item.id} item={item} onAssigned={removeItem} />
              ))}
            </div>
          </div>
        )}

        {/* Data changed items */}
        {changedItems.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Data Changes — Review Required ({changedItems.length})
            </h2>
            <div className="space-y-4">
              {changedItems.map((item) => (
                <DataChangedCard key={item.id} item={item} onResolved={removeItem} />
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 pt-4 border-t">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
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
    </Layout>
  );
}
