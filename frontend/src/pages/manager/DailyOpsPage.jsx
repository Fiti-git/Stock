import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Grid, Card, CardContent, Typography, Stack, Chip, Button, TextField,
  IconButton, Divider, Alert, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, InputAdornment, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, TablePagination, LinearProgress, Tooltip, MenuItem,
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
import { useNotify } from "../../providers/NotificationProvider";
import { getUploadHistory, getUploadDiff } from "../../api/uploads";
import {
  getUncounted, getMobileDevices, listVarianceRecords,
  getCountsGrouped, getCountProgress2,
  closeCountSession, rejectCount,
  downloadCountsGroupedCsv, downloadUncountedCsv,
  getItemCoverageRange, downloadItemCoverageCsv,
  getDailyCountItems, downloadDailyCountItemsCsv,
} from "../../api/dashboard";
import StarIcon from "@mui/icons-material/Star";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import ReplayIcon from "@mui/icons-material/Replay";
import LockIcon from "@mui/icons-material/Lock";
import DownloadIcon from "@mui/icons-material/Download";
import { TableSortLabel } from "@mui/material";

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

// Sticky-header cell that renders a TableSortLabel wired to a sort state.
function SortableHeadCell({ field, label, sort, setSort, align }) {
  const active = sort.by === field;
  return (
    <TableCell align={align} sortDirection={active ? sort.dir : false}>
      <TableSortLabel
        active={active}
        direction={active ? sort.dir : "asc"}
        onClick={() => {
          if (active) {
            setSort({ by: field, dir: sort.dir === "asc" ? "desc" : "asc" });
          } else {
            setSort({ by: field, dir: "asc" });
          }
        }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

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
  const [sort, setSort] = useState({ by: "pos_qty", dir: "desc" });
  const [dailyOnly, setDailyOnly] = useState(false);
  const [recountOnly, setRecountOnly] = useState(false);
  const [csvSaving, setCsvSaving] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getUncounted({
      outletId, date, page: page + 1, pageSize, q,
      dailyOnly, recountOnly,
      sortBy: sort.by, order: sort.dir,
    })
      .then(({ data }) => { setRows(data.results || []); setCount(data.count || 0); })
      .catch(() => { setRows([]); setCount(0); })
      .finally(() => setLoading(false));
  }, [open, outletId, date, page, pageSize, q, dailyOnly, recountOnly, sort.by, sort.dir]);

  useEffect(() => { if (open) setPage(0); }, [q, dailyOnly, recountOnly, sort.by, sort.dir, open]);

  const handleDownloadCsv = async () => {
    setCsvSaving(true);
    try {
      const { data } = await downloadUncountedCsv({
        outletId, date, q, dailyOnly, recountOnly,
        sortBy: sort.by, order: sort.dir,
      });
      downloadBlob(data, `daily-ops-uncounted-${date}.csv`);
    } catch (err) {
      notify.error("CSV export failed.");
    } finally {
      setCsvSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4">Uncounted items · {date}</Typography>
          <Typography variant="caption" color="text.secondary">
            {count.toLocaleString()} item{count === 1 ? "" : "s"} not yet counted
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small" placeholder="Search item code or name…"
            value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <Button
            size="small" variant="outlined" startIcon={<DownloadIcon />}
            onClick={handleDownloadCsv} disabled={csvSaving}
          >
            {csvSaving ? "Preparing…" : "CSV"}
          </Button>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Filters</Typography>
          <Chip
            size="small" label="Daily-count only"
            variant={dailyOnly ? "filled" : "outlined"}
            color={dailyOnly ? "primary" : "default"}
            onClick={() => setDailyOnly((v) => !v)}
          />
          <Chip
            size="small" label="Recount requested"
            variant={recountOnly ? "filled" : "outlined"}
            color={recountOnly ? "warning" : "default"}
            icon={<ReplayIcon fontSize="small" />}
            onClick={() => setRecountOnly((v) => !v)}
          />
          {(dailyOnly || recountOnly) && (
            <Chip size="small" label="Clear" onClick={() => { setDailyOnly(false); setRecountOnly(false); }} />
          )}
        </Stack>
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <SortableHeadCell field="item_code" label="Code" sort={sort} setSort={setSort} />
                <SortableHeadCell field="item_name" label="Name" sort={sort} setSort={setSort} />
                <SortableHeadCell field="category" label="Category" sort={sort} setSort={setSort} />
                <TableCell>Rack / Shelf</TableCell>
                <SortableHeadCell field="pos_qty" label="POS Qty" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="cost_price" label="Cost" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="selling_price" label="Sell" sort={sort} setSort={setSort} align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  {q || dailyOnly || recountOnly ? "No items match these filters" : "Everything counted 🎉"}
                </TableCell></TableRow>
              )}
              {!loading && rows.map((r) => (
                <TableRow key={r.item_id} hover sx={r.recount_requested ? { bgcolor: "warning.50" } : undefined}>
                  <TableCell sx={{ fontFamily: "monospace" }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{r.item_code}</span>
                      {r.recount_requested && (
                        <Tooltip title={r.recount_reason || "Recount requested by manager"}>
                          <Chip
                            size="small" variant="outlined" color="warning"
                            icon={<ReplayIcon fontSize="small" />}
                            label="Recount"
                          />
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
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
function CountedRow({ r, onRequestRecount }) {
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
        <TableCell padding="checkbox">
          <Tooltip title="Request recount">
            <IconButton size="small" onClick={() => onRequestRecount?.(r)} color="warning">
              <ReplayIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      {hasMultiple && (
        <TableRow>
          <TableCell colSpan={11} sx={{ py: 0, borderBottom: open ? undefined : "unset" }}>
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

const COUNTED_VAR_FILTERS = [
  { key: "all",       label: "All" },
  { key: "shrinkage", label: "Shrinkage" },
  { key: "extra",     label: "Extra" },
  { key: "zero",      label: "No variance" },
];
const COUNTED_STATUS_OPTIONS = [
  { key: "approved",  label: "Approved" },
  { key: "submitted", label: "Submitted" },
  { key: "pending",   label: "Pending" },
  { key: "mixed",     label: "Mixed" },
];

function CountedModal({ open, onClose, outletId, date, onDataChanged }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ by: "abs_variance_value", dir: "desc" });
  const [varFilter, setVarFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(new Set()); // multi-select
  const [reloadTick, setReloadTick] = useState(0);
  const [recountTarget, setRecountTarget] = useState(null);
  const [recountReason, setRecountReason] = useState("");
  const [recountSaving, setRecountSaving] = useState(false);
  const [csvSaving, setCsvSaving] = useState(false);
  const notify = useNotify();

  const statusFilterCsv = useMemo(
    () => Array.from(statusFilter).join(","),
    [statusFilter],
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getCountsGrouped({
      outletId, date, page: page + 1, pageSize, q,
      sortBy: sort.by, order: sort.dir,
      varFilter, statusFilter: statusFilterCsv,
    })
      .then(({ data }) => { setRows(data.results || []); setCount(data.count || 0); })
      .catch(() => { setRows([]); setCount(0); })
      .finally(() => setLoading(false));
  }, [open, outletId, date, page, pageSize, q, sort.by, sort.dir, varFilter, statusFilterCsv, reloadTick]);

  useEffect(() => { if (open) setPage(0); }, [q, sort.by, sort.dir, varFilter, statusFilterCsv, open]);

  const toggleStatus = (key) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleDownloadCsv = async () => {
    setCsvSaving(true);
    try {
      const { data } = await downloadCountsGroupedCsv({
        outletId, date, q,
        sortBy: sort.by, order: sort.dir,
        varFilter, statusFilter: statusFilterCsv,
      });
      downloadBlob(data, `daily-ops-counted-${date}.csv`);
    } catch (err) {
      notify.error("CSV export failed.");
    } finally {
      setCsvSaving(false);
    }
  };

  const handleRecountConfirm = async () => {
    if (!recountTarget) return;
    setRecountSaving(true);
    try {
      // Reject every non-rejected count entry for this item on this date.
      // The Uncounted list will pick the item back up because rejected
      // counts don't disqualify an item from being uncounted.
      const ids = (recountTarget.entries || [])
        .filter((e) => e.approval_status !== "rejected")
        .map((e) => e.stock_count_id);
      const reason = (recountReason || "").trim() || "Recount requested by manager";
      await Promise.all(ids.map((id) => rejectCount(id, reason)));
      notify.success(`Recount requested — ${ids.length} count entr${ids.length === 1 ? "y" : "ies"} rejected.`);
      setRecountTarget(null);
      setRecountReason("");
      setReloadTick((t) => t + 1);
      onDataChanged?.();
    } catch (err) {
      notify.error(err?.response?.data?.detail || "Failed to request recount.");
    } finally {
      setRecountSaving(false);
    }
  };
  const onRequestRecount = (r) => { setRecountReason(""); setRecountTarget(r); };

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
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small" placeholder="Search item code or name…"
            value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <Button
            size="small" variant="outlined" startIcon={<DownloadIcon />}
            onClick={handleDownloadCsv} disabled={csvSaving}
          >
            {csvSaving ? "Preparing…" : "CSV"}
          </Button>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Variance</Typography>
          {COUNTED_VAR_FILTERS.map((f) => (
            <Chip
              key={f.key} size="small" label={f.label}
              variant={varFilter === f.key ? "filled" : "outlined"}
              color={varFilter === f.key ? "primary" : "default"}
              onClick={() => setVarFilter(f.key)}
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Status</Typography>
          {COUNTED_STATUS_OPTIONS.map((s) => (
            <Chip
              key={s.key} size="small" label={s.label}
              variant={statusFilter.has(s.key) ? "filled" : "outlined"}
              color={statusFilter.has(s.key) ? "primary" : "default"}
              onClick={() => toggleStatus(s.key)}
            />
          ))}
          {statusFilter.size > 0 && (
            <Chip size="small" label="Clear" onClick={() => setStatusFilter(new Set())} />
          )}
        </Stack>
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <SortableHeadCell field="item_code" label="Code" sort={sort} setSort={setSort} />
                <SortableHeadCell field="item_name" label="Item" sort={sort} setSort={setSort} />
                <TableCell>Location</TableCell>
                <SortableHeadCell field="pos_qty" label="POS qty" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="sell_price" label="Sell" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="total_qty" label="Counted qty" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="variance_qty" label="Variance qty" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="abs_variance_value" label="Variance value" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="last_counted_at" label="Last at" sort={sort} setSort={setSort} />
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={11} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={11} align="center" sx={{ py: 4, color: "text.secondary" }}>Nothing matches these filters</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => <CountedRow key={r.item_id} r={r} onRequestRecount={onRequestRecount} />)}
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

      {/* Recount request confirmation — nested so it stacks over the modal */}
      <Dialog
        open={!!recountTarget}
        onClose={() => !recountSaving && setRecountTarget(null)}
        maxWidth="sm" fullWidth
      >
        <DialogTitle>Request recount</DialogTitle>
        <DialogContent dividers>
          {recountTarget && (
            <>
              <Typography variant="body2" sx={{ mb: 2 }}>
                All count entries for this item on <b>{date}</b> will be rejected. The item
                goes back to the Uncounted list with a "Recount requested" flag so the
                counter knows to prioritize it.
              </Typography>
              <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1, mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  ITEM
                </Typography>
                <Typography variant="body2">
                  <b>{recountTarget.item_code}</b> · {recountTarget.item_name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  {recountTarget.locations_count} location{recountTarget.locations_count === 1 ? "" : "s"} · total counted {fmtNum(recountTarget.total_qty, 3)}
                </Typography>
              </Box>
              <TextField
                fullWidth multiline rows={2}
                size="small" label="Reason (optional)"
                placeholder="Why should this be recounted?"
                value={recountReason}
                onChange={(e) => setRecountReason(e.target.value)}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecountTarget(null)} disabled={recountSaving}>Cancel</Button>
          <Button onClick={handleRecountConfirm} variant="contained" color="warning" disabled={recountSaving}>
            {recountSaving ? "Sending…" : "Request recount"}
          </Button>
        </DialogActions>
      </Dialog>
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
// Coverage modal — per-item count-frequency across a date range.
// Answers "which items are we ignoring vs counting religiously?"
// ────────────────────────────────────────────────────────────────────────────
const COVERAGE_RANGE_PRESETS = [
  { key: "7d",  label: "Last 7 days" },
  { key: "custom", label: "Custom" },
];
const COVERAGE_BUCKETS = [
  { key: "all",        label: "All",        color: "default" },
  { key: "never",      label: "Never",      color: "error"   },
  { key: "once",       label: "Once",       color: "warning" },
  { key: "occasional", label: "Occasional", color: "info"    },
  { key: "frequent",   label: "Frequent",   color: "success" },
];
const isoDaysBack = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function CoverageModal({ open, onClose, outletId }) {
  const [rangeKey, setRangeKey] = useState("7d");
  const [from, setFrom] = useState(isoDaysBack(6));
  const [to, setTo] = useState(isoToday());
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState("all");
  const [sort, setSort] = useState({ by: "times_counted", dir: "asc" });
  const [csvSaving, setCsvSaving] = useState(false);
  const notify = useNotify();

  // Whenever a preset changes, snap the from/to.
  useEffect(() => {
    if (rangeKey === "7d") { setFrom(isoDaysBack(6)); setTo(isoToday()); }
    // "custom" leaves the current from/to alone; user edits directly
  }, [rangeKey]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getItemCoverageRange({
      outletId, from, to, q, bucket,
      sortBy: sort.by, order: sort.dir,
      page: page + 1, pageSize,
    })
      .then(({ data }) => {
        setRows(data.results || []);
        setCount(data.count || 0);
        setSummary(data.summary || null);
      })
      .catch(() => { setRows([]); setCount(0); setSummary(null); })
      .finally(() => setLoading(false));
  }, [open, outletId, from, to, q, bucket, sort.by, sort.dir, page, pageSize]);

  useEffect(() => { if (open) setPage(0); }, [q, bucket, sort.by, sort.dir, from, to, open]);

  const handleDownloadCsv = async () => {
    setCsvSaving(true);
    try {
      const { data } = await downloadItemCoverageCsv({
        outletId, from, to, q, bucket,
        sortBy: sort.by, order: sort.dir,
      });
      downloadBlob(data, `daily-ops-coverage-${from}-to-${to}.csv`);
    } catch (err) {
      notify.error("CSV export failed.");
    } finally {
      setCsvSaving(false);
    }
  };

  const bucketColor = (b) => (COVERAGE_BUCKETS.find((x) => x.key === b) || {}).color || "default";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4">Count coverage · {from} → {to}</Typography>
          {summary && (
            <Typography variant="caption" color="text.secondary">
              {fmtNum(summary.total_items)} items · {fmtNum(summary.counted_at_least_once)} counted
              ({summary.total_items > 0 ? Math.round(summary.counted_at_least_once / summary.total_items * 100) : 0}%) ·
              {" "}{fmtNum(summary.never_counted)} never counted ·
              {" "}frequent = counted ≥ {summary.frequent_threshold} day{summary.frequent_threshold === 1 ? "" : "s"}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* Range picker */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small" select value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            {COVERAGE_RANGE_PRESETS.map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
          </TextField>
          <TextField
            size="small" type="date" label="From"
            InputLabelProps={{ shrink: true }}
            value={from}
            onChange={(e) => { setRangeKey("custom"); setFrom(e.target.value); }}
          />
          <TextField
            size="small" type="date" label="To"
            InputLabelProps={{ shrink: true }}
            value={to}
            onChange={(e) => { setRangeKey("custom"); setTo(e.target.value); }}
          />
          <TextField
            size="small" placeholder="Search item code or name…"
            value={q} onChange={(e) => setQ(e.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <Button
            size="small" variant="outlined" startIcon={<DownloadIcon />}
            onClick={handleDownloadCsv} disabled={csvSaving}
          >
            {csvSaving ? "Preparing…" : "CSV"}
          </Button>
          <Button
            size="small" variant="contained"
            component="a"
            href={`/admin/count-history-detail?from=${from}&to=${to}${outletId ? `&outlet=${outletId}` : ""}`}
            target="_blank"
            rel="noopener"
          >
            View detail →
          </Button>
        </Stack>

        {/* Bucket filter — single-select. Counts on each chip come from the
            summary payload so managers see the split without applying the
            filter first (e.g. "Never (6,307)"). */}
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Coverage</Typography>
          {COVERAGE_BUCKETS.map((b) => {
            const n = b.key === "all"
              ? summary?.total_items
              : summary?.bucket_counts?.[b.key];
            const label = n == null ? b.label : `${b.label} (${fmtNum(n)})`;
            return (
              <Chip
                key={b.key} size="small" label={label}
                variant={bucket === b.key ? "filled" : "outlined"}
                color={bucket === b.key ? b.color : "default"}
                onClick={() => setBucket(b.key)}
              />
            );
          })}
        </Stack>

        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <SortableHeadCell field="item_code" label="Code" sort={sort} setSort={setSort} />
                <SortableHeadCell field="item_name" label="Item" sort={sort} setSort={setSort} />
                <SortableHeadCell field="category" label="Category" sort={sort} setSort={setSort} />
                <SortableHeadCell field="times_counted" label="Times counted" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="last_counted" label="Last counted" sort={sort} setSort={setSort} />
                <SortableHeadCell field="total_qty" label="Total qty" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="coverage_bucket" label="Coverage" sort={sort} setSort={setSort} />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No items match these filters
                </TableCell></TableRow>
              )}
              {!loading && rows.map((r) => (
                <TableRow key={r.item_id} hover>
                  <TableCell sx={{ fontFamily: "monospace" }}>{r.item_code}</TableCell>
                  <TableCell>{r.item_name}</TableCell>
                  <TableCell>{r.category || "—"}</TableCell>
                  <TableCell align="right">{fmtNum(r.times_counted)}</TableCell>
                  <TableCell>{r.last_counted || "—"}</TableCell>
                  <TableCell align="right">{fmtNum(r.total_qty, 3)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small" variant="outlined"
                      color={bucketColor(r.coverage_bucket)}
                      label={r.coverage_bucket}
                    />
                  </TableCell>
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
// Daily-count items modal — shows every is_daily_count item for the outlet
// alongside today's count + variance status. Card summary lives on the
// main Daily Ops page and drills into this modal.
// ────────────────────────────────────────────────────────────────────────────
const DAILY_ITEM_BUCKETS = [
  { key: "all",         label: "All",         color: "default" },
  { key: "not_counted", label: "Not counted", color: "error"   },
  { key: "match",       label: "Match",       color: "success" },
  { key: "shrinkage",   label: "Shrinkage",   color: "warning" },
  { key: "extra",       label: "Extra",       color: "info"    },
];

function DailyCountModal({ open, onClose, outletId, date }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState("all");
  const [sort, setSort] = useState({ by: "urgency", dir: "asc" });
  const [csvSaving, setCsvSaving] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getDailyCountItems({
      outletId, date, q, bucket,
      sortBy: sort.by, order: sort.dir,
      page: page + 1, pageSize,
    })
      .then(({ data }) => {
        setRows(data.results || []);
        setCount(data.count || 0);
        setSummary(data.summary || null);
      })
      .catch(() => { setRows([]); setCount(0); setSummary(null); })
      .finally(() => setLoading(false));
  }, [open, outletId, date, q, bucket, sort.by, sort.dir, page, pageSize]);

  useEffect(() => { if (open) setPage(0); }, [q, bucket, sort.by, sort.dir, open]);

  const handleDownloadCsv = async () => {
    setCsvSaving(true);
    try {
      const { data } = await downloadDailyCountItemsCsv({
        outletId, date, q, bucket,
        sortBy: sort.by, order: sort.dir,
      });
      downloadBlob(data, `daily-ops-daily-count-${date}.csv`);
    } catch {
      notify.error("CSV export failed.");
    } finally {
      setCsvSaving(false);
    }
  };

  const bucketColor = (b) => (DAILY_ITEM_BUCKETS.find((x) => x.key === b) || {}).color || "default";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4">Daily-count items · {date}</Typography>
          {summary && (
            <Typography variant="caption" color="text.secondary">
              {fmtNum(summary.total_items)} items · {fmtNum(summary.counted)} counted ({summary.counted_pct}%) ·
              {" "}{fmtNum(summary.not_counted)} not counted ·
              {" "}net variance {fmtNum(summary.net_variance_value, 2)}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small" placeholder="Search item code or name…"
            value={q} onChange={(e) => setQ(e.target.value)}
            sx={{ flex: 1, minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <Button
            size="small" variant="outlined" startIcon={<DownloadIcon />}
            onClick={handleDownloadCsv} disabled={csvSaving}
          >
            {csvSaving ? "Preparing…" : "CSV"}
          </Button>
        </Stack>

        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Status</Typography>
          {DAILY_ITEM_BUCKETS.map((b) => {
            const n = b.key === "all"
              ? summary?.total_items
              : summary?.bucket_counts?.[b.key];
            const label = n == null ? b.label : `${b.label} (${fmtNum(n)})`;
            return (
              <Chip
                key={b.key} size="small" label={label}
                variant={bucket === b.key ? "filled" : "outlined"}
                color={bucket === b.key ? b.color : "default"}
                onClick={() => setBucket(b.key)}
              />
            );
          })}
        </Stack>

        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <SortableHeadCell field="item_code" label="Code" sort={sort} setSort={setSort} />
                <SortableHeadCell field="item_name" label="Item" sort={sort} setSort={setSort} />
                <SortableHeadCell field="category" label="Category" sort={sort} setSort={setSort} />
                <TableCell>Rack / Shelf</TableCell>
                <SortableHeadCell field="pos_qty" label="POS qty" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="counted_qty" label="Counted" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="variance_qty" label="Variance qty" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="variance_value" label="Variance value" sort={sort} setSort={setSort} align="right" />
                <SortableHeadCell field="status" label="Status" sort={sort} setSort={setSort} />
                <SortableHeadCell field="counters_summary" label="Counted by" sort={sort} setSort={setSort} />
                <SortableHeadCell field="last_counted_at" label="Last at" sort={sort} setSort={setSort} />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={11} align="center" sx={{ py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={11} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No items match these filters
                </TableCell></TableRow>
              )}
              {!loading && rows.map((r) => {
                const bg =
                  r.status === "not_counted" ? "error.50" :
                  r.status === "shrinkage"   ? "warning.50" :
                  undefined;
                return (
                  <TableRow key={r.item_id} hover sx={bg ? { bgcolor: bg } : undefined}>
                    <TableCell sx={{ fontFamily: "monospace" }}>{r.item_code}</TableCell>
                    <TableCell>{r.item_name}</TableCell>
                    <TableCell>{r.category || "—"}</TableCell>
                    <TableCell>{[r.rack_number, r.shelf].filter(Boolean).join(" / ") || "—"}</TableCell>
                    <TableCell align="right">{r.pos_qty == null ? "—" : fmtNum(r.pos_qty, 3)}</TableCell>
                    <TableCell align="right">
                      {r.counted_qty == null
                        ? <span style={{ color: "rgba(0,0,0,0.4)" }}>—</span>
                        : <b>{fmtNum(r.counted_qty, 3)}</b>}
                    </TableCell>
                    <TableCell align="right">
                      {r.variance_qty == null
                        ? <span style={{ color: "rgba(0,0,0,0.4)" }}>—</span>
                        : <Chip
                            size="small" variant="outlined"
                            color={r.variance_qty === 0 ? "default" : r.variance_qty > 0 ? "success" : "error"}
                            label={fmtNum(r.variance_qty, 3)}
                          />}
                    </TableCell>
                    <TableCell align="right" sx={{
                      color: r.variance_value == null ? "text.primary" :
                             r.variance_value < 0 ? "error.main" :
                             r.variance_value > 0 ? "success.main" : "text.primary",
                      fontWeight: r.variance_value ? 600 : 400,
                    }}>
                      {r.variance_value == null ? "—" : fmtNum(r.variance_value, 2)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small" variant="outlined"
                        color={bucketColor(r.status)}
                        label={r.status.replace("_", " ")}
                      />
                    </TableCell>
                    <TableCell>{r.counters_summary}</TableCell>
                    <TableCell>{fmtTime(r.last_counted_at)}</TableCell>
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
  const [covOpen, setCovOpen] = useState(false);
  const [coverageSummary, setCoverageSummary] = useState(null);
  const [dcOpen, setDcOpen] = useState(false);
  const [dcSummary, setDcSummary] = useState(null);
  const [diffId, setDiffId] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const notify = useNotify();

  const handleCloseSession = async () => {
    if (!progress?.session_id) return;
    setClosing(true);
    try {
      const { data } = await closeCountSession(progress.session_id);
      notify.success(`Session closed. ${data?.variances_created ?? 0} variance record(s) generated.`);
      setCloseConfirm(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify.error(err?.response?.data?.detail || "Failed to close session.");
    } finally {
      setClosing(false);
    }
  };

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
  }, [outletId, date, reloadKey]);

  // Coverage summary card — fixed 14-day range so the card is a stable
  // rolling window. Modal has its own picker for on-demand exploration.
  useEffect(() => {
    if (!canLoad) return;
    const from = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 13);
      return d.toISOString().slice(0, 10);
    })();
    const to = (new Date()).toISOString().slice(0, 10);
    getItemCoverageRange({
      outletId, from, to,
      page: 1, pageSize: 1,   // we only need the summary block
    })
      .then(({ data }) => setCoverageSummary(data?.summary || null))
      .catch(() => setCoverageSummary(null));
  }, [outletId, canLoad, reloadKey]);

  // Daily-count-items summary card — scoped to the current selected date
  // so it updates when the manager clicks prev/next or picks a date.
  useEffect(() => {
    if (!canLoad) return;
    getDailyCountItems({
      outletId, date,
      page: 1, pageSize: 1,   // summary block only
    })
      .then(({ data }) => setDcSummary(data?.summary || null))
      .catch(() => setDcSummary(null));
  }, [outletId, date, canLoad, reloadKey]);

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
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" onClick={() => setCntOpen(true)}>See counted</Button>
                    <Button size="small" variant="outlined" onClick={() => setUncOpen(true)}>See uncounted</Button>
                    {progress?.session_status === "open" && progress?.session_id && (
                      <Button
                        size="small" variant="contained" color="warning"
                        startIcon={<LockIcon fontSize="small" />}
                        onClick={() => setCloseConfirm(true)}
                      >
                        Close session
                      </Button>
                    )}
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

        {/* ───────────── Zone 5: COVERAGE (last 14 days) ───────────── */}
        <Grid item xs={12}>
          <Card
            variant="outlined"
            sx={{
              cursor: "pointer",
              transition: "all 120ms ease",
              "&:hover": { borderColor: "primary.main", boxShadow: 3 },
            }}
            onClick={() => setCovOpen(true)}
          >
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <ChecklistIcon color="primary" />
                <Typography variant="h5">Count coverage · last 14 days</Typography>
                <Chip size="small" variant="outlined" label="Click to explore" sx={{ ml: "auto" }} />
              </Stack>
              {coverageSummary ? (
                <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Total items</Typography>
                    <Typography variant="h5">{fmtNum(coverageSummary.total_items)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Counted at least once</Typography>
                    <Typography variant="h5" color="success.main">
                      {fmtNum(coverageSummary.counted_at_least_once)}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        ({coverageSummary.total_items > 0
                          ? Math.round(coverageSummary.counted_at_least_once / coverageSummary.total_items * 100)
                          : 0}%)
                      </Typography>
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Counted every day</Typography>
                    <Typography variant="h5">{fmtNum(coverageSummary.counted_every_day)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Never counted</Typography>
                    <Typography variant="h5" color="error.main">{fmtNum(coverageSummary.never_counted)}</Typography>
                  </Box>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">Loading coverage…</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ───────────── Zone 6: DAILY-COUNT ITEMS (selected date) ───────────── */}
        <Grid item xs={12}>
          <Card
            variant="outlined"
            sx={{
              cursor: "pointer",
              transition: "all 120ms ease",
              "&:hover": { borderColor: "primary.main", boxShadow: 3 },
            }}
            onClick={() => setDcOpen(true)}
          >
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <StarIcon sx={{ color: "#f59e0b" }} />
                <Typography variant="h5">Daily-count items · {date}</Typography>
                <Chip size="small" variant="outlined" label="Click to explore" sx={{ ml: "auto" }} />
              </Stack>
              {dcSummary ? (
                dcSummary.total_items === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No items flagged as daily-count in this outlet. Turn on the "Daily count" toggle on items in Product Catalog to add them.
                  </Typography>
                ) : (
                  <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Total daily-count items</Typography>
                      <Typography variant="h5">{fmtNum(dcSummary.total_items)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Counted today</Typography>
                      <Typography variant="h5" color="success.main">
                        {fmtNum(dcSummary.counted)}
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          ({dcSummary.counted_pct}%)
                        </Typography>
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Not counted</Typography>
                      <Typography variant="h5" color="error.main">{fmtNum(dcSummary.not_counted)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Net variance value</Typography>
                      <Typography variant="h5" color={dcSummary.net_variance_value < 0 ? "error.main" : "text.primary"}>
                        {fmtNum(dcSummary.net_variance_value, 2)}
                      </Typography>
                    </Box>
                  </Stack>
                )
              ) : (
                <Typography variant="body2" color="text.secondary">Loading daily-count items…</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <CoverageModal open={covOpen} onClose={() => setCovOpen(false)} outletId={outletId} />
      <DailyCountModal open={dcOpen} onClose={() => setDcOpen(false)} outletId={outletId} date={date} />
      <UncountedModal open={uncOpen} onClose={() => setUncOpen(false)} outletId={outletId} date={date} />
      <CountedModal
        open={cntOpen} onClose={() => setCntOpen(false)}
        outletId={outletId} date={date}
        onDataChanged={() => setReloadKey((k) => k + 1)}
      />
      <VariancesModal open={varOpen} onClose={() => setVarOpen(false)} outletId={outletId} date={date} />
      <DiffModal open={!!diffId} onClose={() => setDiffId(null)} logId={diffId} />

      {/* Close-session confirmation */}
      <Dialog open={closeConfirm} onClose={() => !closing && setCloseConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Close count session?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This will finalize the count session for {selectedOutlet?.name || "the outlet"} on <b>{date}</b>:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 3, "& li": { py: 0.5 } }}>
            <li>Any un-approved counts are auto-approved.</li>
            <li>Variance records are generated for every item with a POS snapshot.</li>
            <li>Items not counted stay uncounted in the record.</li>
          </Box>
          <Alert severity="warning" sx={{ mt: 2 }}>
            You can reopen the session later only via admin support — sessions are meant to close once.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseConfirm(false)} disabled={closing}>Cancel</Button>
          <Button onClick={handleCloseSession} variant="contained" color="warning" disabled={closing}>
            {closing ? "Closing…" : "Close session"}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
