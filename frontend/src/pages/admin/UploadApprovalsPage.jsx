import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getPendingApprovals, approveUpload, rejectUpload } from "../../api/uploads";

export default function UploadApprovalsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [feedback, setFeedback] = useState(null);

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
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.detail || "Action failed." });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
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
                  <th className="px-4 py-3 font-medium text-gray-600">File</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Rows</th>
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
                      <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-xs">{log.filename}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{log.total_rows}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
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
          Approving will process the stored XLS file and commit snapshots for that date.
          Rejecting will discard the file permanently.
        </p>
      </div>
    </Layout>
  );
}
