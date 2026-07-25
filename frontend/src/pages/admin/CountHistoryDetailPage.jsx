import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Stack, TextField, Button, Chip, InputAdornment, Box, Typography, FormControlLabel, Switch,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import HistoryIcon from "@mui/icons-material/History";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { useOutlet } from "../../contexts/OutletContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  getCountHistoryDetail, downloadCountHistoryDetailCsv,
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

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function CountHistoryDetailPage() {
  const notify = useNotify();
  const { outletId: ctxOutletId } = useOutlet();
  const { user: authUser } = useAuth();
  const [params] = useSearchParams();

  // URL params take precedence so the "View detail" link from Count Coverage
  // opens with the same range the manager was already looking at.
  const initialFrom = params.get("from") || daysAgoIso(6);
  const initialTo = params.get("to") || todayIso();
  const outletFromUrl = params.get("outlet");

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [q, setQ] = useState("");
  const [user, setUser] = useState("");
  const [onlyVariance, setOnlyVariance] = useState(false);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [csvSaving, setCsvSaving] = useState(false);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [rowCount, setRowCount] = useState(0);
  const [sortModel, setSortModel] = useState([{ field: "count_date", sort: "desc" }]);

  // Priority: URL param (from "View detail" link) → admin's picked outlet
  // (OutletContext, only populated for admins) → non-admin user's own outlet.
  // Without the user.outlet_id fallback, managers landed on the page with
  // outletId=null and the endpoint call never fired.
  const outletId = outletFromUrl || ctxOutletId || authUser?.outlet_id || null;

  async function load() {
    if (!outletId) {
      // No outlet context yet — clear the loading spinner so the empty
      // state renders instead of a permanent skeleton.
      setLoading(false);
      setRows([]);
      setRowCount(0);
      return;
    }
    setLoading(true);
    try {
      const sort = sortModel[0];
      const { data } = await getCountHistoryDetail({
        outletId, from, to,
        q: q.trim() || undefined,
        user: user.trim() || undefined,
        onlyVariance,
        sortBy: sort?.field,
        order: sort?.sort,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });
      setRows((data.results || []).map((r) => ({ ...r, id: r.count_id })));
      setRowCount(data.count ?? 0);
      setSummary(data.summary || null);
    } catch (err) {
      notify.error(err?.response?.data?.detail || "Failed to load count history.");
      setRows([]);
      setRowCount(0);
    } finally {
      setLoading(false);
    }
  }

  // Single debounced effect covers ALL dependencies (filters + pagination +
  // sort + outletId). Prevents the two-effect race that left rows blank when
  // outletId arrived from OutletContext after first render.
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q, user, onlyVariance, from, to, outletId, paginationModel, sortModel]);

  // Reset to page 0 when filter changes (but not when pagination changes).
  useEffect(() => {
    setPaginationModel((m) => (m.page === 0 ? m : { ...m, page: 0 }));
    // eslint-disable-next-line
  }, [q, user, onlyVariance, from, to, outletId]);

  const handleDownloadCsv = async () => {
    setCsvSaving(true);
    try {
      const sort = sortModel[0];
      const { data } = await downloadCountHistoryDetailCsv({
        outletId, from, to,
        q: q.trim() || undefined,
        user: user.trim() || undefined,
        onlyVariance,
        sortBy: sort?.field,
        order: sort?.sort,
      });
      downloadBlob(data, `count-history-detail-${from}-to-${to}.csv`);
    } catch {
      notify.error("CSV export failed.");
    } finally {
      setCsvSaving(false);
    }
  };

  const columns = useMemo(() => [
    { field: "count_date", headerName: "Date", width: 110 },
    { field: "item_code", headerName: "Code", width: 130 },
    { field: "item_name", headerName: "Item", flex: 1.4, minWidth: 220 },
    {
      field: "counted_qty", headerName: "Counted", width: 110, type: "number",
      renderCell: (p) => fmtNum(p.value),
    },
    {
      field: "mypos_qty", headerName: "MyPOS qty", width: 110, type: "number",
      renderCell: (p) => fmtNum(p.value),
    },
    {
      field: "variance", headerName: "Variance", width: 110, type: "number",
      renderCell: (p) => {
        const v = Number(p.value || 0);
        if (Math.abs(v) < 0.001) return <span style={{ color: "#888" }}>0</span>;
        return (
          <span style={{ color: v < 0 ? "#c62828" : "#2e7d32", fontWeight: 600 }}>
            {v > 0 ? "+" : ""}{fmtNum(v)}
          </span>
        );
      },
    },
    {
      field: "cost_price", headerName: "Cost", width: 100, type: "number",
      renderCell: (p) => fmtMoney(p.value),
    },
    {
      field: "loss_value", headerName: "Loss / Surplus", width: 140, type: "number",
      renderCell: (p) => {
        const v = Number(p.value || 0);
        if (Math.abs(v) < 0.01) return <span style={{ color: "#888" }}>—</span>;
        return (
          <Chip
            size="small"
            label={`${v > 0 ? "+" : ""}${fmtMoney(v)}`}
            color={v < 0 ? "error" : "success"}
            variant="outlined"
          />
        );
      },
    },
    { field: "counted_by_name", headerName: "Counted by", width: 140 },
  ], []);

  return (
    <Layout>
      <PageHeader
        title="Count History Detail"
        subtitle="Every count event across the range (multiple counts of the same item show as separate rows)"
        icon={<HistoryIcon />}
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
        <TextField
          size="small" placeholder="Counter (username or id)"
          value={user} onChange={(e) => setUser(e.target.value)}
          sx={{ minWidth: 200 }}
        />
        <FormControlLabel
          control={<Switch checked={onlyVariance} onChange={(e) => setOnlyVariance(e.target.checked)} />}
          label="Only with variance"
        />
      </Stack>

      {summary && (
        <Box sx={{ mb: 2, display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Stat label="Events" value={fmtNum(summary.total_events)} />
          <Stat label="Total variance qty" value={fmtNum(summary.total_variance_qty)} />
          <Stat label="Loss value" value={fmtMoney(summary.total_loss_value)} color="error.main" />
          <Stat label="Surplus value" value={`+${fmtMoney(summary.total_surplus_value)}`} color="success.main" />
          <Stat label="Days" value={summary.range_days} />
        </Box>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText="No count events in this range"
        paginationMode="server"
        rowCount={rowCount}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100, 200]}
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={setSortModel}
      />
    </Layout>
  );
}

function Stat({ label, value, color }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ color: color || "text.primary" }}>{value}</Typography>
    </Box>
  );
}
