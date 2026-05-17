import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, Stack, TextField, MenuItem, Chip,
  Button, Pagination, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, Paper, IconButton, Tooltip, Checkbox, Dialog,
  DialogTitle, DialogContent, DialogActions, CircularProgress,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getUploadedSheets, deleteUploadedSheet, bulkDeleteUploadedSheets } from "../../api/uploads";
import { getOutlets } from "../../api/outlets";
import { useAuth } from "../../contexts/AuthContext";

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

export default function UploadedSheetsPage() {
  const notify = useNotify();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = ["admin", "super_admin"].includes(user?.role);

  const [outlets, setOutlets] = useState([]);
  const [filters, setFilters] = useState({
    pipeline: "", outlet_id: "", approval_status: "", from_date: "", to_date: "",
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, total_pages: 1, results: [] });
  const [loading, setLoading] = useState(false);

  // Selection state
  const [selected, setSelected] = useState(new Set());

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState(null); // single sheet or null
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    getOutlets().then((r) => setOutlets(r.data || [])).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = { page, page_size: 25 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await getUploadedSheets(params);
      setData(r.data);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to load uploaded sheets.");
    } finally { setLoading(false); }
  }, [page, filters, notify]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => { setPage(1); setFilters((p) => ({ ...p, [k]: v })); };

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
      setSelected((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
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
      load();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Delete failed.");
    } finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    const ids = Array.from(selected);
    try {
      const res = await bulkDeleteUploadedSheets(ids);
      const { deleted, errors } = res.data;
      if (deleted > 0) notify.success(`Deleted ${deleted} sheet(s).`);
      if (errors?.length) notify.error(`${errors.length} sheet(s) could not be deleted.`);
      setBulkDeleteOpen(false);
      setSelected(new Set());
      load();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Bulk delete failed.");
    } finally { setDeleting(false); }
  };

  const handleReUpload = (sheet) => {
    navigate("/upload/hub", {
      state: {
        pipeline: sheet.pipeline,
        outletId: sheet.outlet_id,
        dateFrom: sheet.business_date,
        dateTo: sheet.business_date_to || sheet.business_date,
      },
    });
  };

  const selectedCount = selected.size;

  return (
    <Layout>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <PageHeader title="Uploaded XLS Sheets" subtitle="All file uploads across every pipeline" />
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
            onClick={() => navigate("/upload/hub")}
            sx={{
              textTransform: "none", fontWeight: 600,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
              "&:hover": { background: "linear-gradient(135deg, #4f46e5, #7c3aed)" },
            }}
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
            {isAdmin && (
              <TextField select size="small" label="Outlet" value={filters.outlet_id}
                onChange={(e) => setFilter("outlet_id", e.target.value)} sx={{ minWidth: 190 }}>
                <MenuItem value="">All outlets</MenuItem>
                {outlets.map((o) => <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>)}
              </TextField>
            )}
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
            <Tooltip title="Refresh">
              <IconButton onClick={load} disabled={loading} size="small"><RefreshIcon /></IconButton>
            </Tooltip>
          </Stack>
        </CardContent>
      </Card>

      {/* Table */}
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
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
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Pipeline</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Outlet</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Business Date</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Uploaded By</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Uploaded At</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>File</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Rows</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.results.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6, color: "rgba(15,23,42,0.4)" }}>
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
                        <Typography sx={{ fontSize: "0.82rem", fontWeight: 500 }}>
                          {s.pipeline_label}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.82rem" }}>{s.outlet_name}</TableCell>
                    <TableCell sx={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                      {s.business_date}
                      {s.business_date_to && s.business_date_to !== s.business_date ? ` – ${s.business_date_to}` : ""}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.82rem" }}>{s.uploaded_by || "—"}</TableCell>
                    <TableCell sx={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                      {new Date(s.uploaded_at).toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", color: "rgba(15,23,42,0.5)" }}>
                      {s.filename}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {s.row_count?.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={chip.label} color={chip.color} variant={s.approval_reason ? "outlined" : "filled"} />
                      {s.approval_reason && (
                        <Typography variant="caption" sx={{ ml: 0.5, color: "text.secondary" }}>{s.approval_reason}</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.25} justifyContent="center">
                        <Tooltip title="View rows">
                          <IconButton size="small" onClick={() => navigate(`/uploaded-sheets/${s.id}`)} sx={{ color: "#6366f1" }}>
                            <VisibilityIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Re-upload (pre-fills date & pipeline)">
                          <IconButton size="small" onClick={() => handleReUpload(s)} sx={{ color: "#6366f1" }}>
                            <UploadFileIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete sheet">
                          <IconButton size="small" onClick={() => setDeleteTarget(s)} sx={{ color: "#ef4444" }}>
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
          <Typography sx={{ fontSize: "0.9rem", color: "rgba(15,23,42,0.7)" }}>
            This will permanently delete{" "}
            <strong>{deleteTarget?.row_count?.toLocaleString()} row(s)</strong> from the database.
            <br />
            <Typography component="span" sx={{ fontSize: "0.82rem", color: "rgba(15,23,42,0.5)" }}>
              {deleteTarget?.pipeline_label} · {deleteTarget?.business_date}
            </Typography>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button
            onClick={handleDelete} color="error" variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
            sx={{ textTransform: "none" }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk delete confirm */}
      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {selectedCount} Sheet(s)?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.9rem", color: "rgba(15,23,42,0.7)" }}>
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
          >
            Delete All
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
