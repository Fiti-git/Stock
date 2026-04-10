import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getNegativePosReport } from "../../api/items";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(num, decimals = 2) {
  if (num == null) return "—";
  return Number(num).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function downloadCSV(date, outlets) {
  const rows = [
    ["Date", "Outlet", "Item Code", "Item Name", "POS Qty", "Selling Price", "Cost Price", "Line Cost Value"],
  ];
  for (const outlet of outlets) {
    for (const item of outlet.items) {
      rows.push([
        date,
        outlet.outlet_name,
        item.item_code,
        `"${item.item_name.replace(/"/g, '""')}"`,
        item.pos_quantity,
        item.selling_price ?? "",
        item.cost_price,
        item.line_cost_value,
      ]);
    }
    rows.push([date, outlet.outlet_name, "", "TOTAL COST VALUE", "", "", "", outlet.total_cost_value]);
  }

  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `negative-pos-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function NegativePosReportPage() {
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setError(null);
    setData(null);
    getNegativePosReport(date)
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load report. Check the date and try again."))
      .finally(() => setLoading(false));
  }, [date]);

  const outlets = data?.outlets ?? [];
  const totalItems = outlets.reduce((sum, o) => sum + o.items.length, 0);
  const grandTotal = outlets.reduce((sum, o) => sum + o.total_cost_value, 0);

  return (
    <Layout>
      <div className="max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Negative POS Report</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Items with negative POS quantity by date, grouped by outlet
            </p>
          </div>
          {data && outlets.length > 0 && (
            <button
              onClick={() => downloadCSV(data.date, outlets)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded hover:bg-brand-800 transition-colors"
            >
              Download CSV
            </button>
          )}
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          {data && (
            <span className="text-sm text-gray-500">
              {totalItems} negative item{totalItems !== 1 ? "s" : ""} across {outlets.length} outlet{outlets.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {error && <Alert type="error">{error}</Alert>}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : outlets.length === 0 && data ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No items with negative POS quantity on {date}.
          </div>
        ) : (
          <>
            {/* Grand total summary */}
            {outlets.length > 1 && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-lg px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-red-800">Grand Total Cost Value (all outlets)</span>
                <span className="text-lg font-bold text-red-900">{fmt(grandTotal)}</span>
              </div>
            )}

            {/* One section per outlet */}
            {outlets.map((outlet) => (
              <div key={outlet.outlet_id} className="mb-8">
                {/* Outlet header */}
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-semibold text-gray-800">{outlet.outlet_name}</h2>
                  <span className="text-sm text-gray-500">
                    {outlet.items.length} item{outlet.items.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="bg-white border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Item Code</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Item Name</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">POS Qty</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Selling Price</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Cost Price</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Cost Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {outlet.items.map((item) => (
                          <tr key={item.item_code} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                              {item.item_code}
                            </td>
                            <td className="px-4 py-3 text-gray-900">{item.item_name}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-medium text-red-600">{fmt(item.pos_quantity, 3)}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">{fmt(item.selling_price)}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{fmt(item.cost_price)}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(item.line_cost_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-red-50 border-t-2 border-red-200">
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-red-800">
                            Total Cost Value
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-red-900">
                            {fmt(outlet.total_cost_value)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Layout>
  );
}
