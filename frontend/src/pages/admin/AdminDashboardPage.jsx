import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { getAdminSummary, getVariances, getAlerts, getCountProgress } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

// ── Primitives ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "gray" }) {
  const s = {
    gray:   { wrap: "bg-white border-gray-200",      val: "text-gray-900" },
    amber:  { wrap: "bg-amber-50 border-amber-200",  val: "text-amber-700" },
    red:    { wrap: "bg-red-50 border-red-200",      val: "text-red-700" },
    green:  { wrap: "bg-green-50 border-green-200",  val: "text-green-700" },
    blue:   { wrap: "bg-blue-50 border-blue-200",    val: "text-blue-700" },
    indigo: { wrap: "bg-indigo-50 border-indigo-200", val: "text-indigo-700" },
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
      <span className="ml-1 opacity-60">{active ? (order === "asc" ? "↑" : "↓") : "↕"}</span>
    </th>
  );
}

function Skeleton({ className = "" }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className}`} />;
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { outletId, selectedOutlet } = useOutlet();

  const [summary,       setSummary]       = useState(null);
  const [summaryLoad,   setSummaryLoad]   = useState(true);

  const [varData,       setVarData]       = useState(null);
  const [alerts,        setAlerts]        = useState(null);
  const [progress,      setProgress]      = useState(null);
  const [outletLoading, setOutletLoading] = useState(false);

  // Variance table state
  const [page,        setPage]        = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [orderBy,     setOrderBy]     = useState("variance_abs");
  const [order,       setOrder]       = useState("desc");
  const [search,      setSearch]      = useState("");

  // Outlet status table sort
  const [outletOrderBy, setOutletOrderBy] = useState("outlet_name");
  const [outletOrder,   setOutletOrder]   = useState("asc");

  useEffect(() => {
    setSummaryLoad(true);
    getAdminSummary()
      .then((r) => setSummary(r.data))
      .catch(() => {})
      .finally(() => setSummaryLoad(false));
  }, []);

  useEffect(() => {
    if (!outletId) return;
    setOutletLoading(true);
    setPage(0);
    setSearch("");
    Promise.all([getVariances(outletId, 1, 500), getAlerts(outletId), getCountProgress(outletId)])
      .then(([v, a, p]) => { setVarData(v.data); setAlerts(a.data); setProgress(p.data); })
      .catch(() => {})
      .finally(() => setOutletLoading(false));
  }, [outletId]);

  // Derived variance
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

  function handleVarSort(col) {
    if (orderBy === col) setOrder((o) => o === "asc" ? "desc" : "asc");
    else { setOrderBy(col); setOrder("desc"); }
    setPage(0);
  }

  // Derived outlet table
  const outletRows = [...(summary?.outlets ?? [])].sort((a, b) => {
    const va = a[outletOrderBy];
    const vb = b[outletOrderBy];
    if (typeof va === "boolean") return outletOrder === "asc" ? (va === vb ? 0 : va ? -1 : 1) : (va === vb ? 0 : va ? 1 : -1);
    if (va < vb) return outletOrder === "asc" ? -1 : 1;
    if (va > vb) return outletOrder === "asc" ? 1 : -1;
    return 0;
  });

  function handleOutletSort(col) {
    if (outletOrderBy === col) setOutletOrder((o) => o === "asc" ? "desc" : "asc");
    else { setOutletOrderBy(col); setOutletOrder("desc"); }
  }

  function SortOutletTh({ col, label, align = "left" }) {
    const active = outletOrderBy === col;
    return (
      <th
        className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 cursor-pointer select-none whitespace-nowrap hover:text-gray-800 bg-gray-50 ${align === "right" || align === "center" ? "text-" + align : "text-left"}`}
        onClick={() => handleOutletSort(col)}
      >
        {label} <span className="ml-1 opacity-60">{active ? (outletOrder === "asc" ? "↑" : "↓") : "↕"}</span>
      </th>
    );
  }

  const countPct = progress && progress.total_items > 0
    ? Math.round((progress.counted / progress.total_items) * 100) : 0;

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{summary?.today ?? "—"}</p>
        </div>

        {/* System-wide stat cards */}
        {summaryLoad ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Outlets"          value={summary?.outlet_count ?? 0}                           sub="active outlets"      color="indigo" />
            <StatCard label="Total Items"       value={(summary?.total_items ?? 0).toLocaleString()}         sub="across all outlets"  color="blue" />
            <StatCard label="Pending Barcodes"  value={(summary?.total_pending_barcodes ?? 0).toLocaleString()} sub="need assignment"  color={summary?.total_pending_barcodes > 0 ? "amber" : "gray"} />
            <StatCard label="Negative POS Today" value={(summary?.total_negative_today ?? 0).toLocaleString()} sub="items below zero" color={summary?.total_negative_today > 0 ? "red" : "gray"} />
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: "/admin/upload-approvals", label: "Upload Approvals",   bg: "bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100" },
            { to: "/admin/negative-pos",     label: "Negative POS Report", bg: "bg-red-50 border-red-200 text-red-800 hover:bg-red-100" },
            { to: "/admin/users",            label: "Manage Users",        bg: "bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100" },
            { to: "/admin/audit-log",        label: "Audit Log",           bg: "bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100" },
          ].map((l) => (
            <Link key={l.to} to={l.to}
              className={`border rounded-xl px-4 py-3 text-sm font-medium text-center transition-colors ${l.bg}`}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Negative POS widget */}
        {!summaryLoad && summary?.outlets?.some((o) => o.negative_items > 0) && (
          <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-red-100 flex items-center justify-between bg-red-50">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <h2 className="font-semibold text-red-900 text-base">Negative POS — Today</h2>
              </div>
              <Link
                to="/admin/negative-pos"
                className="text-xs font-medium text-red-700 hover:text-red-900 hover:underline"
              >
                View Full Report →
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {summary.outlets
                .filter((o) => o.negative_items > 0)
                .sort((a, b) => b.negative_items - a.negative_items)
                .map((o) => (
                  <div key={o.outlet_id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm font-medium text-gray-800">{o.outlet_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="inline-block bg-red-100 text-red-700 text-xs font-semibold rounded px-2 py-0.5">
                        {o.negative_items} item{o.negative_items !== 1 ? "s" : ""}
                      </span>
                      <Link
                        to={`/admin/negative-pos?outlet=${o.outlet_id}`}
                        className="text-xs text-gray-400 hover:text-red-600 hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Per-outlet status table */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-lg">Outlet Status — Today</h2>
            <span className="text-xs text-gray-400">{summary?.outlet_count ?? 0} outlets</span>
          </div>
          {summaryLoad ? (
            <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <SortOutletTh col="outlet_name"      label="Outlet" />
                    <SortOutletTh col="item_count"       label="Items"           align="right" />
                    <SortOutletTh col="uploaded_today"   label="Uploaded Today"  align="center" />
                    <SortOutletTh col="counted_today"    label="Counted Today"   align="right" />
                    <SortOutletTh col="pending_barcodes" label="Pending Barcodes" align="right" />
                    <SortOutletTh col="negative_items"   label="Negative POS"    align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {outletRows.map((o) => (
                    <tr key={o.outlet_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{o.outlet_name}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{o.item_count.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-center">
                        {o.uploaded_today
                          ? <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold rounded px-2 py-0.5">✓ Yes</span>
                          : <span className="inline-block bg-red-100 text-red-700 text-xs font-semibold rounded px-2 py-0.5">✗ No</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{o.counted_today.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">
                        {o.pending_barcodes > 0
                          ? <span className="inline-block bg-amber-100 text-amber-700 text-xs font-semibold rounded px-2 py-0.5">{o.pending_barcodes}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {o.negative_items > 0
                          ? <span className="inline-block bg-red-100 text-red-700 text-xs font-semibold rounded px-2 py-0.5">{o.negative_items}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                  {outletRows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No outlet data.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected outlet detail */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {selectedOutlet?.name ?? "—"} — Outlet Detail
          </h2>
          <p className="text-xs text-gray-400 mb-4">Switch outlet using the selector in the top bar.</p>

          {/* Count progress + alert pills */}
          {outletLoading ? (
            <Skeleton className="h-20 mb-4" />
          ) : progress && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-white border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Count Progress</h3>
                  <span className="font-bold text-gray-800 text-sm">{countPct}%</span>
                </div>
                <ProgressBar pct={countPct} color={countPct === 100 ? "green" : "indigo"} />
                <p className="text-xs text-gray-400 mt-2">{progress.counted} of {progress.total_items} items</p>
              </div>

              <div className="flex flex-col gap-2 justify-center">
                {alerts && (
                  <>
                    {!progress.has_upload_today && (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        No XLS uploaded today
                      </div>
                    )}
                    {alerts.missing_uploads?.length > 0 && (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        {alerts.missing_uploads.length} missing upload day(s)
                      </div>
                    )}
                    {alerts.pending_barcodes > 0 && (
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
                        <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                        {alerts.pending_barcodes} pending barcode(s)
                      </div>
                    )}
                    {alerts.negative_items?.length > 0 && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-800">
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        {alerts.negative_items.length} negative POS item(s)
                      </div>
                    )}
                    {progress.has_upload_today && !alerts.missing_uploads?.length && !alerts.pending_barcodes && !alerts.negative_items?.length && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800">
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        All good — no alerts for this outlet
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Variance table */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">Variance Report</h3>
                {varData && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Snapshot: <strong className="text-gray-600">{varData.snapshot_date}</strong>
                    {" · "}{filtered.length} of {allRows.length} items{search ? " (filtered)" : ""}
                  </p>
                )}
              </div>
              <input
                type="text"
                placeholder="Search item…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="border rounded-lg px-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {outletLoading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <SortTh col="item_code"    label="Code"     orderBy={orderBy} order={order} onSort={handleVarSort} />
                        <SortTh col="item_name"    label="Name"     orderBy={orderBy} order={order} onSort={handleVarSort} />
                        <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">Category</th>
                        <SortTh col="pos_qty"      label="POS Qty"  orderBy={orderBy} order={order} onSort={handleVarSort} align="right" />
                        <SortTh col="actual_qty"   label="Counted"  orderBy={orderBy} order={order} onSort={handleVarSort} align="right" />
                        <SortTh col="variance_abs" label="Variance" orderBy={orderBy} order={order} onSort={handleVarSort} align="right" />
                        <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">Location</th>
                        <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">Last Counted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                            {!outletId ? "Select an outlet to view variances." : search ? "No items match." : "No variance data yet."}
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((row) => (
                          <tr key={row.item_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">{row.item_code}</td>
                            <td className="px-3 py-2.5 font-medium max-w-[180px]">
                              <Link to={`/items/${row.item_id}`} className="hover:underline text-indigo-700">{row.item_name}</Link>
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

                {/* Pagination */}
                <div className="px-4 py-3 border-t bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }} className="border rounded px-2 py-1 text-sm">
                      {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span className="text-gray-400 ml-2">
                      {sorted.length === 0 ? "0" : `${page * rowsPerPage + 1}–${Math.min((page + 1) * rowsPerPage, sorted.length)}`} of {sorted.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(0)}            disabled={page === 0}            className="px-2 py-1 border rounded text-xs hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                    <button onClick={() => setPage((p) => p - 1)} disabled={page === 0}            className="px-2 py-1 border rounded text-xs hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
                    <span className="px-3">Page {page + 1} of {totalPages}</span>
                    <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} className="px-2 py-1 border rounded text-xs hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">›</button>
                    <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-2 py-1 border rounded text-xs hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">»</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </Layout>
  );
}
