import { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, Button, Chip, InputAdornment, Box, Typography,
  FormControlLabel, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Collapse, LinearProgress, TablePagination, Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { useOutlet } from "../../contexts/OutletContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  getItemCountHistory, downloadItemCountHistoryCsv,
} from "../../api/dashboard";

const fmtNum = (n) => (n == null || Number.isNaN(Number(n))
  ? "—"
  : Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 }));

const fmtMoney = (n) => (n == null || Number.isNaN(Number(n))
  ? "—"
  : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function VarianceCell({ value }) {
  const v = Number(value || 0);
  if (Math.abs(v) < 0.001) return <span style={{ color: "#888" }}>0</span>;
  return (
    <span style={{ color: v < 0 ? "#c62828" : "#2e7d32", fontWeight: 600 }}>
      {v > 0 ? "+" : ""}{fmtNum(v)}
    </span>
  );
}

function ValueCell({ value }) {
  const v = Number(value || 0);
  if (Math.abs(v) < 0.01) return <span style={{ color: "#888" }}>—</span>;
  return (
    <Chip
      size="small"
      label={`${v > 0 ? "+" : ""}${fmtMoney(v)}`}
      color={v < 0 ? "error" : "success"}
      variant="outlined"
      sx={{ fontSize: "0.72rem" }}
    />
  );
}

function ExpandedEvents({ row }) {
  const events = row.events || [];
  return (
    <Box sx={{ py: 2, px: 3, bgcolor: "#fafafa" }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {row.item_code} · {row.item_name}
        <span style={{ color: "#666", fontWeight: 400 }}>
          {"  · Latest POS: "}{fmtNum(row.latest_mypos_qty)}
          {row.latest_mypos_date && ` (as of ${row.latest_mypos_date})`}
          {"  · Cost: "}{fmtMoney(row.cost_price)}
        </span>
      </Typography>
      <Table size="small" sx={{ bgcolor: "#fff", borderRadius: 1 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Counted</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Variance</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Loss/Surplus</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Counter</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {events.map((e) => (
            <TableRow key={e.count_id}>
              <TableCell>{e.date}</TableCell>
              <TableCell sx={{ color: "text.secondary" }}>{e.time || "—"}</TableCell>
              <TableCell>
                {e.location
                  ? <Chip size="small" label={e.location} variant="outlined" sx={{ fontSize: "0.7rem" }} />
                  : <span style={{ color: "#aaa" }}>—</span>}
              </TableCell>
              <TableCell align="right">{fmtNum(e.counted)}</TableCell>
              <TableCell align="right"><VarianceCell value={e.variance} /></TableCell>
              <TableCell align="right"><ValueCell value={e.value} /></TableCell>
              <TableCell sx={{ color: "text.secondary" }}>{e.counter || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function ItemCountHistoryPage() {
  const notify = useNotify();
  const { outletId: ctxOutletId } = useOutlet();
  const { user } = useAuth();
  const outletId = ctxOutletId || user?.outlet_id || null;

  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [q, setQ] = useState("");
  const [onlyVariance, setOnlyVariance] = useState(false);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [csvSaving, setCsvSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [rowCount, setRowCount] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());

  async function load() {
    if (!outletId) {
      setLoading(false);
      setRows([]); setRowCount(0);
      return;
    }
    setLoading(true);
    try {
      const { data } = await getItemCountHistory({
        outletId, from, to,
        q: q.trim() || undefined,
        onlyVariance,
        page: page + 1,
        pageSize,
      });
      setRows(data.results || []);
      setRowCount(data.count ?? 0);
      setSummary(data.summary || null);
    } catch (err) {
      notify.error(err?.response?.data?.detail || "Failed to load item count history.");
      setRows([]); setRowCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q, onlyVariance, from, to, outletId, page, pageSize]);

  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line
  }, [q, onlyVariance, from, to, outletId]);

  function toggleRow(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const handleDownloadCsv = async () => {
    setCsvSaving(true);
    try {
      const { data } = await downloadItemCountHistoryCsv({
        outletId, from, to,
        q: q.trim() || undefined,
        onlyVariance,
      });
      downloadBlob(data, `item-count-history-${from}-to-${to}.csv`);
    } catch {
      notify.error("CSV export failed.");
    } finally {
      setCsvSaving(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Item Count History"
        subtitle="Per-item roll-up over a date range. Expand a row to see every count event. Variance is vs the item's latest MyPOS snapshot."
        icon={<Inventory2Icon />}
        actions={
          <Button
            variant="outlined" startIcon={<DownloadIcon />}
            onClick={handleDownloadCsv} disabled={csvSaving}
          >
            {csvSaving ? "Preparing…" : "CSV"}
          </Button>
        }
      />

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField
          size="small" type="date" label="From"
          InputLabelProps={{ shrink: true }}
          value={from} onChange={(e) => setFrom(e.target.value)}
        />
        <TextField
          size="small" type="date" label="To"
          InputLabelProps={{ shrink: true }}
          value={to} onChange={(e) => setTo(e.target.value)}
        />
        <TextField
          size="small" placeholder="Search item code or name…"
          value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <FormControlLabel
          control={<Switch checked={onlyVariance} onChange={(e) => setOnlyVariance(e.target.checked)} />}
          label="Only with variance"
        />
      </Stack>

      {summary && (
        <Box sx={{ mb: 2, display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Stat label="Items counted" value={fmtNum(summary.items_counted)} />
          <Stat label="Total count events" value={fmtNum(summary.total_events)} />
          <Stat label="Latest POS snapshot" value={summary.latest_pos_snapshot_date || "—"} />
          <Stat label="Total loss" value={fmtMoney(summary.total_loss)} color="error.main" />
          <Stat label="Total surplus" value={`+${fmtMoney(summary.total_surplus)}`} color="success.main" />
          <Stat label="Days" value={summary.range_days} />
        </Box>
      )}

      <TableContainer component={Paper} variant="outlined">
        {loading && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: "#f8fafc" }}>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Counts</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Latest MyPOS</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Avg counted</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Latest count</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Total variance</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Loss / Surplus</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={9} sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>
                  No counts in this range
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const isOpen = expanded.has(row.item_id);
              const net = Number(row.loss_value || 0) + Number(row.surplus_value || 0);
              return (
                <Box key={row.item_id} sx={{ display: "contents" }}>
                  <TableRow hover sx={{ "& > *": { borderBottom: "unset" } }}>
                    <TableCell>
                      <Tooltip title={isOpen ? "Collapse" : "Expand"}>
                        <IconButton size="small" onClick={() => toggleRow(row.item_id)}>
                          {isOpen ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{row.item_code}</TableCell>
                    <TableCell>{row.item_name}</TableCell>
                    <TableCell align="right"><strong>{row.counts_in_range}</strong></TableCell>
                    <TableCell align="right">
                      {row.latest_mypos_qty == null
                        ? <span style={{ color: "#aaa" }}>—</span>
                        : fmtNum(row.latest_mypos_qty)}
                    </TableCell>
                    <TableCell align="right">{fmtNum(row.avg_counted)}</TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {row.latest_count_date} ({fmtNum(row.latest_count_qty)})
                    </TableCell>
                    <TableCell align="right"><VarianceCell value={row.total_variance} /></TableCell>
                    <TableCell align="right"><ValueCell value={net} /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={9} sx={{ p: 0, borderBottom: isOpen ? undefined : "unset" }}>
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <ExpandedEvents row={row} />
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Box>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={rowCount}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>
    </Layout>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ color: color || "text.primary" }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  );
}
