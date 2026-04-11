import { useState, useEffect, useCallback } from "react";
import Layout from "../../components/Layout";
import { getDailyCounts } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

export default function CountedStockDailyPage() {
  const { outletId } = useOutlet();
  const today = new Date().toISOString().slice(0, 10);

  const [countDate, setCountDate] = useState(today);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDailyCounts({ outletId, countDate, search, page, pageSize: PAGE_SIZE });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [outletId, countDate, search, page]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [outletId, countDate, search]);

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Counted Stock Daily</h1>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <input
            type="date"
            value={countDate}
            onChange={e => setCountDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search item code or name…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={load}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Refresh
          </button>
        </div>

        {/* Summary bar */}
        {data && (
          <p className="text-sm text-gray-500 mb-3">
            {data.count} record{data.count !== 1 ? "s" : ""} for{" "}
            <span className="font-semibold text-gray-700">{countDate}</span>
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 text-left">Item Code</th>
                  <th className="px-4 py-3 text-left">Item Name</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-right">Qty Counted</th>
                  <th className="px-4 py-3 text-left">Counted By</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && data?.results?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      No counts recorded for this date.
                    </td>
                  </tr>
                )}
                {!loading && data?.results?.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700">{row.item_code}</td>
                    <td className="px-4 py-3 text-gray-900">{row.item_name}</td>
                    <td className="px-4 py-3 text-gray-500">{row.category || "—"}</td>
                    <td className="px-4 py-3">
                      {row.location_tag ? (
                        <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                          {row.location_tag}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{row.actual_qty}</td>
                    <td className="px-4 py-3 text-gray-500">{row.counted_by_username || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {row.counted_at ? new Date(row.counted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="text-sm px-4 py-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="text-sm px-4 py-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
