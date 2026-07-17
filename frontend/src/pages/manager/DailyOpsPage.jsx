import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Grid, Card, CardContent, Typography, Stack, Chip, Button, TextField,
  IconButton, Divider, Alert, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, InputAdornment, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, TablePagination, LinearProgress, Tooltip,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ChecklistIcon from "@mui/icons-material/Checklist";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import TodayIcon from "@mui/icons-material/Today";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useOutlet } from "../../contexts/OutletContext";
import { getUploadHistory, getUploadDiff } from "../../api/uploads";
import {
  getCountProgress, getUncounted, getDailyCounts, getVariances, getMobileDevices,
} from "../../api/dashboard";

const isoToday = () => new Date().toISOString().slice(0, 10);
const fmtNum = (v, digits = 0) => v == null ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : "—";
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

// ────────────────────────────────────────────────────────────────────────────
// Uncounted items modal — server-paginated, safe for thousands of items
// ────────────────────────────────────────────────────────────────────────────
function UncountedModal({ open, onClose, outletId, date }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getUncounted({ outletId, date, page: page + 1, pageSize, q })
      .then(({ data }) => { setRows(data.results || []); setCount(data.count || 0); })
      .catch(() => { setRows([]); setCount(0); })
      .finally(() => setLoading(false));
  }, [open, outletId, date, page, pageSize, q]);

  useEffect(() => { if (open) setPage(0); }, [q, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4">Uncounted items</Typography>
          <Typography variant="caption" color="text.secondary">
            {count.toLocaleString()} items not yet counted for {date}
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          fullWidth size="small" placeholder="Search item code or name…"
          value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 2 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Rack / Shelf</TableCell>
                <TableCell align="right">POS Qty</TableCell>
                <TableCell align="right">Cost</TableCell>
                <TableCell align="right">Sell</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>Everything counted 🎉</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => (
                <TableRow key={r.item_id} hover>
                  <TableCell sx={{ fontFamily: "monospace" }}>{r.item_code}</TableCell>
                  <TableCell>{r.item_name}</TableCell>
                  <TableCell>{r.category || "—"}</TableCell>
                  <TableCell>{[r.rack_number, r.shelf].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell align="right">{fmtNum(r.pos_qty, 3)}</TableCell>
                  <TableCell align="right">{fmtNum(r.cost_price, 2)}</TableCell>
                  <TableCell align="right">{fmtNum(r.selling_price, 2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={count} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPageOptions={[]}
        />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Counted items modal — reuses getDailyCounts (already paginated)
// ────────────────────────────────────────────────────────────────────────────
function CountedModal({ open, onClose, outletId, date }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getDailyCounts({ outletId, dateFrom: date, dateTo: date, search: q, page: page + 1, pageSize })
      .then(({ data }) => { setRows(data.results || []); setCount(data.count || 0); })
      .catch(() => { setRows([]); setCount(0); })
      .finally(() => setLoading(false));
  }, [open, outletId, date, page, pageSize, q]);

  useEffect(() => { if (open) setPage(0); }, [q, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4">Counted items</Typography>
          <Typography variant="caption" color="text.secondary">
            {count.toLocaleString()} count entries for {date}
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          fullWidth size="small" placeholder="Search item…"
          value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 2 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="right">Counted qty</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Counted by</TableCell>
                <TableCell>At</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>Nothing counted yet</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ fontFamily: "monospace" }}>{r.item_code}</TableCell>
                  <TableCell>{r.item_name}</TableCell>
                  <TableCell>{r.location_tag || "—"}</TableCell>
                  <TableCell align="right">{fmtNum(r.actual_qty, 3)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small" variant="outlined"
                      label={r.approval_status}
                      color={r.approval_status === "approved" ? "success" : r.approval_status === "submitted" ? "info" : r.approval_status === "rejected" ? "error" : "default"}
                    />
                  </TableCell>
                  <TableCell>{r.counted_by_username || "—"}</TableCell>
                  <TableCell>{fmtTime(r.counted_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={count} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPageOptions={[]}
        />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Variances modal — read-only preview; edits happen on Variance Reconciliation page
// ────────────────────────────────────────────────────────────────────────────
function VariancesModal({ open, onClose, outletId }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getVariances(outletId, page + 1, pageSize)
      .then(({ data }) => {
        // getVariances returns an array today; be tolerant of paginated shape too
        const results = Array.isArray(data) ? data : (data.results || []);
        setRows(results);
        setCount(Array.isArray(data) ? results.length : (data.count || results.length));
      })
      .catch(() => { setRows([]); setCount(0); })
      .finally(() => setLoading(false));
  }, [open, outletId, page, pageSize]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4">Variances</Typography>
          <Typography variant="caption" color="text.secondary">
            {count.toLocaleString()} differences (POS vs counted)
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">POS qty</TableCell>
                <TableCell align="right">Counted</TableCell>
                <TableCell align="right">Variance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>No variances yet</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => {
                const v = r.variance;
                const color = v == null ? "default" : v === 0 ? "default" : v > 0 ? "success" : "error";
                return (
                  <TableRow key={r.item_id} hover>
                    <TableCell sx={{ fontFamily: "monospace" }}>{r.item_code}</TableCell>
                    <TableCell>{r.item_name}</TableCell>
                    <TableCell align="right">{fmtNum(r.pos_qty, 3)}</TableCell>
                    <TableCell align="right">{fmtNum(r.actual_qty, 3)}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" variant="outlined" color={color} label={fmtNum(v, 3)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={count} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPageOptions={[]}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { onClose(); navigate("/variance-reconciliation"); }} color="primary">
          Reconcile variances →
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Diff modal — compare a superseded upload against the active one
// ────────────────────────────────────────────────────────────────────────────
function DiffModal({ open, onClose, logId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !logId) return;
    setLoading(true); setError("");
    getUploadDiff(logId)
      .then(({ data }) => setData(data))
      .catch((e) => setError(e.response?.data?.detail || "Could not load diff."))
      .finally(() => setLoading(false));
  }, [open, logId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h4">Upload diff</Typography>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <CircularProgress size={22} />}
        {error && <Alert severity="error">{error}</Alert>}
        {data && (
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", fontFamily: "monospace" }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────
export default function DailyOpsPage() {
  const { outletId, selectedOutlet } = useOutlet();
  const [date, setDate] = useState(isoToday());
  const [progress, setProgress] = useState(null);
  const [uploadHistory, setUploadHistory] = useState({ logs: [] });
  const [devices, setDevices] = useState([]);
  const [variancesPreview, setVariancesPreview] = useState({ count: 0, netValue: 0 });
  const [loading, setLoading] = useState(true);
  const [showUploads, setShowUploads] = useState(false);
  const [uncOpen, setUncOpen] = useState(false);
  const [cntOpen, setCntOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [diffId, setDiffId] = useState(null);

  const canLoad = !!outletId;

  useEffect(() => {
    if (!canLoad) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      getCountProgress(outletId).catch(() => ({ data: null })),
      getUploadHistory(outletId).catch(() => ({ data: { logs: [] } })),
      getMobileDevices({ outletId }).catch(() => ({ data: { results: [] } })),
      getVariances(outletId, 1, 500).catch(() => ({ data: [] })),
    ]).then(([progRes, upRes, devRes, varRes]) => {
      setProgress(progRes.data);
      setUploadHistory(upRes.data && upRes.data.logs !== undefined ? upRes.data : { logs: upRes.data || [] });
      setDevices(devRes.data?.results || []);
      const vRows = Array.isArray(varRes.data) ? varRes.data : (varRes.data?.results || []);
      const netValue = vRows.reduce((s, r) => s + (Number(r.variance_value) || 0), 0);
      setVariancesPreview({ count: vRows.length, netValue });
    }).finally(() => setLoading(false));
  }, [outletId, date]);

  const uploadsToday = useMemo(
    () => (uploadHistory.logs || []).filter((l) => l.snapshot_date === date),
    [uploadHistory, date],
  );
  const latestUpload = uploadsToday[0]; // history is ordered newest-first

  const shiftDate = (days) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  if (!canLoad) {
    return (
      <Layout>
        <PageHeader title="Daily Ops" subtitle="POS + counts + variances for one working day" icon={<TodayIcon />} />
        <Alert severity="info">Pick an outlet from the header switcher to view daily operations.</Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Daily Ops"
        subtitle={selectedOutlet?.name ? `${selectedOutlet.name} · ${date}` : `Working day: ${date}`}
        icon={<TodayIcon />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton size="small" onClick={() => shiftDate(-1)}><ArrowBackIosNewIcon fontSize="small" /></IconButton>
            <TextField
              size="small" type="date"
              value={date} onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 170 }}
            />
            <IconButton size="small" onClick={() => shiftDate(1)}><ArrowForwardIosIcon fontSize="small" /></IconButton>
            <Button size="small" onClick={() => setDate(isoToday())}>Today</Button>
          </Stack>
        }
      />

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={2}>
        {/* ───────────── Zone 1: POS UPLOAD ───────────── */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <UploadFileIcon color="primary" />
                <Typography variant="h5">POS Upload</Typography>
                {latestUpload ? (
                  <Chip size="small" color="success" variant="outlined" icon={<CheckCircleIcon />} label="Uploaded" />
                ) : (
                  <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />} label="Not uploaded" />
                )}
              </Stack>

              {latestUpload ? (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Latest: <b>{fmtTime(latestUpload.uploaded_at)}</b> by {latestUpload.uploaded_by_username || "—"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {fmtNum(latestUpload.total_rows)} rows · {fmtNum(latestUpload.matched_rows)} matched · {fmtNum(latestUpload.new_items_count)} new
                  </Typography>
                  <Divider sx={{ my: 1.5 }} />
                  <Button size="small" onClick={() => setShowUploads(!showUploads)}>
                    {uploadsToday.length} upload{uploadsToday.length === 1 ? "" : "s"} today {showUploads ? "▲" : "▼"}
                  </Button>
                  {showUploads && (
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      {uploadsToday.map((log, i) => {
                        const isActive = i === 0;
                        return (
                          <Stack key={log.id} direction="row" alignItems="center" spacing={1}
                                 sx={{ px: 1, py: 0.5, bgcolor: isActive ? "action.selected" : "transparent", borderRadius: 1 }}>
                            <Typography variant="caption" sx={{ minWidth: 60 }}>{fmtTime(log.uploaded_at)}</Typography>
                            <Typography variant="caption" sx={{ minWidth: 90 }}>{log.uploaded_by_username || "—"}</Typography>
                            <Typography variant="caption" sx={{ flex: 1 }}>{fmtNum(log.total_rows)} rows</Typography>
                            {isActive && <Chip size="small" label="ACTIVE" color="primary" variant="outlined" />}
                            {!isActive && (
                              <Tooltip title="View diff vs currently active upload">
                                <IconButton size="small" onClick={() => setDiffId(log.id)}>
                                  <CompareArrowsIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        );
                      })}
                    </Stack>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No POS upload recorded for {date}. Head to Transactions to upload.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ───────────── Zone 2: STOCK COUNT ───────────── */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <ChecklistIcon color="primary" />
                <Typography variant="h5">Stock Count</Typography>
                {progress?.session_status && (
                  <Chip
                    size="small" variant="outlined"
                    label={`Session ${progress.session_status.toUpperCase()}`}
                    color={progress.session_status === "open" ? "info" : "default"}
                  />
                )}
              </Stack>
              {progress ? (
                <>
                  <Typography variant="h3" sx={{ my: 0.5 }}>
                    {fmtNum(progress.items_counted)} / {fmtNum(progress.items_total)}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      counted
                    </Typography>
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={progress.items_total > 0 ? Math.min(100, (progress.items_counted / progress.items_total) * 100) : 0}
                    sx={{ height: 8, borderRadius: 4, mb: 1.5 }}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" onClick={() => setCntOpen(true)}>See counted</Button>
                    <Button size="small" variant="outlined" onClick={() => setUncOpen(true)}>See uncounted</Button>
                  </Stack>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">No count activity for {date}.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ───────────── Zone 3: VARIANCES ───────────── */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <FactCheckIcon color="primary" />
                <Typography variant="h5">Variances</Typography>
                {progress?.session_status === "open" && (
                  <Chip size="small" variant="outlined" color="warning" label="Preliminary" />
                )}
              </Stack>
              <Typography variant="h3">
                {fmtNum(variancesPreview.count)}
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  differences
                </Typography>
              </Typography>
              <Typography variant="body2" color={variancesPreview.netValue < 0 ? "error.main" : "text.secondary"}>
                Net value: {fmtNum(variancesPreview.netValue, 2)}
              </Typography>
              {progress?.session_status === "open" && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  Numbers finalize when the count session closes.
                </Typography>
              )}
              <Button size="small" variant="outlined" onClick={() => setVarOpen(true)} sx={{ mt: 1.5 }}>
                See all variances
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* ───────────── Zone 4: ACTIVITY ───────────── */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <PhoneAndroidIcon color="primary" />
                <Typography variant="h5">Activity</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Active devices today: <b>{devices.length}</b>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Last POS upload: <b>{latestUpload ? fmtTime(latestUpload.uploaded_at) : "—"}</b>
              </Typography>
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {devices.slice(0, 5).map((d) => (
                  <Typography key={d.id} variant="caption" color="text.secondary">
                    {d.last_user_username || "—"} · last seen {fmtDate(d.last_seen_at)}
                  </Typography>
                ))}
                {devices.length === 0 && (
                  <Typography variant="caption" color="text.secondary">No device activity yet.</Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <UncountedModal open={uncOpen} onClose={() => setUncOpen(false)} outletId={outletId} date={date} />
      <CountedModal open={cntOpen} onClose={() => setCntOpen(false)} outletId={outletId} date={date} />
      <VariancesModal open={varOpen} onClose={() => setVarOpen(false)} outletId={outletId} />
      <DiffModal open={!!diffId} onClose={() => setDiffId(null)} logId={diffId} />
    </Layout>
  );
}
