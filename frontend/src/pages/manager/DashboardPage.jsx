import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { getCountProgress, getVariances, getAlerts } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

// ── Tiny UI primitives ────────────────────────────────────────────────────

function AlertBanner({ type, children }) {
  const s = {
    warning: "bg-amber-50 border-amber-300 text-amber-900",
    error:   "bg-red-50 border-red-300 text-red-900",
    info:    "bg-blue-50 border-blue-300 text-blue-900",
    success: "bg-green-50 border-green-300 text-green-900",
  }[type] ?? "bg-blue-50 border-blue-300 text-blue-900";
  const dot = {
    warning: "bg-amber-400", error: "bg-red-500", info: "bg-blue-500", success: "bg-green-500",
  }[type] ?? "bg-blue-500";
  return (
    <div className={`flex items-start gap-3 border rounded-lg px-4 py-3 text-sm ${s}`}>
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span>{children}</span>
    </div>
  );
}

function StatCard({ label, value, sub, color = "gray" }) {
  const s = {
    gray:   { wrap: "bg-white border-gray-200",   val: "text-gray-900" },
    amber:  { wrap: "bg-amber-50 border-amber-200", val: "text-amber-700" },
    red:    { wrap: "bg-red-50 border-red-200",    val: "text-red-700" },
    green:  { wrap: "bg-green-50 border-green-200", val: "text-green-700" },
    blue:   { wrap: "bg-blue-50 border-blue-200",  val: "text-blue-700" },
  }[color] ?? { wrap: "bg-white border-gray-200", val: "text-gray-900" };
  return (
    <div className={`border rounded-xl p-5 ${s.wrap}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold leading-tight ${s.val}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ProgressBar({ pct, color = "indigo" }) {
  const bar = { indigo: "bg-indigo-600", green: "bg-green-500" }[color] ?? "bg-indigo-600";
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
      <div className={`${bar} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function VarianceChip({ v }) {
  if (v === null || v === undefined) return <span className="text-gray-300">—</span>;
  if (v < 0)  return <span className="inline-block bg-red-100 text-red-700 font-semibold text-xs rounded px-2 py-0.5">{v}</span>;
  if (v > 0)  return <span className="inline-block bg-green-100 text-green-700 font-semibold text-xs rounded px-2 py-0.5">+{v}</span>;
  return <span className="inline-block bg-gray-100 text-gray-500 text-xs rounded px-2 py-0.5">0</span>;
}

function SortTh({ col, label, orderBy, order, onSort, align = "left" }) {
  const active = orderBy === col;
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 cursor-pointer select-none whitespace-nowrap hover:text-gray-800 ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(col)}
    >
      {label}
      <span className="ml-1 opacity-60">
        {active ? (order === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { outletId } = useOutlet();

  const [progress, setProgress] = useState(null);
  const [alerts,   setAlerts]   = useState(null);
  const [varData,  setVarData]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [varLoading, setVarLoading] = useState(false);

  // Table controls
  const [page,        setPage]        = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [orderBy,     setOrderBy]     = useState("variance_abs");
  const [order,       setOrder]       = useState("desc");
  const [search,      setSearch]      = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([getCountProgress(outletId), getAlerts(outletId)])
      .then(([p, a]) => { setProgress(p.data); setAlerts(a.data); })
      .finally(() => setLoading(false));
  }, [outletId]);

  const fetchVariances = useCallback(() => {
    setVarLoading(true);
    getVariances(outletId, 1, 500)
      .then((r) => setVarData(r.data))
      .finally(() => setVarLoading(false));
  }, [outletId]);

  useEffect(() => { fetchVariances(); setPage(0); setSearch(""); }, [fetchVariances]);

  // Derived
  const allRows = varData?.results ?? [];
  const filtered = allRows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.item_code.toLowerCase().includes(q) || r.item_name.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q);
  });
  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if (orderBy === "variance_abs") { va = a.variance != null ? Math.abs(a.variance) : -1; vb = b.variance != null ? Math.abs(b.variance) : -1; }
    else if (orderBy === "variance") { va = a.variance ?? -Infinity; vb = b.variance ?? -Infinity; }
    else { va = a[orderBy] ?? ""; vb = b[orderBy] ?? ""; }
    if (va < vb) return order === "asc" ? -1 : 1;
    if (va > vb) return order === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const pageRows   = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  function handleSort(col) {
    if (orderBy === col) setOrder((o) => o === "asc" ? "desc" : "asc");
    else { setOrderBy(col); setOrder("desc"); }
    setPage(0);
  }

  const countPct = progress && progress.total_items > 0
    ? Math.round((progress.counted / progress.total_items) * 100) : 0;

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">{progress?.today ?? "—"}</p>
          </div>
        </div>

        {/* Alerts */}
        {!loading && alerts && (
          <div className="space-y-2">
            {!progress?.has_upload_today && (
              <AlertBanner type="warning">
                Today's XLS has not been uploaded yet.{" "}
                <Link to="/upload" className="font-semibold underline">Upload now</Link>
              </AlertBanner>
            )}
            {alerts.missing_uploads?.length > 0 && (
              <AlertBanner type="warning">
                Missing uploads for: <strong>{alerts.missing_uploads.join(", ")}</strong>
              </AlertBanner>
            )}
            {alerts.pending_barcodes > 0 && (
              <AlertBanner type="info">
                <strong>{alerts.pending_barcodes}</strong> item(s) need barcodes assigned.{" "}
                <Link to="/dashboard/pending" className="font-semibold underline">Review now</Link>
              </AlertBanner>
            )}
            {alerts.negative_items?.length > 0 && (
              <AlertBanner type="error">
                <strong>{alerts.negative_items.length}</strong> item(s) have negative POS quantity today.
              </AlertBanner>
            )}
            {progress?.has_upload_today && !alerts.missing_uploads?.length && !alerts.pending_barcodes && !alerts.negative_items?.length && (
              <AlertBanner type="success">All good — upload complete, no alerts.</AlertBanner>
            )}
          </div>
        )}

        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="border rounded-xl p-5 bg-white animate-pulse h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Items in System" value={(progress?.total_items ?? 0).toLocaleString()} sub="from latest POS upload" />
            <StatCard
              label="Counted Today"
              value={progress?.counted ?? 0}
              sub={`of ${progress?.total_items ?? 0} items`}
              color={countPct === 100 ? "green" : countPct > 50 ? "blue" : "gray"}
            />
            <StatCard
              label="Pending Barcodes"
              value={progress?.pending_barcodes ?? 0}
              sub="need assignment"
              color={progress?.pending_barcodes > 0 ? "amber" : "gray"}
            />
            <StatCard
              label="Negative POS"
              value={alerts?.negative_items?.length ?? 0}
              sub="items below zero today"
              color={alerts?.negative_items?.length > 0 ? "red" : "gray"}
            />
          </div>
        )}

        {/* Progress bar */}
        {!loading && progress && (
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Today's Count Progress</h2>
              <span className="text-sm font-bold text-gray-800">{countPct}%</span>
            </div>
            <ProgressBar pct={countPct} color={countPct === 100 ? "green" : "indigo"} />
            <p className="text-xs text-gray-400 mt-2">{progress.counted} of {progress.total_items} items counted</p>
          </div>
        )}

        {/* Variance table */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">Variance Report</h2>
              {varData && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Snapshot: <strong className="text-gray-600">{varData.snapshot_date}</strong>
                  {" · "}{filtered.length} of {allRows.length} items{search ? " (filtered)" : ""}
                </p>
              )}
            </div>
            <input
              type="text"
              placeholder="Search code, name or category…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="border rounded-lg px-3 py-2 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {varLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <SortTh col="item_code"    label="Code"     orderBy={orderBy} order={order} onSort={handleSort} />
                      <SortTh col="item_name"    label="Name"     orderBy={orderBy} order={order} onSort={handleSort} />
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 text-left">Category</th>
                      <SortTh col="pos_qty"      label="POS Qty"  orderBy={orderBy} order={order} onSort={handleSort} align="right" />
                      <SortTh col="actual_qty"   label="Counted"  orderBy={orderBy} order={order} onSort={handleSort} align="right" />
                      <SortTh col="variance_abs" label="Variance" orderBy={orderBy} order={order} onSort={handleSort} align="right" />
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 text-left">Location</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 text-left">Last Counted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                          {search ? "No items match your search." : "No variance data yet. Upload today's XLS first."}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => (
                        <tr key={row.item_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">{row.item_code}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[180px]">
                            <Link to={`/items/${row.item_id}`} className="hover:underline text-indigo-700">
                              {row.item_name}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            {row.category
                              ? <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{row.category}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`font-medium ${row.pos_qty < 0 ? "text-red-600" : "text-gray-800"}`}>{row.pos_qty}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700">
                            {row.actual_qty !== null ? row.actual_qty : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right"><VarianceChip v={row.variance} /></td>
                          <td className="px-3 py-2.5 text-xs text-gray-400">{row.location_tag || "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{row.last_counted || "Never"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="px-4 py-3 border-t bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span className="text-gray-400 ml-2">
                    {sorted.length === 0 ? "0" : `${page * rowsPerPage + 1}–${Math.min((page + 1) * rowsPerPage, sorted.length)}`} of {sorted.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(0)}          disabled={page === 0}            className="px-2 py-1 border rounded text-xs hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                  <button onClick={() => setPage((p) => p - 1)} disabled={page === 0}           className="px-2 py-1 border rounded text-xs hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
                  <span className="px-3">Page {page + 1} of {totalPages}</span>
                  <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} className="px-2 py-1 border rounded text-xs hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">›</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-2 py-1 border rounded text-xs hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">»</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Negative stock detail */}
        {!loading && alerts?.negative_items?.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-red-200 flex items-center justify-between">
              <h2 className="font-semibold text-red-800">Negative Stock — {alerts.negative_items.length} item(s)</h2>
              <Link to="/admin/negative-pos" className="text-xs text-red-700 underline font-medium">Full report</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-red-700 border-b border-red-200 text-xs uppercase tracking-wide">
                    <th className="px-4 py-2 font-semibold">Item Code</th>
                    <th className="px-4 py-2 font-semibold">Name</th>
                    <th className="px-4 py-2 font-semibold text-right">POS Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {alerts.negative_items.map((item) => (
                    <tr key={item.item_code} className="hover:bg-red-100/40">
                      <td className="px-4 py-2 font-mono text-xs text-red-700">{item.item_code}</td>
                      <td className="px-4 py-2 text-red-900">{item.item_name}</td>
                      <td className="px-4 py-2 text-right font-bold text-red-700">{item.pos_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
