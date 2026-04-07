import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getAuditLog } from "../../api/uploads";

const ACTION_LABELS = {
  xls_upload: "XLS Upload",
  xls_upload_pending_approval: "Upload (Pending Approval)",
  approve_upload: "Approve Upload",
  reject_upload: "Reject Upload",
  delete_upload: "Delete Upload",
  assign_barcode: "Assign Barcode",
  accept_item_change: "Accept Item Change",
  reject_item_change: "Reject Item Change",
};

export default function AuditLogPage() {
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState({ count: 0, page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({}); // { [id]: true }

  const [filters, setFilters] = useState({
    entity_type: "",
    user: "",
    from_date: "",
    to_date: "",
    page: 1,
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = {};
    if (filters.entity_type) params.entity_type = filters.entity_type;
    if (filters.user) params.user = filters.user;
    if (filters.from_date) params.from_date = filters.from_date;
    if (filters.to_date) params.to_date = filters.to_date;
    params.page = filters.page;

    getAuditLog(params)
      .then((res) => {
        setRecords(res.data.results);
        setMeta({
          count: res.data.count,
          page: res.data.page,
          total_pages: res.data.total_pages,
        });
      })
      .catch(() => setError("Failed to load audit log."))
      .finally(() => setLoading(false));
  }, [filters]);

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <Layout>
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.count} records total
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <input
            type="text"
            placeholder="Username…"
            value={filters.user}
            onChange={(e) => setFilter("user", e.target.value)}
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <select
            value={filters.entity_type}
            onChange={(e) => setFilter("entity_type", e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All entity types</option>
            <option value="upload_log">Upload Log</option>
            <option value="item">Item</option>
            <option value="pending_item">Pending Item</option>
          </select>
          <input
            type="date"
            value={filters.from_date}
            onChange={(e) => setFilter("from_date", e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            placeholder="From date"
          />
          <input
            type="date"
            value={filters.to_date}
            onChange={(e) => setFilter("to_date", e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            placeholder="To date"
          />
        </div>

        {error && <Alert type="error">{error}</Alert>}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-gray-500 text-sm">No audit records found.</p>
        ) : (
          <>
            <div className="bg-white border rounded-lg overflow-hidden mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Timestamp</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Entity</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.map((rec) => (
                      <>
                        <tr key={rec.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                            {new Date(rec.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{rec.username}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {ACTION_LABELS[rec.action] ?? rec.action}
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden sm:table-cell text-xs">
                            {rec.entity_type} #{rec.entity_id}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => toggleExpand(rec.id)}
                              className="text-xs text-brand-700 hover:underline"
                            >
                              {expanded[rec.id] ? "Hide" : "Show"}
                            </button>
                          </td>
                        </tr>
                        {expanded[rec.id] && (
                          <tr key={`${rec.id}-detail`} className="bg-gray-50">
                            <td colSpan={5} className="px-4 py-3">
                              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-100 rounded p-3 overflow-x-auto">
                                {JSON.stringify(rec.details, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                Page {meta.page} of {meta.total_pages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
                  disabled={meta.page <= 1}
                  className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
                  disabled={meta.page >= meta.total_pages}
                  className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
