import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getNegativePosReport } from "../../api/items";
import { getOutlets } from "../../api/outlets";

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

const PAGE_SIZE = 10;

export default function NegativePosReportPage() {
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(todayStr());
  const [selectedOutletId, setSelectedOutletId] = useState(searchParams.get("outlet") ?? "");
  const [outletList, setOutletList] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeCardId, setActiveCardId] = useState(null);
  const [paginations, setPaginations] = useState({});
  const outletRefs = useRef({});

  // Load outlet dropdown once on mount
  useEffect(() => {
    getOutlets()
      .then(({ data: d }) => setOutletList(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Fetch report when date or outlet filter changes
  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setError(null);
    setData(null);
    setPaginations({});
    setActiveCardId(null);
    getNegativePosReport(date, selectedOutletId || null)
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load report. Check the date and try again."))
      .finally(() => setLoading(false));
  }, [date, selectedOutletId]);

  const reportOutlets = data?.outlets ?? [];
  const totalItems = reportOutlets.reduce((sum, o) => sum + o.items.length, 0);
  const grandTotal = reportOutlets.reduce((sum, o) => sum + o.total_cost_value, 0);

  function setOutletPage(outletId, page) {
    setPaginations((prev) => ({ ...prev, [outletId]: page }));
  }

  function scrollToOutlet(outletId) {
    setActiveCardId(outletId);
    outletRefs.current[outletId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
          {data && reportOutlets.length > 0 && (
            <button
              onClick={() => downloadCSV(data.date, reportOutlets)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded hover:bg-brand-800 transition-colors"
            >
              Download CSV
            </button>
          )}
        </div>

        {/* Controls row: date + outlet filter */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Outlet</label>
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="border rounded px-3 py-2 text-sm min-w-[160px]"
            >
              <option value="">All Outlets</option>
              {outletList.map((o) => (
                <option key={o.id} value={o.id}>{o.outlet_name}</option>
              ))}
            </select>
          </div>
          {data && totalItems > 0 && (
            <span className="text-sm text-gray-500 ml-auto">
              {totalItems} item{totalItems !== 1 ? "s" : ""} across {reportOutlets.length} outlet{reportOutlets.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {error && <Alert type="error">{error}</Alert>}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : reportOutlets.length === 0 && data ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No items with negative POS quantity on {date}.
          </div>
        ) : (
          <>
            {/* Grand total banner */}
            {reportOutlets.length > 0 && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-lg px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-red-800">Grand Total Cost Value (all outlets)</span>
                <span className="text-lg font-bold text-red-900">{fmt(grandTotal)}</span>
              </div>
            )}

            {/* Outlet summary cards — horizontal scroll row */}
            {reportOutlets.length > 0 && (
              <div className="overflow-x-auto mb-8">
                <div className="flex gap-3 pb-2" style={{ minWidth: "max-content" }}>
                  {reportOutlets.map((outlet) => (
                    <button
                      key={outlet.outlet_id}
                      onClick={() => scrollToOutlet(outlet.outlet_id)}
                      className={`w-48 shrink-0 bg-white rounded-xl border p-4 text-left shadow-sm transition-all
                        ${activeCardId === outlet.outlet_id
                          ? "border-red-500 ring-2 ring-red-300"
                          : "border-gray-200 hover:border-red-300 hover:shadow-md"}`}
                    >
                      <p className="text-xs font-medium text-gray-500 truncate mb-1">{outlet.outlet_name}</p>
                      <p className="text-xl font-bold text-red-600 leading-tight">{fmt(outlet.total_cost_value)}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {outlet.items.length} item{outlet.items.length !== 1 ? "s" : ""}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Per-outlet tables */}
            {reportOutlets.map((outlet) => {
              const currentPage = paginations[outlet.outlet_id] ?? 1;
              const totalPages = Math.ceil(outlet.items.length / PAGE_SIZE);
              const pageItems = outlet.items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
              const startItem = (currentPage - 1) * PAGE_SIZE + 1;
              const endItem = Math.min(currentPage * PAGE_SIZE, outlet.items.length);

              return (
                <div
                  key={outlet.outlet_id}
                  ref={(el) => { outletRefs.current[outlet.outlet_id] = el; }}
                  className="mb-8 scroll-mt-6"
                >
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
                          {pageItems.map((item) => (
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

                    {/* Per-table pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-2.5 border-t bg-gray-50 text-sm text-gray-500">
                        <span>Showing {startItem}–{endItem} of {outlet.items.length}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setOutletPage(outlet.outlet_id, currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-white transition-colors"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setOutletPage(outlet.outlet_id, currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-white transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Layout>
  );
}
