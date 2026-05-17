import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Stack, Box, Button, Typography, Chip, Tabs, Tab, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, CircularProgress, Alert,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import GavelIcon from "@mui/icons-material/Gavel";
import LockIcon from "@mui/icons-material/Lock";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Layout from "../../components/Layout";
import { DataTable } from "../../components/ui";
import {
  getCountSession, getDailyCounts, approveCount, rejectCount, bulkApproveCounts,
  closeCountSession, listVarianceRecords, resolveVarianceRecord, bulkResolveVariance,
} from "../../api/dashboard";
import { useNotification } from "../../providers/NotificationProvider";

const COUNT_STATUS_COLORS = { draft: "default", submitted: "warning", approved: "success", rejected: "error" };
const VAR_STATUS_COLORS = { pending: "warning", investigating: "info", explained: "primary", adjusted: "success", written_off: "default", closed: "success" };
const VAR_STATUS_OPTIONS = [
  { value: "investigating", label: "Investigating" },
  { value: "explained", label: "Explained" },
  { value: "adjusted", label: "Adjusted" },
  { value: "written_off", label: "Written off" },
  { value: "closed", label: "Closed" },
];
const COUNT_PAGE_SIZE = 25;
const VAR_PAGE_SIZE = 50;

const splitLocVariant = (tag) => {
  if (!tag) return { loc: "", variant: "" };
  const idx = tag.indexOf("|");
  if (idx === -1) return { loc: tag, variant: "" };
  return { loc: tag.slice(0, idx), variant: tag.slice(idx + 1) };
};

const fmt = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(3).replace(/\.?0+$/, ""));

export default function CountSessionDetailPage() {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [tab, setTab] = useState(0);

  // Tab 1 — counts
  const [countSearch, setCountSearch] = useState("");
  const [countStatus, setCountStatus] = useState("submitted");
  const [countPage, setCountPage] = useState(1);
  const [countData, setCountData] = useState(null);
  const [countLoading, setCountLoading] = useState(false);
  const [countSelection, setCountSelection] = useState({ type: "include", ids: new Set() });
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  // Tab 2 — variances
  const [varSearch, setVarSearch] = useState("");
  const [varStatus, setVarStatus] = useState("pending");
  const [varPage, setVarPage] = useState(1);
  const [varData, setVarData] = useState(null);
  const [varLoading, setVarLoading] = useState(false);
  const [varSelection, setVarSelection] = useState({ type: "include", ids: new Set() });
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveForm, setResolveForm] = useState({ status: "explained", note: "", adjustment_qty: "" });
  const [bulkVarOpen, setBulkVarOpen] = useState(false);
  const [bulkVarForm, setBulkVarForm] = useState({ status: "explained", note: "" });

  // Close session confirm
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);

  // Load session metadata
  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await getCountSession(sessionId);
      setSession(res.data);
    } catch {
      setSessionError("Session not found or access denied.");
    } finally {
      setSessionLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // Load counts (Tab 1)
  const loadCounts = useCallback(async () => {
    setCountLoading(true);
    try {
      const res = await getDailyCounts({
        sessionId,
        search: countSearch || undefined,
        approvalStatus: countStatus || undefined,
        page: countPage,
        pageSize: COUNT_PAGE_SIZE,
      });
      setCountData(res.data);
    } catch {
      notify("Failed to load counts.", "error");
    } finally {
      setCountLoading(false);
    }
  }, [sessionId, countSearch, countStatus, countPage, notify]);

  useEffect(() => { if (tab === 0) loadCounts(); }, [tab, loadCounts]);
  useEffect(() => { setCountPage(1); setCountSelection({ type: "include", ids: new Set() }); }, [countSearch, countStatus]);

  // Load variances (Tab 2)
  const loadVarRecords = useCallback(async () => {
    setVarLoading(true);
    try {
      const res = await listVarianceRecords({
        session: sessionId,
        search: varSearch || undefined,
        ...(varStatus ? { status: varStatus } : {}),
        page: varPage,
        page_size: VAR_PAGE_SIZE,
      });
      setVarData(res.data);
    } catch {
      notify("Failed to load variances.", "error");
    } finally {
      setVarLoading(false);
    }
  }, [sessionId, varSearch, varStatus, varPage, notify]);

  useEffect(() => { if (tab === 1) loadVarRecords(); }, [tab, loadVarRecords]);
  useEffect(() => { setVarPage(1); setVarSelection({ type: "include", ids: new Set() }); }, [varSearch, varStatus]);

  // Count actions
  const handleApproveCount = async (countId) => {
    try {
      await approveCount(countId);
      notify("Count approved.", "success");
      loadCounts();
      loadSession();
    } catch (err) {
      notify(err?.response?.data?.detail || "Approval failed.", "error");
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(countSelection.ids);
    if (!ids.length) return;
    try {
      const res = await bulkApproveCounts(ids);
      notify(`Approved ${res.data.count} count(s).`, "success");
      setCountSelection({ type: "include", ids: new Set() });
      loadCounts();
      loadSession();
    } catch (err) {
      notify(err?.response?.data?.detail || "Bulk approve failed.", "error");
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    try {
      await rejectCount(rejectTarget.id, rejectReason.trim());
      notify("Count rejected.", "success");
      setRejectTarget(null);
      setRejectReason("");
      loadCounts();
      loadSession();
    } catch (err) {
      notify(err?.response?.data?.detail || "Rejection failed.", "error");
    }
  };

  // Close session
  const handleCloseSession = async () => {
    setCloseLoading(true);
    try {
      const res = await closeCountSession(sessionId);
      notify(`Session closed. ${res.data.variance_created_now || 0} new variance record(s).`, "success");
      setCloseConfirmOpen(false);
      loadSession();
      setTab(1);
    } catch (err) {
      notify(err?.response?.data?.detail || "Close session failed.", "error");
    } finally {
      setCloseLoading(false);
    }
  };

  // Variance actions
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
      loadVarRecords();
      loadSession();
    } catch (err) {
      notify(err?.response?.data?.detail || "Resolve failed.", "error");
    }
  };

  const handleBulkResolve = async () => {
    const ids = Array.from(varSelection.ids);
    try {
      const res = await bulkResolveVariance(ids, bulkVarForm);
      notify(`Resolved ${res.data.count} record(s).`, "success");
      setBulkVarOpen(false);
      setVarSelection({ type: "include", ids: new Set() });
      loadVarRecords();
      loadSession();
    } catch (err) {
      notify(err?.response?.data?.detail || "Bulk resolve failed.", "error");
    }
  };

  // --- Count columns ---
  const countColumns = [
    { field: "item_code", headerName: "Item Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Item Name", flex: 1.5, minWidth: 200 },
    {
      field: "location_tag", headerName: "Location", flex: 0.6, minWidth: 100,
      valueGetter: (v, row) => splitLocVariant(row.location_tag).loc,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value} variant="outlined" /> : "—",
    },
    {
      field: "actual_qty", headerName: "Counted", type: "number", flex: 0.55, minWidth: 90,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <span>{p.value}</span>
          {p.row.flagged_outlier && (
            <Tooltip title="Outlier — review carefully">
              <WarningAmberIcon fontSize="small" color="warning" />
            </Tooltip>
          )}
        </Stack>
      ),
    },
    {
      field: "pos_qty_at_count", headerName: "POS Qty", type: "number", flex: 0.55, minWidth: 90,
      renderCell: (p) => p.value == null ? <span style={{ color: "#999" }}>—</span> : Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    },
    {
      field: "variance_qty", headerName: "Variance", type: "number", flex: 0.5, minWidth: 85,
      renderCell: (p) => {
        if (p.value == null) return <span style={{ color: "#999" }}>—</span>;
        const v = Number(p.value);
        const sign = v > 0 ? "+" : "";
        return <Chip size="small" label={`${sign}${v.toLocaleString(undefined, { maximumFractionDigits: 3 })}`} color={v === 0 ? "default" : v > 0 ? "success" : "error"} variant="outlined" />;
      },
    },
    {
      field: "approval_status", headerName: "Status", flex: 0.6, minWidth: 100,
      renderCell: (p) => <Chip size="small" label={p.value} color={COUNT_STATUS_COLORS[p.value] || "default"} />,
    },
    { field: "counted_by_username", headerName: "Counter", flex: 0.7, minWidth: 100, renderCell: (p) => p.value || "—" },
    {
      field: "_actions", headerName: "", flex: 0.8, minWidth: 130, sortable: false,
      renderCell: (p) => (
        p.row.approval_status === "submitted" ? (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Approve">
              <Button size="small" color="success" variant="outlined" onClick={() => handleApproveCount(p.row.id)} sx={{ minWidth: 0, px: 1 }}>
                <CheckIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Reject">
              <Button size="small" color="error" variant="outlined" onClick={() => { setRejectTarget(p.row); setRejectReason(""); }} sx={{ minWidth: 0, px: 1 }}>
                <CloseIcon fontSize="small" />
              </Button>
            </Tooltip>
          </Stack>
        ) : null
      ),
    },
  ];

  // --- Variance columns ---
  const varColumns = [
    { field: "item_code", headerName: "Item Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Item Name", flex: 1.4, minWidth: 200 },
    { field: "pos_qty", headerName: "POS Qty", type: "number", flex: 0.55, minWidth: 85, valueGetter: (v) => Number(v) },
    { field: "counted_qty", headerName: "Counted", type: "number", flex: 0.55, minWidth: 85, valueGetter: (v) => Number(v) },
    {
      field: "variance_qty", headerName: "Variance", type: "number", flex: 0.55, minWidth: 90,
      renderCell: (p) => (
        <span style={{ color: Number(p.value) < 0 ? "#d32f2f" : "#2e7d32", fontWeight: 600 }}>
          {Number(p.value) > 0 ? "+" : ""}{fmt(p.value)}
        </span>
      ),
    },
    {
      field: "variance_value", headerName: "Value", type: "number", flex: 0.65, minWidth: 95,
      valueGetter: (v) => v === null || v === undefined ? null : Number(v),
      renderCell: (p) => p.value === null ? "—" : p.value.toFixed(2),
    },
    {
      field: "status", headerName: "Status", flex: 0.75, minWidth: 115,
      renderCell: (p) => <Chip size="small" label={p.value} color={VAR_STATUS_COLORS[p.value] || "default"} />,
    },
    { field: "resolution_note", headerName: "Note", flex: 1, minWidth: 140, valueGetter: (v) => v || "" },
    {
      field: "_actions", headerName: "", flex: 0.4, minWidth: 80, sortable: false,
      renderCell: (p) => (
        <Tooltip title="Resolve">
          <Button size="small" variant="outlined" onClick={() => openResolve(p.row)} sx={{ minWidth: 0, px: 1 }}>
            <GavelIcon fontSize="small" />
          </Button>
        </Tooltip>
      ),
    },
  ];

  const countSelectionIds = Array.from(countSelection.ids);
  const varSelectionIds = Array.from(varSelection.ids);

  if (sessionLoading) {
    return (
      <Layout>
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "#6366f1" }} />
        </Box>
      </Layout>
    );
  }

  if (sessionError) {
    return (
      <Layout>
        <Alert severity="error">{sessionError}</Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Back button */}
      <Box sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/count-sessions")}
          sx={{ textTransform: "none", color: "rgba(15,23,42,0.6)", "&:hover": { color: "#0f172a" } }}
        >
          Back to Count Sessions
        </Button>
      </Box>

      {/* Session header */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={2} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 46, height: 46, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: "#6366f118", color: "#6366f1" }}>
            <FactCheckIcon />
          </Box>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography sx={{ fontWeight: 800, fontSize: "1.15rem", color: "#0f172a" }}>
                Count Session — {session?.count_date}
              </Typography>
              <Chip
                size="small"
                label={session?.status?.toUpperCase()}
                color={session?.status === "closed" ? "success" : "warning"}
              />
            </Stack>
            <Typography sx={{ fontSize: "0.82rem", color: "rgba(15,23,42,0.55)" }}>
              {session?.outlet_name}
              {session?.started_by_username ? ` · Started by ${session.started_by_username}` : ""}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
          {[
            { label: "Approved", value: session?.approved_count ?? 0, color: "success" },
            { label: "Pending", value: session?.submitted_count ?? 0, color: "warning" },
            { label: "Variances", value: session?.variance_pending ?? 0, color: session?.variance_pending > 0 ? "error" : "success" },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(15,23,42,0.4)", fontWeight: 600 }}>{label}</Typography>
              <Chip size="small" label={value} color={color} variant="outlined" />
            </Box>
          ))}
          {session?.status === "open" && (
            <Button
              variant="contained"
              startIcon={<LockIcon />}
              onClick={() => setCloseConfirmOpen(true)}
              sx={{ textTransform: "none", bgcolor: "#6366f1", "&:hover": { bgcolor: "#4f46e5" } }}
            >
              Close Session
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: "1px solid rgba(15,23,42,0.08)", mb: 2 }}
      >
        <Tab label={`Counts${countData ? ` (${countData.count})` : ""}`} sx={{ textTransform: "none" }} />
        <Tab label={`Variances${varData ? ` (${varData.count})` : ""}`} sx={{ textTransform: "none" }} />
      </Tabs>

      {/* Tab 1 — Counts */}
      {tab === 0 && (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2, flexWrap: "wrap" }}>
            <TextField
              size="small" placeholder="Search item…" value={countSearch}
              onChange={(e) => setCountSearch(e.target.value)} sx={{ width: 220 }}
            />
            <TextField
              select size="small" label="Status" value={countStatus}
              onChange={(e) => setCountStatus(e.target.value)} sx={{ width: 150 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="submitted">Submitted</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </TextField>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={loadCounts} sx={{ textTransform: "none" }}>Refresh</Button>
            {countSelectionIds.length > 0 && (
              <Button size="small" variant="contained" color="success" startIcon={<CheckIcon />} onClick={handleBulkApprove} sx={{ textTransform: "none" }}>
                Approve {countSelectionIds.length} Selected
              </Button>
            )}
          </Stack>
          <DataTable
            rows={countData?.results || []}
            columns={countColumns}
            loading={countLoading}
            pageSize={COUNT_PAGE_SIZE}
            rowCount={countData?.count || 0}
            page={countPage}
            onPageChange={setCountPage}
            checkboxSelection
            rowSelectionModel={countSelectionIds}
            onRowSelectionModelChange={(ids) => setCountSelection({ type: "include", ids: new Set(ids) })}
            getRowId={(r) => r.id}
          />
        </>
      )}

      {/* Tab 2 — Variances */}
      {tab === 1 && (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2, flexWrap: "wrap" }}>
            <TextField
              size="small" placeholder="Search item…" value={varSearch}
              onChange={(e) => setVarSearch(e.target.value)} sx={{ width: 220 }}
            />
            <TextField
              select size="small" label="Status" value={varStatus}
              onChange={(e) => setVarStatus(e.target.value)} sx={{ width: 150 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="investigating">Investigating</MenuItem>
              <MenuItem value="explained">Explained</MenuItem>
              <MenuItem value="adjusted">Adjusted</MenuItem>
              <MenuItem value="written_off">Written off</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
            </TextField>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={loadVarRecords} sx={{ textTransform: "none" }}>Refresh</Button>
            {varSelectionIds.length > 0 && (
              <Button size="small" variant="outlined" startIcon={<GavelIcon />} onClick={() => setBulkVarOpen(true)} sx={{ textTransform: "none" }}>
                Resolve {varSelectionIds.length} Selected
              </Button>
            )}
          </Stack>
          <DataTable
            rows={varData?.results || []}
            columns={varColumns}
            loading={varLoading}
            pageSize={VAR_PAGE_SIZE}
            rowCount={varData?.count || 0}
            page={varPage}
            onPageChange={setVarPage}
            checkboxSelection
            rowSelectionModel={varSelectionIds}
            onRowSelectionModelChange={(ids) => setVarSelection({ type: "include", ids: new Set(ids) })}
            getRowId={(r) => r.id}
          />
        </>
      )}

      {/* Reject count dialog */}
      <Dialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reject Count</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1, fontSize: "0.85rem", color: "rgba(15,23,42,0.6)" }}>
            {rejectTarget?.item_code} — {rejectTarget?.item_name}
          </Typography>
          <TextField
            autoFocus fullWidth size="small" label="Reason" value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReject()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button onClick={handleReject} color="error" disabled={!rejectReason.trim()} sx={{ textTransform: "none" }}>Reject</Button>
        </DialogActions>
      </Dialog>

      {/* Resolve variance dialog */}
      <Dialog open={!!resolveTarget} onClose={() => setResolveTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Resolve Variance</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5, fontSize: "0.85rem", color: "rgba(15,23,42,0.6)" }}>
            {resolveTarget?.item_code} — {resolveTarget?.item_name} · Variance: {fmt(resolveTarget?.variance_qty)}
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              select size="small" fullWidth label="Resolution Status"
              value={resolveForm.status}
              onChange={(e) => setResolveForm((f) => ({ ...f, status: e.target.value }))}
            >
              {VAR_STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField
              size="small" fullWidth label="Note" multiline rows={2} value={resolveForm.note}
              onChange={(e) => setResolveForm((f) => ({ ...f, note: e.target.value }))}
            />
            {resolveForm.status === "adjusted" && (
              <TextField
                size="small" fullWidth label="Adjustment Qty" type="number" value={resolveForm.adjustment_qty}
                onChange={(e) => setResolveForm((f) => ({ ...f, adjustment_qty: e.target.value }))}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveTarget(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button onClick={handleResolve} variant="contained" sx={{ textTransform: "none", bgcolor: "#6366f1", "&:hover": { bgcolor: "#4f46e5" } }}>Resolve</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk resolve variance dialog */}
      <Dialog open={bulkVarOpen} onClose={() => setBulkVarOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Bulk Resolve {varSelectionIds.length} Variance(s)</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              select size="small" fullWidth label="Resolution Status"
              value={bulkVarForm.status}
              onChange={(e) => setBulkVarForm((f) => ({ ...f, status: e.target.value }))}
            >
              {VAR_STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField
              size="small" fullWidth label="Note (optional)" value={bulkVarForm.note}
              onChange={(e) => setBulkVarForm((f) => ({ ...f, note: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkVarOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button onClick={handleBulkResolve} variant="contained" sx={{ textTransform: "none", bgcolor: "#6366f1", "&:hover": { bgcolor: "#4f46e5" } }}>
            Resolve All
          </Button>
        </DialogActions>
      </Dialog>

      {/* Close session confirm */}
      <Dialog open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close Count Session?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.9rem", color: "rgba(15,23,42,0.7)" }}>
            This will auto-approve any remaining submitted counts and generate variance records for all items in the POS snapshot. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseConfirmOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button
            onClick={handleCloseSession}
            variant="contained"
            disabled={closeLoading}
            startIcon={closeLoading ? <CircularProgress size={16} /> : <LockIcon />}
            sx={{ textTransform: "none", bgcolor: "#6366f1", "&:hover": { bgcolor: "#4f46e5" } }}
          >
            Close Session
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
