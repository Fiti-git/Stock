import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getItemPosHistory, searchCatalog } from "../../api/items";

// ── Change badge ──────────────────────────────────────────────────────────────
function ChangeBadge({ diff }) {
  if (!diff) return null;
  return (
    <span
      className="ml-1.5 text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded"
      title={`was ${diff.old ?? "—"}`}
    >
      ↑ was {diff.old ?? "—"}
    </span>
  );
}

// ── Cell that highlights when value changed ───────────────────────────────────
function Cell({ value, diff, className = "" }) {
  const highlight = diff ? "bg-amber-50 font-semibold" : "";
  return (
    <td className={`px-4 py-2.5 text-right ${highlight} ${className}`}>
      {value ?? <span className="text-gray-300">—</span>}
      {diff && (
        <div>
          <ChangeBadge diff={diff} />
        </div>
      )}
    </td>
  );
}

// ── Item search dropdown ──────────────────────────────────────────────────────
function ItemSearch({ onSelect }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(() => {
      setSearching(true);
      searchCatalog(q)
        .then(({ data }) => {
          const items = Array.isArray(data) ? data : (data.results ?? []);
          setResults(items.slice(0, 15));
          setOpen(items.length > 0);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (item) => {
    setQ(item.item_name);
    setOpen(false);
    onSelect(item);
  };

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl">
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by item name, code or barcode…"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
      {open && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {results.map((item) => (
            <li
              key={item.id}
              onMouseDown={() => pick(item)}
              className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-gray-400 w-24 shrink-0">{item.item_code}</span>
                <span className="text-sm font-medium text-gray-800 truncate">{item.item_name}</span>
                {item.category && (
                  <span className="ml-auto text-xs text-gray-400 shrink-0">{item.category}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ItemPosHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedItem, setSelectedItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState(null);   // { count, page, page_size, total_pages }
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Support ?item=<id> in the URL so pages can link directly
  const itemIdParam = searchParams.get("item");

  useEffect(() => {
    if (!itemIdParam) return;
    // Fetch first page to get item meta, then set selectedItem from response
    setLoading(true);
    setError(null);
    getItemPosHistory(itemIdParam, 1)
      .then(({ data }) => {
        setSelectedItem({ id: data.item_id, item_name: data.item_name, item_code: data.item_code });
        setHistory(data.history);
        setMeta({ count: data.count, page: data.page, page_size: data.page_size, total_pages: data.total_pages });
        setPage(1);
      })
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, [itemIdParam]);

  const loadPage = (itemId, p) => {
    setLoading(true);
    setError(null);
    getItemPosHistory(itemId, p)
      .then(({ data }) => {
        setHistory(data.history);
        setMeta({ count: data.count, page: data.page, page_size: data.page_size, total_pages: data.total_pages });
        setPage(p);
      })
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  };

  const handleSelect = (item) => {
    setSelectedItem(item);
    setPage(1);
    setHistory([]);
    setMeta(null);
    setSearchParams({ item: item.id });
    loadPage(item.id, 1);
  };

  const goPage = (p) => loadPage(selectedItem.id, p);

  const changedCount = history.filter((r) => Object.keys(r.changed).length > 0).length;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product POS History</h1>
          <p className="text-sm text-gray-500 mt-1">
            Daily snapshot of POS Qty, Sell Price and Cost Price per item. Amber cells show values that changed from the previous day.
          </p>
        </div>

        {/* Search */}
        <ItemSearch onSelect={handleSelect} />

        {/* Error */}
        {error && <Alert type="error">{error}</Alert>}

        {/* Loading spinner */}
        {loading && (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        )}

        {/* Results */}
        {!loading && selectedItem && history.length === 0 && (
          <div className="text-center py-16 text-gray-400">No snapshot history found for this item.</div>
        )}

        {!loading && history.length > 0 && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {/* Item info bar */}
            <div className="px-5 py-4 border-b bg-gray-50 flex flex-wrap gap-4 items-center">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Item Name</p>
                <p className="font-semibold text-gray-900">{selectedItem.item_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">SKU / Code</p>
                <p className="font-mono text-sm text-gray-700">{selectedItem.item_code}</p>
              </div>
              {meta && (
                <div className="ml-auto text-right">
                  <p className="text-xs text-gray-400">{meta.count} days of data</p>
                  {changedCount > 0 && (
                    <p className="text-xs text-amber-600 font-medium">{changedCount} row{changedCount !== 1 ? "s" : ""} with changes on this page</p>
                  )}
                </div>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">POS Qty</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Sell Price</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Cost Price</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Uploaded By</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Uploaded At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((row) => {
                    const hasChange = Object.keys(row.changed).length > 0;
                    return (
                      <tr key={row.snapshot_date} className={hasChange ? "bg-amber-50/30" : "hover:bg-gray-50"}>
                        <td className="px-4 py-2.5 font-medium text-gray-700">
                          {row.snapshot_date}
                          {hasChange && (
                            <span className="ml-2 text-[10px] font-bold text-amber-600 uppercase tracking-wide">changed</span>
                          )}
                        </td>
                        <Cell
                          value={row.pos_quantity}
                          diff={row.changed.pos_quantity}
                        />
                        <Cell
                          value={row.selling_price != null ? `${row.selling_price.toFixed(2)}` : null}
                          diff={row.changed.selling_price}
                        />
                        <Cell
                          value={row.cost_price != null ? `${row.cost_price.toFixed(2)}` : null}
                          diff={row.changed.cost_price}
                        />
                        <td className="px-4 py-2.5 text-xs text-gray-500">{row.uploaded_by ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">
                          {row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta && meta.total_pages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50">
                <button
                  onClick={() => goPage(page - 1)}
                  disabled={page === 1 || loading}
                  className="px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-40 hover:bg-white"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-500">
                  Page {page} of {meta.total_pages} — {meta.count} total days
                </span>
                <button
                  onClick={() => goPage(page + 1)}
                  disabled={page === meta.total_pages || loading}
                  className="px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-40 hover:bg-white"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {history.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-4 h-4 rounded bg-amber-50 border border-amber-200" />
            Amber = value changed from previous day. Hover the badge to see the old value.
          </div>
        )}
      </div>
    </Layout>
  );
}
