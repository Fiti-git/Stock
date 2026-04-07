import { useState, useEffect, useRef } from "react";
import Layout from "../../components/Layout";
import { useOutlet } from "../../contexts/OutletContext";
import { getCatalog, getItemPriceHistory } from "../../api/catalog";

function StatusBadge({ status }) {
  return status === "active" ? (
    <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-medium">Active</span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">Pending Barcode</span>
  );
}

function PriceHistoryPanel({ itemId, itemName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    getItemPriceHistory(itemId)
      .then(({ data: d }) => setData(d))
      .catch(() => setError("Could not load history."))
      .finally(() => setLoading(false));
  }, [itemId]);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Price History — {itemName}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">Close ✕</button>
      </div>

      {loading && <p className="text-sm text-gray-400 animate-pulse">Loading…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {data && (
        data.history.length === 0 ? (
          <p className="text-sm text-gray-400">No snapshot history available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 pr-4 font-medium">Date</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Sell Price</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Cost Price</th>
                  <th className="py-1.5 font-medium text-right">POS Qty</th>
                </tr>
              </thead>
              <tbody>
                {[...data.history].reverse().map((row) => (
                  <tr key={row.snapshot_date} className="border-b border-gray-100 hover:bg-white">
                    <td className="py-1.5 pr-4 font-mono text-gray-600">{row.snapshot_date}</td>
                    <td className="py-1.5 pr-4 text-right text-gray-800">
                      {row.selling_price != null ? Number(row.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                    </td>
                    <td className="py-1.5 pr-4 text-right text-gray-600">
                      {row.cost_price != null ? Number(row.cost_price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                    </td>
                    <td className="py-1.5 text-right text-gray-700">{Number(row.pos_quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

export default function CatalogPage() {
  const { selectedOutlet } = useOutlet();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const debounceRef = useRef(null);

  const load = (q, cat, pg, outletId) => {
    setLoading(true);
    setError("");
    const params = { page: pg };
    if (q) params.q = q;
    if (cat) params.category = cat;
    if (outletId) params.outlet = outletId;
    getCatalog(params)
      .then(({ data }) => {
        setItems(data.results);
        setTotalPages(data.total_pages);
        setTotalCount(data.count);
        // Collect unique categories from this page
        const cats = [...new Set(data.results.map((i) => i.category).filter(Boolean))].sort();
        if (pg === 1) setCategories(cats);
      })
      .catch(() => setError("Failed to load catalog."))
      .finally(() => setLoading(false));
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(search, category, 1, selectedOutlet?.id);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, category, selectedOutlet?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page change
  useEffect(() => {
    load(search, category, page, selectedOutlet?.id);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleHistory = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse products, prices, and upload history from POS data.
            {totalCount > 0 && <span className="ml-1 text-gray-700 font-medium">{totalCount.toLocaleString()} items</span>}
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name, SKU, or barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Table */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400 animate-pulse">Loading catalog…</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {search || category ? "No products match your search." : "No products found."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Item Name</th>
                  <th className="px-4 py-3 font-medium">SKU / Code</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Barcode</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Sell Price</th>
                  <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Cost Price</th>
                  <th className="px-4 py-3 font-medium hidden xl:table-cell">Last Updated</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <>
                    <tr
                      key={item.id}
                      onClick={() => toggleHistory(item.id)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{item.item_name}</td>
                      <td className="px-4 py-3 font-mono text-gray-600 text-xs">{item.item_code}</td>
                      <td className="px-4 py-3 font-mono text-gray-500 text-xs hidden md:table-cell">
                        {item.barcode || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                        {item.category || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {item.latest_selling_price != null
                          ? Number(item.latest_selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 })
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
                        {item.latest_cost_price != null
                          ? Number(item.latest_cost_price).toLocaleString(undefined, { minimumFractionDigits: 2 })
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden xl:table-cell">
                        {item.latest_snapshot_date || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                    {expandedId === item.id && (
                      <tr key={`history-${item.id}`}>
                        <td colSpan={8} className="px-4 pb-3">
                          <PriceHistoryPanel
                            itemId={item.id}
                            itemName={item.item_name}
                            onClose={() => setExpandedId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
