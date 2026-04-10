import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { getCountProgress, getVariances, getAlerts } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

// MUI
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TableSortLabel, Paper, Chip, LinearProgress,
  Skeleton, Tooltip, IconButton,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

// ── Helpers ────────────────────────────────────────────────────────────────

function AlertBanner({ type, children }) {
  const styles = {
    warning: {
      bg: "bg-amber-50 border-amber-300 text-amber-900",
      Icon: WarningAmberIcon,
      iconClass: "text-amber-500",
    },
    error: {
      bg: "bg-red-50 border-red-300 text-red-900",
      Icon: ErrorOutlineIcon,
      iconClass: "text-red-500",
    },
    info: {
      bg: "bg-blue-50 border-blue-300 text-blue-900",
      Icon: InfoOutlinedIcon,
      iconClass: "text-blue-500",
    },
    success: {
      bg: "bg-green-50 border-green-300 text-green-900",
      Icon: CheckCircleOutlineIcon,
      iconClass: "text-green-500",
    },
  };
  const s = styles[type] ?? styles.info;
  return (
    <div className={`flex items-start gap-3 border rounded-lg px-4 py-3 text-sm ${s.bg}`}>
      <s.Icon className={`mt-0.5 shrink-0 ${s.iconClass}`} fontSize="small" />
      <span>{children}</span>
    </div>
  );
}

function StatCard({ label, value, sub, color = "gray" }) {
  const colors = {
    gray: "bg-white border-gray-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
    green: "bg-green-50 border-green-200",
    blue: "bg-blue-50 border-blue-200",
  };
  const textColors = {
    gray: "text-gray-900",
    amber: "text-amber-700",
    red: "text-red-700",
    green: "text-green-700",
    blue: "text-blue-700",
  };
  return (
    <div className={`border rounded-xl p-5 flex flex-col gap-1 ${colors[color]}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <span className={`text-3xl font-bold ${textColors[color]}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500 mt-0.5">{sub}</span>}
    </div>
  );
}

function varianceChip(v) {
  if (v === null || v === undefined) return <span className="text-gray-300 text-xs">—</span>;
  if (v < 0) return <Chip label={v} size="small" sx={{ bgcolor: "#fef2f2", color: "#dc2626", fontWeight: 600, fontSize: 12 }} />;
  if (v > 0) return <Chip label={`+${v}`} size="small" sx={{ bgcolor: "#f0fdf4", color: "#16a34a", fontWeight: 600, fontSize: 12 }} />;
  return <Chip label="0" size="small" sx={{ bgcolor: "#f9fafb", color: "#6b7280", fontSize: 12 }} />;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { outletId } = useOutlet();

  const [progress, setProgress] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [varData, setVarData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [varLoading, setVarLoading] = useState(false);

  // Table state
  const [page, setPage] = useState(0);          // MUI TablePagination is 0-indexed
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [orderBy, setOrderBy] = useState("variance_abs");
  const [order, setOrder] = useState("desc");
  const [search, setSearch] = useState("");

  // Load progress + alerts once
  useEffect(() => {
    setLoading(true);
    Promise.all([getCountProgress(outletId), getAlerts(outletId)])
      .then(([p, a]) => {
        setProgress(p.data);
        setAlerts(a.data);
      })
      .finally(() => setLoading(false));
  }, [outletId]);

  // Load variances (server-paginated, but we fetch all and sort client-side for flexibility)
  const fetchVariances = useCallback(() => {
    setVarLoading(true);
    // Fetch up to 500 to allow client-side sort/search
    getVariances(outletId, 1, 500)
      .then((r) => setVarData(r.data))
      .finally(() => setVarLoading(false));
  }, [outletId]);

  useEffect(() => {
    fetchVariances();
    setPage(0);
    setSearch("");
  }, [fetchVariances]);

  // ── Derived variance data ──────────────────────────────────────────────
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

  // Client-side sort
  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if (orderBy === "variance_abs") {
      va = a.variance !== null ? Math.abs(a.variance) : -1;
      vb = b.variance !== null ? Math.abs(b.variance) : -1;
    } else if (orderBy === "variance") {
      va = a.variance ?? -Infinity;
      vb = b.variance ?? -Infinity;
    } else if (orderBy === "pos_qty") {
      va = a.pos_qty;
      vb = b.pos_qty;
    } else if (orderBy === "actual_qty") {
      va = a.actual_qty ?? -Infinity;
      vb = b.actual_qty ?? -Infinity;
    } else {
      va = (a[orderBy] ?? "").toString().toLowerCase();
      vb = (b[orderBy] ?? "").toString().toLowerCase();
    }
    if (va < vb) return order === "asc" ? -1 : 1;
    if (va > vb) return order === "asc" ? 1 : -1;
    return 0;
  });

  const pageRows = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  function handleSort(col) {
    if (orderBy === col) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(col);
      setOrder("desc");
    }
    setPage(0);
  }

  function handleSearchChange(e) {
    setSearch(e.target.value);
    setPage(0);
  }

  // ── Progress ───────────────────────────────────────────────────────────
  const countPct = progress && progress.total_items > 0
    ? Math.round((progress.counted / progress.total_items) * 100)
    : 0;

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">{progress?.today ?? "—"}</p>
          </div>
        </div>

        {/* Alert banners */}
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
                <strong>{alerts.negative_items.length}</strong> item(s) have negative POS quantity today.{" "}
                <Link to="/admin/negative-pos" className="font-semibold underline">View report</Link>
              </AlertBanner>
            )}
            {progress?.has_upload_today && alerts.missing_uploads?.length === 0 && alerts.pending_barcodes === 0 && alerts.negative_items?.length === 0 && (
              <AlertBanner type="success">All systems good — upload complete, no alerts.</AlertBanner>
            )}
          </div>
        )}

        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={96} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Items in System"
              value={progress?.total_items ?? 0}
              sub="from latest POS upload"
            />
            <StatCard
              label="Counted Today"
              value={progress?.counted ?? 0}
              sub={`of ${progress?.total_items ?? 0} items`}
              color={countPct === 100 ? "green" : countPct > 50 ? "blue" : "gray"}
            />
            <StatCard
              label="Pending Barcodes"
              value={progress?.pending_barcodes ?? 0}
              sub="items needing assignment"
              color={progress?.pending_barcodes > 0 ? "amber" : "gray"}
            />
            <StatCard
              label="Negative POS Items"
              value={alerts?.negative_items?.length ?? 0}
              sub="items below zero today"
              color={alerts?.negative_items?.length > 0 ? "red" : "gray"}
            />
          </div>
        )}

        {/* Count progress bar */}
        {!loading && progress && (
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Today's Count Progress</h2>
              <span className="text-sm font-bold text-gray-800">{countPct}%</span>
            </div>
            <LinearProgress
              variant="determinate"
              value={countPct}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: "#e5e7eb",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 5,
                  bgcolor: countPct === 100 ? "#16a34a" : "#4f46e5",
                },
              }}
            />
            <p className="text-xs text-gray-400 mt-2">
              {progress.counted} of {progress.total_items} items counted
            </p>
          </div>
        )}

        {/* Variance Report */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">Variance Report</h2>
              {varData && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Latest snapshot: <strong>{varData.snapshot_date}</strong> ·{" "}
                  {filtered.length} of {allRows.length} items
                  {search && " (filtered)"}
                </p>
              )}
            </div>
            <input
              type="text"
              placeholder="Search item code, name or category…"
              value={search}
              onChange={handleSearchChange}
              className="border rounded-lg px-3 py-2 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {varLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} variant="rectangular" height={36} />)}
            </div>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 0 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ "& th": { bgcolor: "#f9fafb", fontWeight: 600, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" } }}>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "item_code"}
                        direction={orderBy === "item_code" ? order : "asc"}
                        onClick={() => handleSort("item_code")}
                      >
                        Item Code
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "item_name"}
                        direction={orderBy === "item_name" ? order : "asc"}
                        onClick={() => handleSort("item_name")}
                      >
                        Item Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === "pos_qty"}
                        direction={orderBy === "pos_qty" ? order : "asc"}
                        onClick={() => handleSort("pos_qty")}
                      >
                        POS Qty
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === "actual_qty"}
                        direction={orderBy === "actual_qty" ? order : "asc"}
                        onClick={() => handleSort("actual_qty")}
                      >
                        Counted
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === "variance_abs"}
                        direction={orderBy === "variance_abs" ? order : "asc"}
                        onClick={() => handleSort("variance_abs")}
                      >
                        Variance
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Last Counted</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 6, color: "#9ca3af", fontSize: 13 }}>
                        {search ? "No items match your search." : "No variance data yet. Upload today's XLS first."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((row) => (
                      <TableRow
                        key={row.item_id}
                        hover
                        sx={{ "&:last-child td": { borderBottom: 0 } }}
                      >
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
                          {row.item_code}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 500, maxWidth: 200 }}>
                          <span className="text-sm">{row.item_name}</span>
                        </TableCell>
                        <TableCell>
                          {row.category ? (
                            <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{row.category}</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <span className={`text-sm font-medium ${row.pos_qty < 0 ? "text-red-600" : "text-gray-800"}`}>
                            {row.pos_qty}
                          </span>
                        </TableCell>
                        <TableCell align="right">
                          <span className="text-sm text-gray-700">
                            {row.actual_qty !== null ? row.actual_qty : <span className="text-gray-300">—</span>}
                          </span>
                        </TableCell>
                        <TableCell align="right">{varianceChip(row.variance)}</TableCell>
                        <TableCell sx={{ fontSize: 11, color: "#9ca3af" }}>
                          {row.location_tag || "—"}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                          {row.last_counted || "Never"}
                        </TableCell>
                        <TableCell sx={{ pr: 1 }}>
                          <Tooltip title="View item detail">
                            <IconButton
                              component={Link}
                              to={`/items/${row.item_id}`}
                              size="small"
                              sx={{ color: "#6366f1" }}
                            >
                              <OpenInNewIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={filtered.length}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                rowsPerPageOptions={[10, 25, 50, 100]}
                sx={{ borderTop: "1px solid #f3f4f6", fontSize: 12 }}
              />
            </TableContainer>
          )}
        </div>

        {/* Negative stock detail (collapsible list) */}
        {!loading && alerts?.negative_items?.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-red-200 flex items-center justify-between">
              <h2 className="font-semibold text-red-800 flex items-center gap-2">
                <ErrorOutlineIcon fontSize="small" />
                Negative Stock — {alerts.negative_items.length} item(s)
              </h2>
              <Link to="/admin/negative-pos" className="text-xs text-red-700 underline font-medium">
                Full report
              </Link>
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
