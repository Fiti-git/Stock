import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { getAllOutletsOverview } from "../../api/uploads";
import { useOutlet } from "../../contexts/OutletContext";

function todayStr() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

export default function OutletsOverviewPage() {
  const navigate = useNavigate();
  const { setSelectedOutlet } = useOutlet();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAllOutletsOverview(date)
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load overview."))
      .finally(() => setLoading(false));
  }, [date]);

  function goToHistory(outlet) {
    setSelectedOutlet({ id: outlet.outlet_id, name: outlet.outlet_name });
    navigate("/upload/history");
  }

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Outlets Overview</h1>
            <p className="text-sm text-gray-500 mt-0.5">Daily upload status across all outlets</p>
          </div>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-full sm:w-auto"
          />
        </div>

        {error && <Alert type="error">{error}</Alert>}

        {!loading && data && (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-900">{data.total_outlets}</div>
                <div className="text-xs text-gray-500 mt-0.5">Total Outlets</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{data.uploaded_count}</div>
                <div className="text-xs text-green-600 mt-0.5">Uploaded</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{data.missing_count}</div>
                <div className="text-xs text-red-500 mt-0.5">Missing</div>
              </div>
            </div>

            {/* Outlets table */}
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Outlet</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Uploaded By</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Time</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Rows</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.outlets.map((outlet) => (
                    <tr
                      key={outlet.outlet_id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => goToHistory(outlet)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {outlet.outlet_name}
                        <span className="ml-1 text-xs text-gray-400 font-normal">{outlet.short_code}</span>
                      </td>
                      <td className="px-4 py-3">
                        {outlet.uploaded ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                            Uploaded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                            Missing
                          </span>
                        )}
                        {outlet.approval_status === "pending" && (
                          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            Pending Approval
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {outlet.uploaded_by ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {outlet.uploaded_at
                          ? new Date(outlet.uploaded_at).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {outlet.total_rows ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-brand-700 text-xs">
                        History →
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {loading && <p className="text-gray-500 text-sm">Loading…</p>}
      </div>
    </Layout>
  );
}
