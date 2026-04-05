import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getShrinkage } from "../../api/analytics";
import { useOutlet } from "../../contexts/OutletContext";

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function weeksAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toLocaleDateString("en-CA");
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function ShrinkagePage() {
  const { outletId } = useOutlet();

  const [period, setPeriod] = useState("weekly");
  const [from, setFrom] = useState(weeksAgoStr(4));
  const [to, setTo] = useState(todayStr());
  const [category, setCategory] = useState("");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getShrinkage({ outletId, period, from, to, category: category || undefined })
      .then(({ data }) => setData(data))
      .catch(() => setError("Failed to load shrinkage data."))
      .finally(() => setLoading(false));
  }, [outletId, period, from, to, category]);

  const periods = data?.periods ?? [];
  const summary = data?.summary;

  // Top items across all periods (aggregate)
  const topItemsMap = {};
  periods.forEach((p) => {
    p.top_items?.forEach((item) => {
      if (!topItemsMap[item.item_code]) {
        topItemsMap[item.item_code] = { ...item };
      } else {
        topItemsMap[item.item_code].shrinkage_qty += item.shrinkage_qty;
        topItemsMap[item.item_code].shrinkage_value += item.shrinkage_value;
      }
    });
  });
  const topItems = Object.values(topItemsMap)
    .sort((a, b) => b.shrinkage_qty - a.shrinkage_qty)
    .slice(0, 10);

  return (
    <Layout>
      <div className="max-w-5xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Shrinkage Analytics</h1>

        {/* Filters */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Period toggle */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Period</label>
              <div className="flex border rounded overflow-hidden text-sm">
                {["weekly", "monthly"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-4 py-2 capitalize ${
                      period === p ? "bg-brand-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              />
            </div>

            {/* Category filter */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="All categories"
                className="border rounded px-3 py-2 text-sm w-40"
              />
            </div>

            {/* Quick range buttons */}
            <div className="flex gap-1 self-end pb-0.5">
              {[
                { label: "4W", weeks: 4 },
                { label: "8W", weeks: 8 },
                { label: "12W", weeks: 12 },
              ].map(({ label, weeks }) => (
                <button
                  key={label}
                  onClick={() => { setFrom(weeksAgoStr(weeks)); setTo(todayStr()); }}
                  className="px-2 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <Alert type="error">{error}</Alert>}

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <>
            {/* Summary cards */}
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard
                  label="Total Shrinkage Qty"
                  value={summary.total_shrinkage_qty.toFixed(2)}
                  sub="units missing across period"
                />
                <SummaryCard
                  label="Total Shrinkage Value"
                  value={`Rs ${Number(summary.total_shrinkage_value).toLocaleString("en-LK", { maximumFractionDigits: 0 })}`}
                  sub="at cost price"
                />
                <SummaryCard
                  label="Worst Category"
                  value={summary.worst_category ?? "—"}
                  sub="highest shrinkage value"
                />
              </div>
            )}

            {periods.length === 0 ? (
              <Alert type="info">No count data found for the selected date range. Enter physical counts first.</Alert>
            ) : (
              <>
                {/* Line chart — shrinkage qty over time */}
                <div className="bg-white border rounded-xl p-5 shadow-sm">
                  <h2 className="font-semibold text-gray-700 mb-4">Shrinkage Quantity Over Time</h2>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={periods} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(val) => [val.toFixed(2), "Shrinkage qty"]}
                        labelStyle={{ fontSize: 12 }}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="total_shrinkage_qty"
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar chart — shrinkage value over time */}
                <div className="bg-white border rounded-xl p-5 shadow-sm">
                  <h2 className="font-semibold text-gray-700 mb-4">Shrinkage Value Over Time (Rs)</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={periods} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(val) => [`Rs ${Number(val).toLocaleString()}`, "Shrinkage value"]}
                        labelStyle={{ fontSize: 12 }}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="total_shrinkage_value" fill="#15803d" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Top shrinkage items table */}
                {topItems.length > 0 && (
                  <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b">
                      <h2 className="font-semibold text-gray-900">Top Shrinkage Items</h2>
                      <p className="text-xs text-gray-400 mt-0.5">aggregated across selected period</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b text-left">
                            <th className="px-4 py-3 font-medium text-gray-600">#</th>
                            <th className="px-4 py-3 font-medium text-gray-600">Item Code</th>
                            <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                            <th className="px-4 py-3 font-medium text-gray-600">Category</th>
                            <th className="px-4 py-3 font-medium text-gray-600 text-right">Shrinkage Qty</th>
                            <th className="px-4 py-3 font-medium text-gray-600 text-right">Shrinkage Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {topItems.map((item, idx) => (
                            <tr key={item.item_code} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.item_code}</td>
                              <td className="px-4 py-2.5 font-medium">{item.item_name}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">{item.category || "—"}</td>
                              <td className={`px-4 py-2.5 text-right font-medium ${item.shrinkage_qty > 0 ? "text-red-600" : "text-green-600"}`}>
                                {item.shrinkage_qty > 0 ? "+" : ""}{item.shrinkage_qty.toFixed(2)}
                              </td>
                              <td className={`px-4 py-2.5 text-right ${item.shrinkage_value > 0 ? "text-red-600" : "text-green-600"}`}>
                                Rs {Number(item.shrinkage_value).toLocaleString("en-LK", { maximumFractionDigits: 0 })}
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
          </>
        )}
      </div>
    </Layout>
  );
}
