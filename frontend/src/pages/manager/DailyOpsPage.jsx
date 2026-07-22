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
  getUncounted, getMobileDevices, listVarianceRecords,
  getCountsGrouped, getCountProgress2,
} from "../../api/dashboard";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

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
function CountedRow({ r }) {
  const [open, setOpen] = useState(false);
  const hasMultiple = r.locations_count > 1;

  // Variance chip color — positive (extra on shelf) is neutral/success,
  // negative (shrinkage) is error. Null when we can't compute (no POS snapshot).
  const vq = r.variance_qty;
  const varColor = vq == null ? "default" : vq === 0 ? "default" : vq > 0 ? "success" : "error";
  const vv = r.variance_value;
  const valueColor = vv == null ? "text.primary" : vv < 0 ? "error.main" : vv > 0 ? "success.main" : "text.primary";

  return (
    <>
      <TableRow hover sx={{ "& > *": { borderBottom: hasMultiple && open ? "unset" : undefined } }}>
        <TableCell padding="checkbox">
          {hasMultiple && (
            <IconButton size="small" onClick={() => setOpen(!open)}>
              {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
        <TableCell sx={{ fontFamily: "monospace" }}>{r.item_code}</TableCell>
        <TableCell>{r.item_name}</TableCell>
        <TableCell>
          {hasMultiple
            ? <Chip size="small" variant="outlined" label={`${r.locations_count} locations`} />
            : (r.entries[0]?.location_tag || "—")}
        </TableCell>
        <TableCell align="right">{r.pos_qty == null ? "—" : fmtNum(r.pos_qty, 3)}</TableCell>
        <TableCell align="right">{r.sell_price == null ? "—" : fmtNum(r.sell_price, 2)}</TableCell>
        <TableCell align="right"><b>{fmtNum(r.total_qty, 3)}</b></TableCell>
        <TableCell align="right">
          {vq == null
            ? <span style={{ color: "rgba(0,0,0,0.4)" }}>—</span>
            : <Chip size="small" variant="outlined" color={varColor} label={fmtNum(vq, 3)} />}
        </TableCell>
        <TableCell align="right" sx={{ color: valueColor, fontWeight: vv ? 600 : 400 }}>
          {vv == null ? "—" : fmtNum(vv, 2)}
        </TableCell>
        <TableCell>{fmtTime(r.last_counted_at)}</TableCell>
      </TableRow>
      {hasMultiple && (
        <TableRow>
          <TableCell colSpan={10} sx={{ py: 0, borderBottom: open ? undefined : "unset" }}>
            <Box sx={{ display: open ? "block" : "none", pl: 6, py: 1, bgcolor: "action.hover" }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                Per-location breakdown
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Location</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell>Counted by</TableCell>
                    <TableCell>At</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {r.entries.map((e) => (
                    <TableRow key={e.stock_count_id}>
                      <TableCell>{e.location_tag || "—"}</TableCell>
                      <TableCell align="right">{fmtNum(e.qty, 3)}</TableCell>
                      <TableCell>{e.counted_by || "—"}</TableCell>
                      <TableCell>{fmtTime(e.counted_at)}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={e.approval_status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

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
    getCountsGrouped({ outletId, date, page: page + 1, pageSize, q })
      .then(({ data }) => { setRows(data.results || []); setCount(data.count || 0); })
      .catch(() => { setRows([]); setCount(0); })
      .finally(() => setLoading(false));
  }, [open, outletId, date, page, pageSize, q]);

  useEffect(() => { if (open) setPage(0); }, [q, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4">Counted items · {date}</Typography>
          <Typography variant="caption" color="text.secondary">
            {count.toLocaleString()} unique item{count === 1 ? "" : "s"} counted on {date}
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
                <TableCell padding="checkbox" />
                <TableCell>Code</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="right">POS qty</TableCell>
                <TableCell align="right">Sell</TableCell>
                <TableCell align="right">Counted qty</TableCell>
                <TableCell align="right">Variance qty</TableCell>
                <TableCell align="right">Variance value</TableCell>
                <TableCell>Last at</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4, color: "text.secondary" }}>Nothing counted yet</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => <CountedRow key={r.item_id} r={r} />)}
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
// Variances modal — real variance_records, filtered by the working day so
// what the user sees agrees with the header date. Full table w/ headers,
// session date column, value column, and status chip.
// ────────────────────────────────────────────────────────────────────────────
function VariancesModal({ open, onClose, outletId, date }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listVarianceRecords({
      only_counted: 1,
      ...(outletId ? { outlet: outletId } : {}),
      date_from: date,
      date_to: date,
      page: page + 1,
      page_size: pageSize,
      ...(q ? { search: q } : {}),
    })
      .then(({ data }) => {
        setRows(data.results || []);
        setCount(data.count || 0);
      })
      .catch(() => { setRows([]); setCount(0); })
      .finally(() => setLoading(false));
  }, [open, outletId, date, page, pageSize, q]);

  useEffect(() => { if (open) setPage(0); }, [q, date, open]);

  const statusColor = (s) => ({
    pending: "warning", investigating: "info",
    explained: "success", adjusted: "success",
    written_off: "default", closed: "default",
  }[s] || "default");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4">Variances · {date}</Typography>
          <Typography variant="caption" color="text.secondary">
            {count.toLocaleString()} record{count === 1 ? "" : "s"} for count sessions dated {date}
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
                <TableCell>Item</TableCell>
                <TableCell>Session date</TableCell>
                <TableCell align="right">POS qty</TableCell>
                <TableCell align="right">Counted qty</TableCell>
                <TableCell align="right">Variance qty</TableCell>
                <TableCell align="right">Variance value</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No variances for count sessions dated {date}.
                </TableCell></TableRow>
              )}
              {!loading && rows.map((r) => {
                const v = Number(r.variance_qty ?? 0);
                const color = v === 0 ? "default" : v > 0 ? "success" : "error";
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontFamily: "monospace" }}>{r.item_code}</TableCell>
                    <TableCell>{r.item_name}</TableCell>
                    <TableCell>{r.count_date}</TableCell>
                    <TableCell align="right">{fmtNum(r.pos_qty, 3)}</TableCell>
                    <TableCell align="right">{fmtNum(r.counted_qty, 3)}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" variant="outlined" color={color} label={fmtNum(r.variance_qty, 3)} />
                    </TableCell>
                    <TableCell align="right">{fmtNum(r.variance_value, 2)}</TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" color={statusColor(r.status)} label={r.status} />
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
  // outletId is only set for admins (as an explicit override on API calls);
  // for managers it's null and the backend falls back to the user's pinned
  // outlet. Use selectedOutlet?.id for gating so both roles work.
  const { outletId, selectedOutlet } = useOutlet();
  const currentOutletId = selectedOutlet?.id ?? null;
  const [date, setDate] = useState(isoToday());
  const [progress, setProgress] = useState(null);
  const [uploadHistory, setUploadHistory] = useState({ logs: [] });
  const [devices, setDevices] = useState([]);
  const [variancesPreview, setVariancesPreview] = useState({ count: 0, netValue: 0 });
  const [loading, setLoading] = useState(true);
  const [uncOpen, setUncOpen] = useState(false);
  const [cntOpen, setCntOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [diffId, setDiffId] = useState(null);

  const canLoad = !!currentOutletId;

  useEffect(() => {
    if (!canLoad) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      // Now date-aware — historical days show correct progress
      getCountProgress2({ outletId, date }).catch(() => ({ data: null })),
      getUploadHistory(outletId).catch(() => ({ data: { logs: [] } })),
      // Grouped counts double as the source of truth for who counted what
      // today. Small page (per-item, not per-entry) so the summary counts
      // are accurate, and we can also derive counters + item totals from it.
      getCountsGrouped({ outletId, date, page: 1, pageSize: 500 })
        .catch(() => ({ data: { results: [], count: 0 } })),
      // Variances scoped to the working day AND to items actually counted.
      // Uncounted-item variances (counted_qty=0) are hidden — those are just
      // "we haven't counted this yet" noise, handled by the Uncounted view.
      listVarianceRecords({
        only_counted: 1,
        ...(outletId ? { outlet: outletId } : {}),
        date_from: date,
        date_to: date,
        page: 1,
        page_size: 500,
      }).catch(() => ({ data: { results: [], count: 0 } })),
    ]).then(([progRes, upRes, cntRes, varRes]) => {
      setProgress(progRes.data);
      setUploadHistory(upRes.data && upRes.data.logs !== undefined ? upRes.data : { logs: upRes.data || [] });

      // Build counter summary from grouped counts: which users counted, and
      // how many items each. This replaces the MobileDevice audit — that
      // was a lifetime list, not "who worked today".
      const cntRows = cntRes.data?.results || [];
      const byCounter = new Map();
      for (const row of cntRows) {
        for (const c of row.counters || []) {
          byCounter.set(c, (byCounter.get(c) || 0) + 1);
        }
      }
      setDevices(Array.from(byCounter, ([username, items]) => ({ username, items }))
        .sort((a, b) => b.items - a.items));

      const vRows = varRes.data?.results || [];
      const total = varRes.data?.count ?? vRows.length;
      const netValue = vRows.reduce((s, r) => s + (Number(r.variance_value) || 0), 0);
      setVariancesPreview({ count: total, netValue });
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
        {/* ───────────── Zone 1: POS UPLOAD (one card per upload) ───────────── */}
        {uploadsToday.length === 0 ? (
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <UploadFileIcon color="primary" />
                  <Typography variant="h5">POS Upload</Typography>
                  <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />} label="Not uploaded" />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  No POS upload recorded for {date}. Head to Transactions to upload.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          uploadsToday.map((log, i) => {
            const isActive = i === 0;
            return (
              <Grid item xs={12} md={6} key={log.id}>
                <Card variant="outlined" sx={isActive ? { borderColor: "success.main", borderWidth: 2 } : undefined}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                      <UploadFileIcon color="primary" />
                      <Typography variant="h5">
                        POS Upload {uploadsToday.length > 1 ? `#${uploadsToday.length - i}` : ""}
                      </Typography>
                      {isActive ? (
                        <Chip size="small" color="success" variant="outlined" icon={<CheckCircleIcon />} label="ACTIVE" />
                      ) : (
                        <Chip size="small" color="default" variant="outlined" label="Superseded" />
                      )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Uploaded at <b>{fmtTime(log.uploaded_at)}</b> by {log.uploaded_by_username || "—"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {fmtNum(log.total_rows)} rows · {fmtNum(log.matched_rows)} matched · {fmtNum(log.new_items_count)} new · {fmtNum(log.changed_items_count)} changed
                    </Typography>
                    {!isActive && (
                      <>
                        <Divider sx={{ my: 1.5 }} />
                        <Button
                          size="small" startIcon={<CompareArrowsIcon />}
                          onClick={() => setDiffId(log.id)}
                        >
                          View diff vs active
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })
        )}

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
                    {fmtNum(progress.counted)} / {fmtNum(progress.total_items)}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      counted
                    </Typography>
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={progress.total_items > 0 ? Math.min(100, (progress.counted / progress.total_items) * 100) : 0}
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
              {variancesPreview.count > 0 ? (
                <>
                  <Typography variant="h3">
                    {fmtNum(variancesPreview.count)}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      differences for {date}
                    </Typography>
                  </Typography>
                  <Typography variant="body2" color={variancesPreview.netValue < 0 ? "error.main" : "text.secondary"}>
                    Net value: {fmtNum(variancesPreview.netValue, 2)}
                  </Typography>
                  {progress?.session_status === "open" && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                      Session still OPEN — these numbers may change until it closes.
                    </Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  No variances for count sessions dated {date}.
                </Typography>
              )}
              <Button size="small" variant="outlined" onClick={() => setVarOpen(true)} sx={{ mt: 1.5 }}>
                See variances for {date}
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
                Counters today: <b>{devices.length}</b>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Last POS upload: <b>{latestUpload ? fmtTime(latestUpload.uploaded_at) : "—"}</b>
              </Typography>
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {devices.slice(0, 5).map((d) => (
                  <Typography key={d.username} variant="caption" color="text.secondary">
                    {d.username} · {d.items} item{d.items === 1 ? "" : "s"}
                  </Typography>
                ))}
                {devices.length === 0 && (
                  <Typography variant="caption" color="text.secondary">Nobody counted on this date.</Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <UncountedModal open={uncOpen} onClose={() => setUncOpen(false)} outletId={outletId} date={date} />
      <CountedModal open={cntOpen} onClose={() => setCntOpen(false)} outletId={outletId} date={date} />
      <VariancesModal open={varOpen} onClose={() => setVarOpen(false)} outletId={outletId} date={date} />
      <DiffModal open={!!diffId} onClose={() => setDiffId(null)} logId={diffId} />
    </Layout>
  );
}
