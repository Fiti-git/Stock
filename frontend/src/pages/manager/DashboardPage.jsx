import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getCountProgress, getVariances, getAlerts } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

function ProgressBar({ counted, total }) {
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{counted} of {total} items counted today</span>
        <span className="text-gray-500">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-brand-600 h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function varianceColor(v) {
  if (v === null) return "text-gray-400";
  if (v < 0) return "text-red-600 font-medium";
  if (v > 0) return "text-green-600 font-medium";
  return "text-gray-700";
}

export default function DashboardPage() {
  const { outletId } = useOutlet();
  const [progress, setProgress] = useState(null);
  const [variances, setVariances] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getCountProgress(outletId), getVariances(outletId), getAlerts(outletId)])
      .then(([p, v, a]) => {
        setProgress(p.data);
        setVariances(v.data);
        setAlerts(a.data);
      })
      .finally(() => setLoading(false));
  }, [outletId]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-gray-400">Loading dashboard…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
          <div className="text-sm text-gray-500">{progress?.today}</div>
        </div>

        {/* Alerts */}
        {alerts && (
          <div className="space-y-3">
            {!progress?.has_upload_today && (
              <Alert type="warning">
                Today's XLS has not been uploaded yet.&nbsp;
                <Link to="/upload" className="underline font-medium">Upload now</Link>
              </Alert>
            )}
            {alerts.missing_uploads?.length > 0 && (
              <Alert type="warning">
                Missing uploads for: {alerts.missing_uploads.join(", ")}
              </Alert>
            )}
            {alerts.pending_barcodes > 0 && (
              <Alert type="info">
                {alerts.pending_barcodes} item(s) need barcodes assigned.&nbsp;
                <Link to="/dashboard/pending" className="underline font-medium">Review now</Link>
              </Alert>
            )}
            {alerts.negative_items?.length > 0 && (
              <Alert type="error">
                {alerts.negative_items.length} item(s) with negative stock detected.
              </Alert>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
            Today's Count Progress
          </h2>
          {progress && (
            <ProgressBar counted={progress.counted} total={progress.total_items} />
          )}
          <div className="flex gap-4 mt-4 text-sm text-gray-600">
            <div>
              Total in system: <span className="font-medium">{progress?.total_items ?? "—"}</span>
            </div>
            <div>
              Pending barcodes: <span className="font-medium text-amber-600">{progress?.pending_barcodes ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Variance table */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Variance Report</h2>
            <span className="text-xs text-gray-400">sorted by largest gap first</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">Item Code</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">POS Qty</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Actual</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Variance</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Location</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Last Counted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {variances.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      No data yet. Upload today's XLS to see variances.
                    </td>
                  </tr>
                )}
                {variances.map((row) => (
                  <tr key={row.item_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{row.item_code}</td>
                    <td className="px-4 py-2.5 font-medium">
                      <Link to={`/items/${row.item_id}`} className="hover:underline text-brand-700">
                        {row.item_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{row.category || "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={row.pos_qty < 0 ? "text-red-600 font-medium" : ""}>
                        {row.pos_qty}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.actual_qty !== null ? row.actual_qty : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${varianceColor(row.variance)}`}>
                      {row.variance !== null
                        ? (row.variance > 0 ? `+${row.variance}` : row.variance)
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{row.location_tag || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{row.last_counted || "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Negative stock detail */}
        {alerts?.negative_items?.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-red-200">
              <h2 className="font-semibold text-red-800">Negative Stock Alerts</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-red-700 border-b border-red-200">
                  <th className="px-4 py-2 font-medium">Item Code</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium text-right">POS Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {alerts.negative_items.map((item) => (
                  <tr key={item.item_code}>
                    <td className="px-4 py-2 font-mono text-xs">{item.item_code}</td>
                    <td className="px-4 py-2">{item.item_name}</td>
                    <td className="px-4 py-2 text-right font-bold text-red-700">{item.pos_qty}</td>
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
