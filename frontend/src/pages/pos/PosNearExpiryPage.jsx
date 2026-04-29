import React, { useEffect, useState } from "react";
import { getNearExpiry } from "../../api/pos";

export default function PosNearExpiryPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState({ count: 0, total_at_risk_value: "0", results: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (d = days) => {
    setLoading(true);
    setError("");
    try {
      const r = await getNearExpiry({ days: d });
      setData(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowClass = (d2e) => {
    if (d2e === null || d2e === undefined) return "";
    if (d2e < 0) return "bg-red-50";
    if (d2e <= 7) return "bg-yellow-50";
    return "";
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Near-Expiry Stock</h1>
      <div className="flex items-end gap-2 mb-4">
        <label className="flex flex-col text-sm">
          Days ahead
          <input
            type="number"
            min={0}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value || 0))}
            className="border px-2 py-1 rounded w-24"
          />
        </label>
        <button
          onClick={() => load(days)}
          className="bg-blue-600 text-white px-3 py-1 rounded"
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
        <div className="ml-auto text-sm text-gray-600">
          {data.count} batches · At-risk value:{" "}
          <span className="font-semibold">LKR {data.total_at_risk_value}</span>
        </div>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-1 text-left">Item Code</th>
              <th className="px-2 py-1 text-left">Item Name</th>
              <th className="px-2 py-1 text-left">Batch</th>
              <th className="px-2 py-1 text-left">Expiry</th>
              <th className="px-2 py-1 text-right">Days</th>
              <th className="px-2 py-1 text-right">Qty</th>
              <th className="px-2 py-1 text-right">Value</th>
              <th className="px-2 py-1 text-left">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.batch_id} className={rowClass(r.days_to_expiry)}>
                <td className="px-2 py-1">{r.item_code}</td>
                <td className="px-2 py-1">{r.item_name}</td>
                <td className="px-2 py-1">{r.batch_no}</td>
                <td className="px-2 py-1">{r.expiry_date || "—"}</td>
                <td className="px-2 py-1 text-right">{r.days_to_expiry}</td>
                <td className="px-2 py-1 text-right">{r.qty}</td>
                <td className="px-2 py-1 text-right">{r.value}</td>
                <td className="px-2 py-1">{r.supplier_name || "—"}</td>
              </tr>
            ))}
            {data.results.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="text-center py-4 text-gray-500">
                  No batches expiring within {days} days.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
