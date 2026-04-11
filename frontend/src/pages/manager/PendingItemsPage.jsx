import { useState, useEffect, useRef } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getPendingItems, assignBarcode, acceptChange, rejectChange } from "../../api/items";
import { getOutlets } from "../../api/outlets";
import { useAuth } from "../../contexts/AuthContext";

function NewCodeCard({ item, onAssigned }) {
  const [assigning, setAssigning] = useState(false);
  const [inputs, setInputs] = useState({ barcode: "", category: "", rack_number: "", shelf: "" });
  const [feedback, setFeedback] = useState(null);

  const setInput = (field, value) => setInputs((prev) => ({ ...prev, [field]: value }));

  const handleAssign = async () => {
    const barcode = inputs.barcode.trim();
    if (!barcode) return;
    setAssigning(true);
    setFeedback(null);
    try {
      await assignBarcode(item.id, barcode, inputs.category, inputs.rack_number, inputs.shelf);
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
    <div className="bg-white rounded-xl shadow-sm overflow-hidden flex border border-gray-200">
      {/* Left amber stripe */}
      <div className="w-1 shrink-0 bg-amber-400" />

      <div className="flex-1 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-base font-bold text-gray-900 leading-snug">{item.item_name}</p>
            <span className="inline-block mt-1 font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {item.item_code}
            </span>
          </div>
          <span className="shrink-0 text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-full whitespace-nowrap">
            New Item
          </span>
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
          <span>First seen: <span className="font-medium text-gray-700">{item.first_seen_date}</span></span>
          <span>Outlet: <span className="font-medium text-gray-700">{item.first_seen_outlet_name}</span></span>
        </div>

        {feedback && (
          <div className="mb-3">
            <Alert type={feedback.type}>{feedback.msg}</Alert>
          </div>
        )}

        {/* Barcode input — full width, prominent */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Barcode</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M4 6h1v12H4V6zm2 0h1v12H6V6zm3 0h2v12H9V6zm3 0h1v12h-1V6zm3 0h1v12h-1V6zm2 0h2v12h-2V6z" />
              </svg>
            </span>
            <input
              type="text"
              autoComplete="off"
              placeholder="Scan or type barcode…"
              value={inputs.barcode}
              onChange={(e) => setInput("barcode", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAssign()}
              className="w-full border-2 border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm font-mono
                focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        {/* Optional fields — 3-col grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { field: "category", label: "Category", placeholder: "BISCUITS" },
            { field: "rack_number", label: "Rack No.", placeholder: "R3" },
            { field: "shelf", label: "Shelf", placeholder: "S2" },
          ].map(({ field, label, placeholder }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input
                type="text"
                placeholder={placeholder}
                value={inputs[field]}
                onChange={(e) => setInput(field, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs
                  focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          ))}
        </div>

        {/* Assign button */}
        <button
          onClick={handleAssign}
          disabled={assigning || !inputs.barcode.trim()}
          className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold
            rounded-lg transition-colors disabled:opacity-40"
        >
          {assigning ? "Saving…" : "Assign Barcode"}
        </button>
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
    <div className="bg-white rounded-xl shadow-sm overflow-hidden flex border border-gray-200">
      {/* Left blue stripe */}
      <div className="w-1 shrink-0 bg-blue-500" />

      <div className="flex-1 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-base font-bold text-gray-900 leading-snug">{item.item_name}</p>
            <span className="inline-block mt-1 font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {item.item_code}
            </span>
          </div>
          <span className="shrink-0 text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-1 rounded-full whitespace-nowrap">
            Data Changed
          </span>
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-3">
          <span>Outlet: <span className="font-medium text-gray-700">{item.first_seen_outlet_name}</span></span>
          <span>Flagged: <span className="font-medium text-gray-700">{item.first_seen_date}</span></span>
          {item.rack_number && <span>Rack: <span className="font-medium text-gray-700">{item.rack_number}</span></span>}
          {item.shelf && <span>Shelf: <span className="font-medium text-gray-700">{item.shelf}</span></span>}
        </div>

        {/* Diff pill rows */}
        <div className="flex flex-col gap-2 mb-4">
          {Object.entries(changedFields).map(([field, diff]) => (
            <div key={field} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500 capitalize w-24 shrink-0">
                {field.replace(/_/g, " ")}
              </span>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded line-through">
                {diff.old ?? "—"}
              </span>
              <span className="text-gray-400 text-xs">→</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                {diff.new ?? "—"}
              </span>
            </div>
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

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold
              rounded-lg transition-colors disabled:opacity-40"
          >
            Accept Update
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="flex-1 py-2.5 border-2 border-gray-300 hover:bg-gray-50 text-gray-700 text-sm
              font-semibold rounded-lg transition-colors disabled:opacity-40"
          >
            Keep Original
          </button>
        </div>
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
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("new");
  const searchTimer = useRef(null);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (isAdmin) {
      getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
    }
  }, [isAdmin]);

  const fetchPage = (p, outlet, q) => {
    setLoading(true);
    getPendingItems(p, outlet || null, q || "")
      .then(({ data }) => {
        if (data && Array.isArray(data.results)) {
          setTotalCount(data.count);
          setItems(data.results);
        } else {
          setItems(Array.isArray(data) ? data : []);
          setTotalCount(Array.isArray(data) ? data.length : 0);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPage(page, selectedOutlet, search); }, [page, selectedOutlet]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchPage(1, selectedOutlet, val);
    }, 300);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setTotalCount((c) => c - 1);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const newItems = items.filter((i) => i.change_type === "new_code" || !i.change_type);
  const changedItems = items.filter((i) => i.change_type === "data_changed");

  const tabs = [
    { key: "new", label: "New Items", count: newItems.length },
    { key: "changed", label: "Data Changes", count: changedItems.length },
  ];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pending Review Queue</h1>
            <p className="text-sm text-gray-500 mt-1">
              New items need barcodes. Changed items need review before the master record is updated.
            </p>
          </div>
          {totalCount > 0 && (
            <span className="text-sm bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full font-medium">
              {totalCount} pending
            </span>
          )}
        </div>

        {/* Filter bar */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input
              type="text"
              placeholder="Item code or name…"
              value={search}
              onChange={handleSearchChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          {isAdmin && outlets.length > 0 && (
            <div className="sm:w-52">
              <label className="block text-xs font-medium text-gray-500 mb-1">Outlet</label>
              <select
                value={selectedOutlet}
                onChange={(e) => { setSelectedOutlet(e.target.value); setPage(1); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">All Outlets</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.outlet_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200 mb-6">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${activeTab === tab.key
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
              >
                {tab.label}
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold
                  ${activeTab === tab.key ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <svg className="mx-auto w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">
              {search ? "No items match your search." : "All caught up! No items awaiting review."}
            </p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <>
            {activeTab === "new" && (
              newItems.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-medium text-gray-500">
                    {search ? "No new items match your search." : "No new items awaiting barcode assignment."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {newItems.map((item) => (
                    <NewCodeCard key={item.id} item={item} onAssigned={removeItem} />
                  ))}
                </div>
              )
            )}

            {activeTab === "changed" && (
              changedItems.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-medium text-gray-500">
                    {search ? "No data changes match your search." : "No data changes pending review."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {changedItems.map((item) => (
                    <DataChangedCard key={item.id} item={item} onResolved={removeItem} />
                  ))}
                </div>
              )
            )}
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-200">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page <span className="font-semibold text-gray-800">{page}</span> of{" "}
              <span className="font-semibold text-gray-800">{totalPages}</span>
              {" · "}
              <span className="font-semibold text-gray-800">{totalCount}</span> items total
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
