import { useEffect, useState } from "react";
import {
  Stack, TextField, Button, Chip, InputAdornment, Box, Typography,
  FormControlLabel, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Collapse, LinearProgress, TablePagination, Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import GavelIcon from "@mui/icons-material/Gavel";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { useOutlet } from "../../contexts/OutletContext";
import { useAuth } from "../../contexts/AuthContext";
import { getRealLoss, downloadRealLossCsv } from "../../api/dashboard";

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
const daysAgoIso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

function VarianceCell({ value }) {
  if (value == null) return <span style={{ color: "#aaa" }}>—</span>;
  const v = Number(value || 0);
  if (Math.abs(v) < 0.001) return <span style={{ color: "#888" }}>0</span>;
  return (
    <span style={{ color: v < 0 ? "#c62828" : "#2e7d32", fontWeight: 600 }}>
      {v > 0 ? "+" : ""}{fmtNum(v)}
    </span>
  );
}
function ValueCell({ value }) {
  if (value == null) return <span style={{ color: "#aaa" }}>—</span>;
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
          {row.cost_source === "item" && (
            <span style={{ color: "#c07a00", fontStyle: "italic" }}>
              {" (item master — snapshot had no cost)"}
            </span>
          )}
        </span>
      </Typography>
      {row.events_computable < row.counts_in_range && (
        <Typography variant="caption" sx={{ color: "#c07a00", display: "block", mb: 1 }}>
          {row.counts_in_range - row.events_computable} of {row.counts_in_range} counts lack a frozen anchor POS snapshot — reconciliation skipped for those rows.
        </Typography>
      )}
      <Table size="small" sx={{ bgcolor: "#fff", borderRadius: 1 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Counted</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Anchor POS</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>GRN</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Sales</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Ret.</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Damg</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Off.</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>RTS</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Ver.±</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Expected</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Real var.</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Value</TableCell>
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
              <TableCell align="right">
                {e.anchor_qty == null
                  ? <span style={{ color: "#aaa" }}>—</span>
                  : (
                    <Tooltip title={`Snapshot ${e.anchor_date}`}>
                      <span>{fmtNum(e.anchor_qty)}</span>
                    </Tooltip>
                  )}
              </TableCell>
              <TableCell align="right" sx={{ color: e.grn ? "success.main" : "text.disabled" }}>{fmtNum(e.grn)}</TableCell>
              <TableCell align="right" sx={{ color: e.sales ? "error.main" : "text.disabled" }}>{fmtNum(e.sales)}</TableCell>
              <TableCell align="right" sx={{ color: e.returns ? "success.main" : "text.disabled" }}>{fmtNum(e.returns)}</TableCell>
              <TableCell align="right" sx={{ color: e.damage ? "error.main" : "text.disabled" }}>{fmtNum(e.damage)}</TableCell>
              <TableCell align="right" sx={{ color: e.office ? "error.main" : "text.disabled" }}>{fmtNum(e.office)}</TableCell>
              <TableCell align="right" sx={{ color: e.rts ? "error.main" : "text.disabled" }}>{fmtNum(e.rts)}</TableCell>
              <TableCell align="right" sx={{ color: "text.secondary" }}>{fmtNum(e.verification)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {e.expected == null ? <span style={{ color: "#aaa" }}>—</span> : fmtNum(e.expected)}
              </TableCell>
              <TableCell align="right"><VarianceCell value={e.real_variance} /></TableCell>
              <TableCell align="right"><ValueCell value={e.real_value} /></TableCell>
              <TableCell sx={{ color: "text.secondary" }}>{e.counter || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function RealLossPage() {
  const notify = useNotify();
  const { outletId: ctxOutletId } = useOutlet();
  const { user } = useAuth();
  const outletId = ctxOutletId || user?.outlet_id || null;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [q, setQ] = useState("");
  const [onlyVariance, setOnlyVariance] = useState(false);
  const [allOutlets, setAllOutlets] = useState(false);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [csvSaving, setCsvSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [rowCount, setRowCount] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());

  async function load() {
    if (!allOutlets && !outletId) {
      setLoading(false); setRows([]); setRowCount(0);
      return;
    }
    setLoading(true);
    try {
      const { data } = await getRealLoss({
        outletId: allOutlets ? undefined : outletId,
        allOutlets, from, to,
        q: q.trim() || undefined,
        onlyVariance,
        page: page + 1, pageSize,
      });
      setRows(data.results || []);
      setRowCount(data.count ?? 0);
      setSummary(data.summary || null);
    } catch (err) {
      notify.error(err?.response?.data?.detail || "Failed to load Real Loss report.");
      setRows([]); setRowCount(0);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q, onlyVariance, from, to, outletId, allOutlets, page, pageSize]);

  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line
  }, [q, onlyVariance, from, to, outletId, allOutlets]);

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
      const { data } = await downloadRealLossCsv({
        outletId: allOutlets ? undefined : outletId,
        allOutlets, from, to,
        q: q.trim() || undefined,
        onlyVariance,
      });
      downloadBlob(data, `real-loss-${from}-to-${to}.csv`);
    } catch { notify.error("CSV export failed."); }
    finally { setCsvSaving(false); }
  };

  const totalCols = allOutlets ? 13 : 12;

  return (
    <Layout>
      <PageHeader
        title="Real Loss"
        subtitle="Full stock reconciliation — counted vs (anchor snapshot + all signed transactions between snapshot and count). Unexplained variance = real shrinkage or missing uploads."
        icon={<GavelIcon />}
        actions={
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadCsv} disabled={csvSaving}>
            {csvSaving ? "Preparing…" : "CSV"}
          </Button>
        }
      />

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
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
        {isAdmin && (
          <FormControlLabel
            control={<Switch checked={allOutlets} onChange={(e) => setAllOutlets(e.target.checked)} />}
            label="All outlets"
          />
        )}
      </Stack>

      {summary && (
        <Box sx={{ mb: 2, display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Stat label="Items" value={fmtNum(summary.items_counted)} />
          <Stat label="Count events" value={fmtNum(summary.total_events)}
            sub={summary.events_computable < summary.total_events ? `${summary.events_computable} computable` : "all computable"}
          />
          <Stat label="Latest POS snapshot" value={summary.latest_pos_snapshot_date || "—"} />
          <Stat
            label="Real net value"
            value={
              summary.real_net_value == null ? "—"
              : `${summary.real_net_value >= 0 ? "+" : ""}${fmtMoney(summary.real_net_value)}`
            }
            color={summary.real_net_value < 0 ? "error.main" : "success.main"}
            sub="Losses & surpluses net"
          />
          <Stat label="Real loss (gross)" value={fmtMoney(summary.real_loss)} color="error.main" sub="Loss events only" />
          <Stat label="Real surplus (gross)" value={`+${fmtMoney(summary.real_surplus)}`} color="success.main" sub="Surplus events only" />
          <Stat label="Days" value={summary.range_days} />
        </Box>
      )}

      <TableContainer component={Paper} variant="outlined">
        {loading && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: "#f8fafc" }}>
              <TableCell sx={{ width: 40 }} />
              {allOutlets && <TableCell sx={{ fontWeight: 700 }}>Outlet</TableCell>}
              <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Counts</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Counted SUM</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Expected SUM</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Real var. SUM</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Real net value</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                <Tooltip title="Real loss (loss events summed) / Real surplus (surplus events summed). Does not net.">
                  <span style={{ borderBottom: "1px dotted #999" }}>Gross ↓ / ↑</span>
                </Tooltip>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Sales</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>GRN</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={totalCols} sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>
                  No counts in this range
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const rowKey = `${row.outlet_id ?? "x"}:${row.item_id}`;
              const isOpen = expanded.has(rowKey);
              return (
                <Box key={rowKey} sx={{ display: "contents" }}>
                  <TableRow hover sx={{ "& > *": { borderBottom: "unset" } }}>
                    <TableCell>
                      <IconButton size="small" onClick={() => toggleRow(rowKey)}>
                        {isOpen ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                      </IconButton>
                    </TableCell>
                    {allOutlets && (
                      <TableCell sx={{ fontSize: "0.82rem", color: "text.secondary" }}>
                        {row.outlet_name || "—"}
                      </TableCell>
                    )}
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{row.item_code}</TableCell>
                    <TableCell>{row.item_name}</TableCell>
                    <TableCell align="right"><strong>{row.counts_in_range}</strong></TableCell>
                    <TableCell align="right">{fmtNum(row.counted_sum)}</TableCell>
                    <TableCell align="right">
                      {row.expected_sum == null
                        ? <span style={{ color: "#aaa" }}>—</span>
                        : (
                          <Tooltip title={
                            row.events_computable < row.counts_in_range
                              ? `Over ${row.events_computable} of ${row.counts_in_range} counts with anchor snapshot.`
                              : "Over all counts"
                          }>
                            <span
                              style={{
                                color: row.events_computable < row.counts_in_range ? "#c07a00" : "inherit",
                                borderBottom: row.events_computable < row.counts_in_range ? "1px dashed #c07a00" : "none",
                              }}
                            >
                              {fmtNum(row.expected_sum)}
                              {row.events_computable < row.counts_in_range && (
                                <span style={{ fontSize: "0.72rem", marginLeft: 4 }}>
                                  ({row.events_computable}/{row.counts_in_range})
                                </span>
                              )}
                            </span>
                          </Tooltip>
                        )}
                    </TableCell>
                    <TableCell align="right"><VarianceCell value={row.real_variance_sum} /></TableCell>
                    <TableCell align="right"><ValueCell value={row.real_net_value} /></TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Real loss ${fmtMoney(row.real_loss)} / Real surplus +${fmtMoney(row.real_surplus)}`}>
                        <span style={{ fontSize: "0.75rem", color: "#666" }}>
                          {fmtMoney(row.real_loss)} / +{fmtMoney(row.real_surplus)}
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right" sx={{ color: row.sales_sum ? "error.main" : "text.disabled" }}>
                      {fmtNum(row.sales_sum)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: row.grn_sum ? "success.main" : "text.disabled" }}>
                      {fmtNum(row.grn_sum)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={totalCols} sx={{ p: 0, borderBottom: isOpen ? undefined : "unset" }}>
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
      <Typography variant="h6" sx={{ color: color || "text.primary", lineHeight: 1.2 }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  );
}
