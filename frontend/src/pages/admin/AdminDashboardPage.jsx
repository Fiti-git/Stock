import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { getAdminSummary, getVariances, getAlerts, getCountProgress } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

// MUI
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TableSortLabel, Paper, Chip, LinearProgress,
  Skeleton, Tooltip,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import StorefrontIcon from "@mui/icons-material/Storefront";
import InventoryIcon from "@mui/icons-material/Inventory";
import LabelOffIcon from "@mui/icons-material/LabelOff";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";

// ── Helpers ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "gray", Icon }) {
  const styles = {
    gray:  { wrap: "bg-white border-gray-200",   val: "text-gray-900",   icon: "text-gray-400"  },
    amber: { wrap: "bg-amber-50 border-amber-200", val: "text-amber-700", icon: "text-amber-400" },
    red:   { wrap: "bg-red-50 border-red-200",    val: "text-red-700",    icon: "text-red-400"   },
    green: { wrap: "bg-green-50 border-green-200", val: "text-green-700", icon: "text-green-400" },
    blue:  { wrap: "bg-blue-50 border-blue-200",  val: "text-blue-700",   icon: "text-blue-400"  },
    indigo:{ wrap: "bg-indigo-50 border-indigo-200", val: "text-indigo-700", icon: "text-indigo-400" },
  };
  const s = styles[color] ?? styles.gray;
  return (
    <div className={`border rounded-xl p-5 flex items-start gap-4 ${s.wrap}`}>
      {Icon && <Icon className={`mt-1 shrink-0 ${s.icon}`} />}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span className={`text-3xl font-bold leading-tight ${s.val}`}>{value}</span>
        {sub && <span className="text-xs text-gray-400 mt-0.5">{sub}</span>}
      </div>
    </div>
  );
}

function varianceChip(v) {
  if (v === null || v === undefined) return <span className="text-gray-300 text-xs">—</span>;
  if (v < 0) return <Chip label={v} size="small" sx={{ bgcolor: "#fef2f2", color: "#dc2626", fontWeight: 600, fontSize: 12 }} />;
  if (v > 0) return <Chip label={`+${v}`} size="small" sx={{ bgcolor: "#f0fdf4", color: "#16a34a", fontWeight: 600, fontSize: 12 }} />;
  return <Chip label="0" size="small" sx={{ bgcolor: "#f9fafb", color: "#6b7280", fontSize: 12 }} />;
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { outletId, selectedOutlet } = useOutlet();

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [varData, setVarData] = useState(null);
  const [varLoading, setVarLoading] = useState(false);
  const [alerts, setAlerts] = useState(null);
  const [progress, setProgress] = useState(null);
  const [outletLoading, setOutletLoading] = useState(false);

  // Table state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [orderBy, setOrderBy] = useState("variance_abs");
  const [order, setOrder] = useState("desc");
  const [search, setSearch] = useState("");

  // Outlet table sort
  const [outletOrder, setOutletOrder] = useState("asc");
  const [outletOrderBy, setOutletOrderBy] = useState("outlet_name");

  // Load system-wide summary
  useEffect(() => {
    setSummaryLoading(true);
    getAdminSummary()
      .then((r) => setSummary(r.data))
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  // Load selected outlet's variance + alerts + progress
  useEffect(() => {
    if (!outletId) return;
    setOutletLoading(true);
    setPage(0);
    setSearch("");
    Promise.all([
      getVariances(outletId, 1, 500),
      getAlerts(outletId),
      getCountProgress(outletId),
    ])
      .then(([v, a, p]) => {
        setVarData(v.data);
        setAlerts(a.data);
        setProgress(p.data);
      })
      .catch(() => {})
      .finally(() => setOutletLoading(false));
  }, [outletId]);

  // Derived variance rows
  const allRows = varData?.results ?? [];
  const filtered = allRows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.item_code.toLowerCase().includes(q) ||
      r.item_name.toLowerCase().includes(q) ||
      (r.category || "").toLowerCase().includes(q)
    );
  });
  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if (orderBy === "variance_abs") {
      va = a.variance !== null ? Math.abs(a.variance) : -1;
      vb = b.variance !== null ? Math.abs(b.variance) : -1;
    } else if (orderBy === "variance") {
      va = a.variance ?? -Infinity;
      vb = b.variance ?? -Infinity;
    } else {
      va = (a[orderBy] ?? 0);
      vb = (b[orderBy] ?? 0);
    }
    if (va < vb) return order === "asc" ? -1 : 1;
    if (va > vb) return order === "asc" ? 1 : -1;
    return 0;
  });
  const pageRows = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  function handleSort(col) {
    if (orderBy === col) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setOrderBy(col); setOrder("desc"); }
    setPage(0);
  }

  // Outlet table sort
  const outletRows = [...(summary?.outlets ?? [])].sort((a, b) => {
    const va = a[outletOrderBy];
    const vb = b[outletOrderBy];
    if (typeof va === "boolean") return outletOrder === "asc" ? (va === vb ? 0 : va ? -1 : 1) : (va === vb ? 0 : va ? 1 : -1);
    if (va < vb) return outletOrder === "asc" ? -1 : 1;
    if (va > vb) return outletOrder === "asc" ? 1 : -1;
    return 0;
  });

  function handleOutletSort(col) {
    if (outletOrderBy === col) setOutletOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setOutletOrderBy(col); setOutletOrder("desc"); }
  }

  const countPct = progress && progress.total_items > 0
    ? Math.round((progress.counted / progress.total_items) * 100)
    : 0;

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{summary?.today ?? "—"}</p>
        </div>

        {/* System-wide stat cards */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={96} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Outlets"
              value={summary?.outlet_count ?? 0}
              sub="active outlets"
              color="indigo"
              Icon={StorefrontIcon}
            />
            <StatCard
              label="Total Items"
              value={(summary?.total_items ?? 0).toLocaleString()}
              sub="across all outlets"
              color="blue"
              Icon={InventoryIcon}
            />
            <StatCard
              label="Pending Barcodes"
              value={(summary?.total_pending_barcodes ?? 0).toLocaleString()}
              sub="need assignment"
              color={summary?.total_pending_barcodes > 0 ? "amber" : "gray"}
              Icon={LabelOffIcon}
            />
            <StatCard
              label="Negative POS Today"
              value={(summary?.total_negative_today ?? 0).toLocaleString()}
              sub="items below zero"
              color={summary?.total_negative_today > 0 ? "red" : "gray"}
              Icon={TrendingDownIcon}
            />
          </div>
        )}

        {/* Per-outlet status table */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-lg">Outlet Status — Today</h2>
            <span className="text-xs text-gray-400">{summary?.outlet_count ?? 0} outlets</span>
          </div>
          {summaryLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} height={40} />)}
            </div>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 0 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { bgcolor: "#f9fafb", fontWeight: 600, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" } }}>
                    <TableCell>
                      <TableSortLabel active={outletOrderBy === "outlet_name"} direction={outletOrderBy === "outlet_name" ? outletOrder : "asc"} onClick={() => handleOutletSort("outlet_name")}>
                        Outlet
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel active={outletOrderBy === "item_count"} direction={outletOrderBy === "item_count" ? outletOrder : "asc"} onClick={() => handleOutletSort("item_count")}>
                        Items
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">Uploaded Today</TableCell>
                    <TableCell align="right">
                      <TableSortLabel active={outletOrderBy === "counted_today"} direction={outletOrderBy === "counted_today" ? outletOrder : "asc"} onClick={() => handleOutletSort("counted_today")}>
                        Counted Today
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel active={outletOrderBy === "pending_barcodes"} direction={outletOrderBy === "pending_barcodes" ? outletOrder : "asc"} onClick={() => handleOutletSort("pending_barcodes")}>
                        Pending Barcodes
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel active={outletOrderBy === "negative_items"} direction={outletOrderBy === "negative_items" ? outletOrder : "asc"} onClick={() => handleOutletSort("negative_items")}>
                        Negative POS
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {outletRows.map((o) => (
                    <TableRow key={o.outlet_id} hover sx={{ "&:last-child td": { borderBottom: 0 } }}>
                      <TableCell sx={{ fontWeight: 500 }}>{o.outlet_name}</TableCell>
                      <TableCell align="right" sx={{ color: "#374151" }}>{o.item_count.toLocaleString()}</TableCell>
                      <TableCell align="center">
                        {o.uploaded_today
                          ? <Tooltip title="Uploaded"><CheckCircleIcon sx={{ color: "#16a34a", fontSize: 18 }} /></Tooltip>
                          : <Tooltip title="Not uploaded"><CancelIcon sx={{ color: "#ef4444", fontSize: 18 }} /></Tooltip>
                        }
                      </TableCell>
                      <TableCell align="right" sx={{ color: "#374151" }}>{o.counted_today.toLocaleString()}</TableCell>
                      <TableCell align="right">
                        {o.pending_barcodes > 0
                          ? <Chip label={o.pending_barcodes} size="small" sx={{ bgcolor: "#fffbeb", color: "#b45309", fontWeight: 600, fontSize: 12 }} />
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </TableCell>
                      <TableCell align="right">
                        {o.negative_items > 0
                          ? <Chip label={o.negative_items} size="small" sx={{ bgcolor: "#fef2f2", color: "#dc2626", fontWeight: 600, fontSize: 12 }} />
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>

        {/* Selected outlet section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {selectedOutlet?.name ?? "Select an outlet"} — Detail
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Use the outlet selector in the top bar to switch outlets.
          </p>

          {/* Outlet progress + alerts */}
          {outletLoading ? (
            <Skeleton variant="rounded" height={80} />
          ) : progress && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-white border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Count Progress</h3>
                  <span className="font-bold text-gray-800 text-sm">{countPct}%</span>
                </div>
                <LinearProgress
                  variant="determinate"
                  value={countPct}
                  sx={{
                    height: 8, borderRadius: 4, bgcolor: "#e5e7eb",
                    "& .MuiLinearProgress-bar": { borderRadius: 4, bgcolor: countPct === 100 ? "#16a34a" : "#4f46e5" },
                  }}
                />
                <p className="text-xs text-gray-400 mt-2">{progress.counted} of {progress.total_items} items</p>
              </div>
              <div className="space-y-2">
                {alerts && (
                  <>
                    {!progress.has_upload_today && (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                        <WarningAmberIcon fontSize="small" className="text-amber-500" />
                        No XLS uploaded today
                      </div>
                    )}
                    {alerts.pending_barcodes > 0 && (
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
                        <LabelOffIcon fontSize="small" className="text-blue-400" />
                        {alerts.pending_barcodes} pending barcode(s)
                      </div>
                    )}
                    {alerts.negative_items?.length > 0 && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-800">
                        <ErrorOutlineIcon fontSize="small" className="text-red-400" />
                        {alerts.negative_items.length} negative POS item(s)
                      </div>
                    )}
                    {progress.has_upload_today && alerts.pending_barcodes === 0 && alerts.negative_items?.length === 0 && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800">
                        <CheckCircleIcon fontSize="small" className="text-green-500" />
                        All good — no alerts for this outlet
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Variance table for selected outlet */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">Variance Report</h3>
                {varData && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Snapshot: <strong>{varData.snapshot_date}</strong> · {filtered.length} of {allRows.length} items
                    {search && " (filtered)"}
                  </p>
                )}
              </div>
              <input
                type="text"
                placeholder="Search item…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="border rounded-lg px-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {outletLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} height={36} />)}
              </div>
            ) : (
              <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 0 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ "& th": { bgcolor: "#f9fafb", fontWeight: 600, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" } }}>
                      <TableCell>
                        <TableSortLabel active={orderBy === "item_code"} direction={orderBy === "item_code" ? order : "asc"} onClick={() => handleSort("item_code")}>Code</TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel active={orderBy === "item_name"} direction={orderBy === "item_name" ? order : "asc"} onClick={() => handleSort("item_name")}>Name</TableSortLabel>
                      </TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">
                        <TableSortLabel active={orderBy === "pos_qty"} direction={orderBy === "pos_qty" ? order : "asc"} onClick={() => handleSort("pos_qty")}>POS Qty</TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel active={orderBy === "actual_qty"} direction={orderBy === "actual_qty" ? order : "asc"} onClick={() => handleSort("actual_qty")}>Counted</TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel active={orderBy === "variance_abs"} direction={orderBy === "variance_abs" ? order : "asc"} onClick={() => handleSort("variance_abs")}>Variance</TableSortLabel>
                      </TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Last Counted</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pageRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 6, color: "#9ca3af", fontSize: 13 }}>
                          {!outletId ? "Select an outlet to view variances." : search ? "No items match." : "No variance data yet."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      pageRows.map((row) => (
                        <TableRow key={row.item_id} hover sx={{ "&:last-child td": { borderBottom: 0 } }}>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{row.item_code}</TableCell>
                          <TableCell sx={{ fontWeight: 500, fontSize: 13 }}>
                            <Link to={`/items/${row.item_id}`} className="hover:underline text-indigo-700">
                              {row.item_name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {row.category
                              ? <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{row.category}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </TableCell>
                          <TableCell align="right">
                            <span className={`text-sm font-medium ${row.pos_qty < 0 ? "text-red-600" : "text-gray-800"}`}>{row.pos_qty}</span>
                          </TableCell>
                          <TableCell align="right">
                            <span className="text-sm text-gray-700">
                              {row.actual_qty !== null ? row.actual_qty : <span className="text-gray-300">—</span>}
                            </span>
                          </TableCell>
                          <TableCell align="right">{varianceChip(row.variance)}</TableCell>
                          <TableCell sx={{ fontSize: 11, color: "#9ca3af" }}>{row.location_tag || "—"}</TableCell>
                          <TableCell sx={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{row.last_counted || "Never"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <TablePagination
                  component="div"
                  count={filtered.length}
                  page={page}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  sx={{ borderTop: "1px solid #f3f4f6", fontSize: 12 }}
                />
              </TableContainer>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: "/admin/upload-approvals", label: "Upload Approvals", bg: "bg-indigo-50 border-indigo-200 text-indigo-800" },
            { to: "/admin/negative-pos", label: "Negative POS Report", bg: "bg-red-50 border-red-200 text-red-800" },
            { to: "/admin/users", label: "Manage Users", bg: "bg-gray-50 border-gray-200 text-gray-800" },
            { to: "/admin/audit-log", label: "Audit Log", bg: "bg-gray-50 border-gray-200 text-gray-800" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`border rounded-xl px-4 py-3 text-sm font-medium text-center hover:opacity-80 transition-opacity ${l.bg}`}
            >
              {l.label}
            </Link>
          ))}
        </div>

      </div>
    </Layout>
  );
}
