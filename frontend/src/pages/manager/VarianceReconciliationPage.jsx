import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Typography, Chip, Alert, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Tooltip,
} from "@mui/material";
import BalanceIcon from "@mui/icons-material/Balance";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import GavelIcon from "@mui/icons-material/Gavel";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import {
  listVarianceRecords, resolveVarianceRecord, bulkResolveVariance,
  listCountSessions, closeCountSession,
} from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";
import { useNotification } from "../../providers/NotificationProvider";

const STATUS_COLORS = {
  pending: "warning",
  investigating: "info",
  explained: "primary",
  adjusted: "success",
  written_off: "default",
  closed: "success",
};

const STATUS_OPTIONS = [
  { value: "investigating", label: "Investigating" },
  { value: "explained", label: "Explained" },
  { value: "adjusted", label: "Adjusted" },
  { value: "written_off", label: "Written off" },
  { value: "closed", label: "Closed" },
];

export default function VarianceReconciliationPage() {
  const { outletId } = useOutlet();
  const { notify } = useNotification();
  const today = new Date().toISOString().slice(0, 10);

  const [sessions, setSessions] = useState([]);
  const [sessionFilter, setSessionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState([]);

  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveForm, setResolveForm] = useState({ status: "explained", note: "", adjustment_qty: "" });

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ status: "explained", note: "" });

  const PAGE_SIZE = 50;

  const loadSessions = useCallback(async () => {
    try {
      const res = await listCountSessions(outletId ? { outlet: outletId } : {});
      setSessions(res.data.results || []);
    } catch { /* ignore */ }
  }, [outletId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page, page_size: PAGE_SIZE,
        ...(outletId ? { outlet: outletId } : {}),
        ...(sessionFilter ? { session: sessionFilter } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
      };
      const res = await listVarianceRecords(params);
      setData(res.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load variances.", "error");
    } finally {
      setLoading(false);
    }
  }, [outletId, sessionFilter, dateFrom, dateTo, statusFilter, search, page, notify]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setSelection([]); }, [outletId, sessionFilter, dateFrom, dateTo, statusFilter, search]);

  const openResolve = (row) => {
    setResolveTarget(row);
    setResolveForm({
      status: row.status === "pending" ? "explained" : row.status,
      note: row.resolution_note || "",
      adjustment_qty: row.adjustment_qty || "",
    });
  };

  const handleResolve = async () => {
    if (!resolveTarget) return;
    try {
      await resolveVarianceRecord(resolveTarget.id, resolveForm);
      notify("Variance resolved.", "success");
      setResolveTarget(null);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Resolve failed.", "error");
    }
  };

  const handleBulkResolve = async () => {
    try {
      const res = await bulkResolveVariance(selection, bulkForm);
      notify(`Resolved ${res.data.count} record(s).`, "success");
      setBulkOpen(false);
      setSelection([]);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Bulk resolve failed.", "error");
    }
  };

  const handleCloseSession = async () => {
    if (!sessionFilter) return;
    try {
      const res = await closeCountSession(sessionFilter);
      notify(`Session closed. ${res.data.variance_created_now || 0} new variance record(s).`, "success");
      loadSessions();
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Close session failed.", "error");
    }
  };

  const fmt = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(3).replace(/\.?0+$/, ""));

  const columns = [
    { field: "count_date", headerName: "Date", flex: 0.7, minWidth: 110 },
    { field: "item_code", headerName: "Item Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Item Name", flex: 1.4, minWidth: 200 },
    { field: "pos_qty", headerName: "POS Qty", type: "number", flex: 0.6, minWidth: 90, valueGetter: (v) => Number(v) },
    { field: "counted_qty", headerName: "Counted", type: "number", flex: 0.6, minWidth: 90, valueGetter: (v) => Number(v) },
    {
      field: "variance_qty", headerName: "Variance", type: "number", flex: 0.6, minWidth: 90,
      renderCell: (p) => (
        <span style={{ color: Number(p.value) < 0 ? "#d32f2f" : "#2e7d32", fontWeight: 600 }}>
          {Number(p.value) > 0 ? "+" : ""}{fmt(p.value)}
        </span>
      ),
    },
    {
      field: "variance_value", headerName: "Value", type: "number", flex: 0.7, minWidth: 100,
      valueGetter: (v) => v === null || v === undefined ? null : Number(v),
      renderCell: (p) => p.value === null ? "—" : p.value.toFixed(2),
    },
    {
      field: "status", headerName: "Status", flex: 0.8, minWidth: 120,
      renderCell: (p) => <Chip size="small" label={p.value} color={STATUS_COLORS[p.value] || "default"} />,
    },
    { field: "resolution_note", headerName: "Note", flex: 1, minWidth: 160, valueGetter: (v) => v || "" },
    { field: "resolved_by_username", headerName: "By", flex: 0.7, minWidth: 100, valueGetter: (v) => v || "—" },
    {
      field: "_actions", headerName: "", flex: 0.5, minWidth: 100, sortable: false,
      renderCell: (p) => (
        <Tooltip title="Resolve">
          <Button size="small" variant="outlined" onClick={() => openResolve(p.row)} sx={{ minWidth: 0, px: 1 }}>
            <GavelIcon fontSize="small" />
          </Button>
        </Tooltip>
      ),
    },
  ];

  const selectedSession = sessions.find((s) => String(s.id) === String(sessionFilter));

  return (
    <Layout>
      <PageHeader title="Variance Reconciliation" subtitle="Resolve count-vs-POS discrepancies" icon={<BalanceIcon />} />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField size="small" select label="Session" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">All sessions</MenuItem>
          {sessions.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.count_date} — {s.outlet_name} [{s.status}] ({s.variance_pending || 0} pending)
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <TextField size="small" select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="investigating">Investigating</MenuItem>
          <MenuItem value="explained">Explained</MenuItem>
          <MenuItem value="adjusted">Adjusted</MenuItem>
          <MenuItem value="written_off">Written off</MenuItem>
          <MenuItem value="closed">Closed</MenuItem>
        </TextField>
        <TextField size="small" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ flex: 1, minWidth: 200 }} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="primary" disabled={!selection.length} onClick={() => setBulkOpen(true)}>
          Bulk resolve {selection.length > 0 ? `(${selection.length})` : ""}
        </Button>
        {selectedSession && selectedSession.status === "open" && (
          <Button variant="outlined" color="warning" onClick={handleCloseSession}>
            Close session &amp; generate variances
          </Button>
        )}
      </Stack>

      {data && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          {data.count} variance record{data.count !== 1 ? "s" : ""}
        </Typography>
      )}

      <DataTable
        rows={data?.results ?? []}
        columns={columns}
        loading={loading}
        checkboxSelection
        onRowSelectionModelChange={(m) => setSelection(m)}
        rowSelectionModel={selection}
        paginationMode="server"
        rowCount={data?.count ?? 0}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]}
        emptyText="No variance records match this filter"
        height={620}
      />

      {/* Resolve dialog */}
      <Dialog open={!!resolveTarget} onClose={() => setResolveTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Resolve variance</DialogTitle>
        <DialogContent>
          {resolveTarget && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info">
                <b>{resolveTarget.item_code}</b> — {resolveTarget.item_name}<br />
                POS: {fmt(resolveTarget.pos_qty)} · Counted: {fmt(resolveTarget.counted_qty)} · Variance: <b>{fmt(resolveTarget.variance_qty)}</b>
              </Alert>
              <TextField select label="Status" value={resolveForm.status} onChange={(e) => setResolveForm({ ...resolveForm, status: e.target.value })}>
                {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
              <TextField label="Note" multiline minRows={3} value={resolveForm.note} onChange={(e) => setResolveForm({ ...resolveForm, note: e.target.value })} />
              {resolveForm.status === "adjusted" && (
                <TextField
                  label="Adjustment qty" type="number" value={resolveForm.adjustment_qty}
                  onChange={(e) => setResolveForm({ ...resolveForm, adjustment_qty: e.target.value })}
                  helperText="Quantity adjusted against the variance (informational for now)."
                />
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleResolve}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk resolve */}
      <Dialog open={bulkOpen} onClose={() => setBulkOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Bulk resolve {selection.length} record(s)</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Status" value={bulkForm.status} onChange={(e) => setBulkForm({ ...bulkForm, status: e.target.value })}>
              {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField label="Note (applied to all)" multiline minRows={3} value={bulkForm.note} onChange={(e) => setBulkForm({ ...bulkForm, note: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleBulkResolve}>Apply</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
