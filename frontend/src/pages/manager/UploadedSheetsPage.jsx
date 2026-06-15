import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, Stack, TextField, MenuItem, Chip,
  Button, Pagination, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, Paper, IconButton, Tooltip, Checkbox, Dialog,
  DialogTitle, DialogContent, DialogActions, CircularProgress, Divider,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PersonIcon from "@mui/icons-material/Person";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import {
  getUploadedSheets, deleteUploadedSheet, bulkDeleteUploadedSheets,
  getUploadedSheetsCoverage,
} from "../../api/uploads";
import { useAuth } from "../../contexts/AuthContext";
import { useOutlet } from "../../contexts/OutletContext";

const PIPELINES = [
  { value: "", label: "All pipelines" },
  { value: "pos", label: "POS Snapshot" },
  { value: "damage", label: "Damage / Wastage" },
  { value: "office", label: "Office Use" },
  { value: "verification", label: "Verification" },
  { value: "grn", label: "GRN" },
  { value: "rts", label: "Return to Supplier" },
  { value: "sales", label: "Sales" },
  { value: "sales_returns", label: "Sales Returns" },
];

const STATUS_CHIPS = {
  auto:     { label: "Auto",     color: "success" },
  approved: { label: "Approved", color: "success" },
  pending:  { label: "Pending",  color: "warning" },
  rejected: { label: "Rejected", color: "error" },
};

const PIPELINE_COLORS = {
  pos:           "#6366f1",
  damage:        "#ef4444",
  office:        "#64748b",
  verification:  "#06b6d4",
  grn:           "#22c55e",
  rts:           "#f59e0b",
  sales:         "#3b82f6",
  sales_returns: "#a855f7",
};

// First-of-month → today as ISO YYYY-MM-DD strings. Drives the default range.
function currentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(now) };
}

export default function UploadedSheetsPage() {
  const notify = useNotify();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { outletId: globalOutletId } = useOutlet();
  const isAdmin = ["admin", "super_admin"].includes(user?.role);

  const initialRange = useMemo(() => currentMonthRange(), []);
  const [filters, setFilters] = useState({
    pipeline: searchParams.get("pipeline") || "",
    approval_status: "",
    from_date: initialRange.from,
    to_date: initialRange.to,
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, total_pages: 1, results: [] });
  const [loading, setLoading] = useState(false);

  // Coverage aggregates (by_uploader + missing dates)
  const [coverage, setCoverage] = useState({ by_uploader: [], missing: [] });
  const [coverageLoading, setCoverageLoading] = useState(false);

  // Selection / delete state
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Common params: respect global outlet (TopBar picker), no page-level outlet filter.
  const commonParams = useMemo(() => {
    const p = {};
    if (filters.pipeline) p.pipeline = filters.pipeline;
    if (filters.approval_status) p.approval_status = filters.approval_status;
    if (filters.from_date) p.from_date = filters.from_date;
    if (filters.to_date) p.to_date = filters.to_date;
    if (isAdmin && globalOutletId) p.outlet_id = globalOutletId;
    return p;
  }, [filters, isAdmin, globalOutletId]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const r = await getUploadedSheets({ ...commonParams, page, page_size: 25 });
      setData(r.data);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to load uploaded sheets.");
    } finally { setLoading(false); }
  }, [commonParams, page, notify]);

  const loadCoverage = useCallback(async () => {
    setCoverageLoading(true);
    try {
      const r = await getUploadedSheetsCoverage(commonParams);
      setCoverage(r.data || { by_uploader: [], missing: [] });
    } catch {
      setCoverage({ by_uploader: [], missing: [] });
    } finally { setCoverageLoading(false); }
  }, [commonParams]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadCoverage(); }, [loadCoverage]);

  const setFilter = (k, v) => {
    setPage(1);
    setFilters((p) => ({ ...p, [k]: v }));
    if (k === "pipeline") {
      const next = new URLSearchParams(searchParams);
      if (v) next.set("pipeline", v);
      else next.delete("pipeline");
      setSearchParams(next, { replace: true });
    }
  };

  const resetRange = () => {
    const r = currentMonthRange();
    setPage(1);
    setFilters((p) => ({ ...p, from_date: r.from, to_date: r.to }));
  };

  const refreshAll = () => { loadList(); loadCoverage(); };

  // ---- Uploader × Pipeline matrix ----
  const uploaderMatrix = useMemo(() => {
    const rows = new Map(); // uploader -> { pipeline -> count, total }
    const pipelineSet = new Set();
    for (const r of coverage.by_uploader) {
      if (!rows.has(r.uploader)) rows.set(r.uploader, { _total: 0, _byPipeline: {} });
      const row = rows.get(r.uploader);
      row._byPipeline[r.pipeline] = (row._byPipeline[r.pipeline] || 0) + r.count;
      row._total += r.count;
      pipelineSet.add(r.pipeline);
    }
    const pipelines = Array.from(pipelineSet)
      .map((p) => ({ value: p, label: PIPELINES.find((x) => x.value === p)?.label || p }));
    const out = Array.from(rows.entries())
      .map(([uploader, v]) => ({ uploader, byPipeline: v._byPipeline, total: v._total }))
      .sort((a, b) => b.total - a.total);
    return { pipelines, rows: out };
  }, [coverage.by_uploader]);

  // ---- Selection / delete handlers ----
  const allIds = data.results.map((s) => s.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someChecked = allIds.some((id) => selected.has(id));

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setSelected((prev) => { const n = new Set(prev); allIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((prev) => new Set([...prev, ...allIds]));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUploadedSheet(deleteTarget.id);
      notify.success(`Sheet deleted (${deleteTarget.row_count?.toLocaleString()} rows removed).`);
      setDeleteTarget(null);
      refreshAll();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Delete failed.");
    } finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const res = await bulkDeleteUploadedSheets(Array.from(selected));
      const { deleted, errors } = res.data;
      if (deleted > 0) notify.success(`Deleted ${deleted} sheet(s).`);
      if (errors?.length) notify.error(`${errors.length} sheet(s) could not be deleted.`);
      setBulkDeleteOpen(false);
      setSelected(new Set());
      refreshAll();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Bulk delete failed.");
    } finally { setDeleting(false); }
  };

  const handleReUpload = (sheet) => {
    navigate("/transactions", {
      state: {
        pipeline: sheet.pipeline,
        outletId: sheet.outlet_id,
        dateFrom: sheet.business_date,
        dateTo: sheet.business_date_to || sheet.business_date,
      },
    });
  };

  const selectedCount = selected.size;
  const showOutletColumn = !globalOutletId || !isAdmin === false; // show when not pinned to one outlet — i.e. "All outlets"
  const outletColumnVisible = !globalOutletId;

  return (
    <Layout>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <PageHeader title="Uploaded Sheets" />
        <Stack direction="row" spacing={1}>
          {selectedCount > 0 && (
            <Button
              variant="outlined" color="error"
              startIcon={<DeleteSweepIcon />}
              onClick={() => setBulkDeleteOpen(true)}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Delete {selectedCount} Selected
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => navigate("/transactions")}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            New Upload
          </Button>
        </Stack>
      </Box>

      {/* Filters */}
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
        <CardContent sx={{ pb: "12px !important" }}>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
            <TextField select size="small" label="Pipeline" value={filters.pipeline}
              onChange={(e) => setFilter("pipeline", e.target.value)} sx={{ minWidth: 170 }}>
              {PIPELINES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Status" value={filters.approval_status}
              onChange={(e) => setFilter("approval_status", e.target.value)} sx={{ minWidth: 130 }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="auto">Auto</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </TextField>
            <TextField type="date" size="small" label="From" InputLabelProps={{ shrink: true }}
              value={filters.from_date} onChange={(e) => setFilter("from_date", e.target.value)} />
            <TextField type="date" size="small" label="To" InputLabelProps={{ shrink: true }}
              value={filters.to_date} onChange={(e) => setFilter("to_date", e.target.value)} />
            <Button size="small" onClick={resetRange} sx={{ textTransform: "none" }}>
              This month
            </Button>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Refresh">
              <IconButton onClick={refreshAll} disabled={loading || coverageLoading} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
            Outlet scope is set from the top header (currently {globalOutletId ? "one outlet" : "All outlets"}).
          </Typography>
        </CardContent>
      </Card>

      {/* Two summary panels: who uploaded what + missing dates */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, mb: 2 }}>
        {/* Who uploaded what */}
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <PersonIcon fontSize="small" sx={{ color: "primary.main" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Who uploaded what</Typography>
              {coverageLoading && <CircularProgress size={14} />}
            </Stack>
            {uploaderMatrix.rows.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                No uploads in this period.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>User</TableCell>
                      {uploaderMatrix.pipelines.map((p) => (
                        <TableCell key={p.value} align="right" sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>
                          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: PIPELINE_COLORS[p.value] || "#64748b" }} />
                            <span>{p.label}</span>
                          </Stack>
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {uploaderMatrix.rows.map((r) => (
                      <TableRow key={r.uploader} hover>
                        <TableCell sx={{ fontSize: "0.82rem", fontWeight: 600 }}>{r.uploader}</TableCell>
                        {uploaderMatrix.pipelines.map((p) => (
                          <TableCell key={p.value} align="right" sx={{ fontSize: "0.82rem", color: r.byPipeline[p.value] ? "text.primary" : "text.disabled" }}>
                            {r.byPipeline[p.value] || "—"}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ fontSize: "0.82rem", fontWeight: 700 }}>{r.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>

        {/* Missing dates */}
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <WarningAmberIcon fontSize="small" sx={{ color: "warning.main" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Missing dates</Typography>
              {coverageLoading && <CircularProgress size={14} />}
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Daily pipelines · POS · GRN · Sales
              </Typography>
            </Stack>
            {coverage.missing.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                No coverage gaps in this period.
              </Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Outlet</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Pipeline</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Missing</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Dates</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {coverage.missing.map((m, i) => (
                      <TableRow key={`${m.outlet_id}-${m.pipeline}-${i}`} hover>
                        <TableCell sx={{ fontSize: "0.82rem", fontWeight: 600 }}>{m.outlet_name}</TableCell>
                        <TableCell sx={{ fontSize: "0.82rem" }}>
                          <Stack direction="row" alignItems="center" spacing={0.75}>
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: PIPELINE_COLORS[m.pipeline] || "#64748b" }} />
                            <span>{m.pipeline_label}</span>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: "0.82rem", fontWeight: 700, color: "error.main" }}>
                          {m.missing_count} / {m.total_days}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                          <Tooltip title={m.missing_dates.join(", ")}>
                            <Typography variant="caption" sx={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>
                              {m.missing_dates.slice(0, 4).join(", ")}{m.missing_dates.length > 4 ? `, +${m.missing_dates.length - 4} more` : ""}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Sheets table */}
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>All uploads</Typography>
          <Chip size="small" label={data.count?.toLocaleString() || 0} sx={{ height: 20 }} />
        </Box>
        <TableContainer component={Paper} variant="outlined" sx={{ border: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "#f8fafc" }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allChecked}
                    indeterminate={!allChecked && someChecked}
                    onChange={toggleAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Pipeline</TableCell>
                {outletColumnVisible && <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Outlet</TableCell>}
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Business Date</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Uploaded</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>File</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Rows</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.results.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={outletColumnVisible ? 9 : 8} align="center" sx={{ py: 6, color: "rgba(15,23,42,0.4)" }}>
                    No uploaded sheets found.
                  </TableCell>
                </TableRow>
              )}
              {data.results.map((s) => {
                const chip = STATUS_CHIPS[s.approval_status] || { label: s.approval_status, color: "default" };
                const pipelineColor = PIPELINE_COLORS[s.pipeline] || "#64748b";
                return (
                  <TableRow key={s.id} hover sx={{ "&:last-child td": { border: 0 } }} selected={selected.has(s.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={selected.has(s.id)} onChange={() => toggleRow(s.id)} />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: pipelineColor, flexShrink: 0 }} />
                        <Typography sx={{ fontSize: "0.82rem", fontWeight: 500 }}>{s.pipeline_label}</Typography>
                      </Stack>
                    </TableCell>
                    {outletColumnVisible && <TableCell sx={{ fontSize: "0.82rem" }}>{s.outlet_name}</TableCell>}
                    <TableCell sx={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                      {s.business_date}
                      {s.business_date_to && s.business_date_to !== s.business_date ? ` – ${s.business_date_to}` : ""}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.82rem" }}>
                      <Tooltip title={new Date(s.uploaded_at).toLocaleString()}>
                        <Box>
                          <Typography sx={{ fontSize: "0.82rem", fontWeight: 500 }}>{s.uploaded_by || "—"}</Typography>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            {new Date(s.uploaded_at).toLocaleDateString()}
                          </Typography>
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: "text.secondary" }}>
                      <Tooltip title={s.filename || ""}>
                        <Box component="span" sx={{ display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle" }}>
                          {s.filename}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {s.row_count?.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={s.approval_reason || ""} placement="top">
                        <Chip size="small" label={chip.label} color={chip.color} variant={s.approval_reason ? "outlined" : "filled"} />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.25} justifyContent="center">
                        <Tooltip title="View rows">
                          <IconButton size="small" onClick={() => navigate(`/uploaded-sheets/${s.id}`)} sx={{ color: "primary.main" }}>
                            <VisibilityIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Re-upload (pre-fills date & pipeline)">
                          <IconButton size="small" onClick={() => handleReUpload(s)} sx={{ color: "primary.main" }}>
                            <UploadFileIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete sheet">
                          <IconButton size="small" onClick={() => setDeleteTarget(s)} sx={{ color: "error.main" }}>
                            <DeleteIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Stack alignItems="center" sx={{ py: 2, borderTop: "1px solid rgba(15,23,42,0.06)" }}>
          <Pagination count={data.total_pages} page={page} onChange={(_, p) => setPage(p)} size="small" />
        </Stack>
      </Card>

      {/* Single delete confirm */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Upload?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.9rem", color: "text.secondary" }}>
            This will permanently delete{" "}
            <strong>{deleteTarget?.row_count?.toLocaleString()} row(s)</strong> from the database.
          </Typography>
          <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
            {deleteTarget?.pipeline_label} · {deleteTarget?.business_date}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button
            onClick={handleDelete} color="error" variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
            sx={{ textTransform: "none" }}
          >Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk delete confirm */}
      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {selectedCount} Sheet(s)?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.9rem", color: "text.secondary" }}>
            This will permanently delete all rows from the selected uploads. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button
            onClick={handleBulkDelete} color="error" variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteSweepIcon />}
            sx={{ textTransform: "none" }}
          >Delete All</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
