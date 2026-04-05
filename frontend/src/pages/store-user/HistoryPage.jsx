import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getUploadHistory, deleteUpload } from "../../api/uploads";
import { useOutlet } from "../../contexts/OutletContext";

function statusBadge(s) {
  if (s === "success") return "bg-green-100 text-green-700";
  if (s === "pending") return "bg-amber-100 text-amber-700";
  if (s === "deleted") return "bg-gray-100 text-gray-400 line-through";
  return "bg-red-100 text-red-700";
}

function approvalBadge(s) {
  if (!s || s === "auto") return null;
  if (s === "pending") return <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Pending approval</span>;
  if (s === "approved") return <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Approved</span>;
  if (s === "rejected") return <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Rejected</span>;
  return null;
}

export default function HistoryPage() {
  const { outletId } = useOutlet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setLoading(true);
    getUploadHistory(outletId)
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  }, [outletId]);

  const handleDelete = async (log) => {
    setDeleting(log.id);
    setFeedback(null);
    try {
      await deleteUpload(log.id);
      setData((prev) => ({
        ...prev,
        logs: prev.logs.filter((l) => l.id !== log.id),
      }));
      setFeedback({ type: "success", msg: `Upload for ${log.snapshot_date} deleted.` });
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.detail || "Delete failed." });
    } finally {
      setDeleting(null);
      setConfirmId(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Upload History</h1>
          <Link to="/upload"
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors">
            New Upload
          </Link>
        </div>

        {feedback && (
          <div className="mb-4">
            <Alert type={feedback.type}>{feedback.msg}</Alert>
          </div>
        )}

        {data?.missing_dates?.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-700 mb-2">Missing uploads detected:</p>
            <div className="flex flex-wrap gap-2">
              {data.missing_dates.map((d) => (
                <span key={d} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-mono">{d}</span>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 font-medium text-gray-600">File</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Items</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">New</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Changed</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Uploaded</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.logs?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      No uploads yet.
                    </td>
                  </tr>
                )}
                {data?.logs?.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono">{log.snapshot_date}</td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{log.filename || "—"}</td>
                    <td className="px-4 py-3 text-right">{log.total_rows}</td>
                    <td className="px-4 py-3 text-right">
                      {log.new_items_count > 0 ? (
                        <span className="text-amber-600 font-medium">{log.new_items_count}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(log.changed_items_count ?? 0) > 0 ? (
                        <span className="text-blue-600 font-medium">{log.changed_items_count}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(log.status)}`}>
                        {log.status}
                      </span>
                      {approvalBadge(log.approval_status)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(log.uploaded_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {log.status !== "deleted" && log.approval_status !== "pending" && (
                        confirmId === log.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(log)}
                              disabled={deleting === log.id}
                              className="text-xs text-red-600 hover:text-red-800 font-medium"
                            >
                              {deleting === log.id ? "Deleting…" : "Confirm"}
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(log.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            title="Delete upload"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )
                      )}
                    </td>
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
