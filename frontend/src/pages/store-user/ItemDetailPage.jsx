import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getItemDetail } from "../../api/items";

function varianceColor(v) {
  if (v === null) return "text-gray-400";
  if (v < 0) return "text-red-600 font-semibold";
  if (v > 0) return "text-green-600 font-semibold";
  return "text-gray-700";
}

const STATUS_BADGE = {
  active: "bg-green-100 text-green-700",
  pending_barcode: "bg-amber-100 text-amber-700",
};

export default function ItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getItemDetail(id)
      .then((res) => setItem(res.data))
      .catch(() => setError("Item not found or you do not have access."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
      </Layout>
    );
  }

  if (error || !item) {
    return (
      <Layout>
        <Alert type="error">{error || "Item not found."}</Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl">
        {/* Back link */}
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-brand-700 hover:underline mb-4 inline-block"
        >
          ← Back
        </button>

        {/* Item header */}
        <div className="bg-white border rounded-lg p-5 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">{item.item_name}</h1>
              <div className="flex flex-wrap gap-2 text-sm text-gray-500">
                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{item.item_code}</span>
                {item.barcode && <span>Barcode: <span className="font-mono">{item.barcode}</span></span>}
                {item.category && <span>{item.category}</span>}
                <span>{item.outlet_name}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[item.status] || "bg-gray-100 text-gray-600"}`}>
                  {item.status === "pending_barcode" ? "Pending Barcode" : "Active"}
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-400">
              Added {item.created_at?.slice(0, 10)}
              {item.barcode_assigned_at && (
                <div>Barcode assigned {item.barcode_assigned_at?.slice(0, 10)}</div>
              )}
            </div>
          </div>

          {/* Variance summary */}
          <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Latest POS Qty</div>
              <div className="text-lg font-mono font-semibold">
                {item.latest_pos_qty !== null ? item.latest_pos_qty : <span className="text-gray-300">—</span>}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Latest Actual Qty</div>
              <div className="text-lg font-mono font-semibold">
                {item.latest_actual_qty !== null ? item.latest_actual_qty : <span className="text-gray-300">—</span>}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Variance</div>
              <div className={`text-lg font-mono ${varianceColor(item.variance)}`}>
                {item.variance !== null
                  ? (item.variance > 0 ? `+${item.variance}` : item.variance)
                  : <span className="text-gray-300">—</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Two-column history */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* POS Snapshot History */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-sm text-gray-700">POS Snapshot History</h2>
              <p className="text-xs text-gray-400">Last 30 uploads</p>
            </div>
            {item.pos_history.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400">No snapshots yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-gray-500 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-left">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {item.pos_history.map((snap) => (
                      <tr key={snap.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono">{snap.snapshot_date}</td>
                        <td className={`px-3 py-2 text-right font-mono ${snap.pos_quantity < 0 ? "text-red-600" : ""}`}>
                          {snap.pos_quantity}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">{snap.cost_price ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{snap.selling_price ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-400">{snap.uploaded_by_username || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Physical Count History */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-sm text-gray-700">Physical Count History</h2>
              <p className="text-xs text-gray-400">Last 30 counts</p>
            </div>
            {item.count_history.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400">No counts recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-gray-500 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-left">Location</th>
                      <th className="px-3 py-2 text-left">By</th>
                      <th className="px-3 py-2 text-center">M/E</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {item.count_history.map((sc) => (
                      <tr key={sc.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono">{sc.count_date}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium">{sc.actual_qty}</td>
                        <td className="px-3 py-2 text-gray-500">{sc.location_tag || "—"}</td>
                        <td className="px-3 py-2 text-gray-400">{sc.counted_by_username || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          {sc.is_month_end ? <span className="text-blue-600 font-bold">✓</span> : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
