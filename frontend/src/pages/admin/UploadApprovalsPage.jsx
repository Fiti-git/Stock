import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getPendingApprovals, approveUpload, rejectUpload, getUploadDiff } from "../../api/uploads";

function DiffModal({ log, onClose, onApprove, onReject, processing }) {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getUploadDiff(log.id)
      .then(({ data }) => setDiff(data))
      .catch(() => setError("Could not load preview."))
      .finally(() => setLoading(false));
  }, [log.id]);

  const isProcessing = processing && processing.startsWith(String(log.id));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Upload Preview</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {log.outlet_name} · <span className="font-mono text-amber-700">{log.snapshot_date}</span>
              {" · "}{log.filename}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading && <div className="text-center py-10 text-gray-400">Loading diff…</div>}
          {error && <Alert type="error">{error}</Alert>}

          {diff && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Total Rows", value: diff.summary.total, color: "bg-gray-50 text-gray-700 border-gray-200" },
                  { label: "Matched", value: diff.summary.matched, color: "bg-green-50 text-green-700 border-green-200" },
                  { label: "New Items", value: diff.summary.new_items, color: "bg-amber-50 text-amber-700 border-amber-200" },
                  { label: "Suspicious", value: diff.summary.suspicious, color: diff.summary.suspicious > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-400 border-gray-200" },
                ].map((card) => (
                  <div key={card.label} className={`rounded-lg border px-4 py-3 text-center ${card.color}`}>
                    <div className="text-2xl font-bold">{card.value}</div>
                    <div className="text-xs font-medium mt-0.5">{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Suspicious items */}
              {diff.suspicious_items.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    Suspicious Price Changes ({diff.suspicious_items.length})
                  </h3>
                  <div className="rounded-lg border border-red-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-red-50 text-left">
                          <th className="px-3 py-2 font-medium text-red-700">Item Code</th>
                          <th className="px-3 py-2 font-medium text-red-700">Item Name</th>
                          <th className="px-3 py-2 font-medium text-red-700 text-right">Old Sell</th>
                          <th className="px-3 py-2 font-medium text-red-700 text-right">New Sell</th>
                          <th className="px-3 py-2 font-medium text-red-700 text-right">Change %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {diff.suspicious_items.map((item) => (
                          <tr key={item.item_code} className="bg-white">
                            <td className="px-3 py-2 font-mono text-gray-600">{item.item_code}</td>
                            <td className="px-3 py-2 text-gray-800 max-w-xs truncate">{item.item_name}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                              {item.old_selling_price != null ? Number(item.old_selling_price).toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-700">
                              {item.new_selling_price != null ? Number(item.new_selling_price).toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-bold text-red-700">
                              {item.pct_change != null ? `${item.pct_change}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* New items */}
              {diff.new_items.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-700 mb-2">
                    New Items ({diff.new_items.length})
                  </h3>
                  <div className="rounded-lg border border-amber-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-amber-50 text-left">
                          <th className="px-3 py-2 font-medium text-amber-700">Item Code</th>
                          <th className="px-3 py-2 font-medium text-amber-700">Item Name</th>
                          <th className="px-3 py-2 font-medium text-amber-700 text-right">Cost</th>
                          <th className="px-3 py-2 font-medium text-amber-700 text-right">Sell</th>
                          <th className="px-3 py-2 font-medium text-amber-700 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {diff.new_items.map((item) => (
                          <tr key={item.item_code} className="bg-white">
                            <td className="px-3 py-2 font-mono text-gray-600">{item.item_code}</td>
                            <td className="px-3 py-2 text-gray-800 max-w-xs truncate">{item.item_name}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                              {item.cost_price != null ? Number(item.cost_price).toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                              {item.selling_price != null ? Number(item.selling_price).toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                              {item.pos_quantity != null ? Number(item.pos_quantity).toFixed(0) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 px-6 py-4 border-t shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={() => onApprove(log.id)}
            disabled={isProcessing}
            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
          >
            {processing === log.id + "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            onClick={() => onReject(log.id)}
            disabled={isProcessing}
            className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold rounded-lg border border-red-200 disabled:opacity-40"
          >
            {processing === log.id + "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UploadApprovalsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [previewLog, setPreviewLog] = useState(null);

  const load = () => {
    setLoading(true);
    getPendingApprovals()
      .then(({ data }) => setLogs(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handle = async (logId, action) => {
    setProcessing(logId + action);
    setFeedback(null);
    try {
      if (action === "approve") {
        const { data } = await approveUpload(logId);
        setFeedback({ type: "success", msg: `Approved: ${data.total_rows ?? ""} rows imported.` });
      } else {
        await rejectUpload(logId);
        setFeedback({ type: "success", msg: "Upload rejected and discarded." });
      }
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      setPreviewLog(null);
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.detail || "Action failed." });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Upload Approvals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Past-date uploads submitted by store users waiting for approval before data is committed.
          </p>
        </div>

        {feedback && (
          <div className="mb-4">
            <Alert type={feedback.type}>{feedback.msg}</Alert>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-3">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No pending approvals.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">Outlet</th>
                  <th className="px-4 py-3 font-medium text-gray-600">XLS Date</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Uploaded By</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Submitted</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Breakdown</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const isProcessing = processing && processing.startsWith(String(log.id));
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{log.outlet_name}</td>
                      <td className="px-4 py-3 font-mono text-amber-700 font-semibold">{log.snapshot_date}</td>
                      <td className="px-4 py-3 text-gray-600">{log.uploaded_by_username}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(log.uploaded_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            {log.total_rows} rows
                          </span>
                          {log.matched_rows > 0 && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                              {log.matched_rows} matched
                            </span>
                          )}
                          {log.new_items_count > 0 && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                              {log.new_items_count} new
                            </span>
                          )}
                          {log.changed_items_count > 0 && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              {log.changed_items_count} changed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setPreviewLog(log)}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => handle(log.id, "approve")}
                            disabled={isProcessing}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                          >
                            {processing === log.id + "approve" ? "Approving…" : "Approve"}
                          </button>
                          <button
                            onClick={() => handle(log.id, "reject")}
                            disabled={isProcessing}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg border border-red-200 transition-colors disabled:opacity-40"
                          >
                            {processing === log.id + "reject" ? "Rejecting…" : "Reject"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 text-center">
          Use Preview to inspect the upload before approving. Approving will process the stored XLS and commit snapshots.
          Rejecting will discard the file permanently.
        </p>
      </div>

      {previewLog && (
        <DiffModal
          log={previewLog}
          onClose={() => setPreviewLog(null)}
          onApprove={(id) => handle(id, "approve")}
          onReject={(id) => handle(id, "reject")}
          processing={processing}
        />
      )}
    </Layout>
  );
}
