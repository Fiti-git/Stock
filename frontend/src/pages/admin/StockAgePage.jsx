import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, MenuItem, Typography, Paper, Alert, Button, Chip,
  IconButton, Tooltip, Box,
} from "@mui/material";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/Download";
import SyncIcon from "@mui/icons-material/Sync";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import {
  getStockAge, getStockAgeSummary, stockAgeExportUrl, recomputeStockAge,
} from "../../api/stockAge";
import { useOutlet } from "../../contexts/OutletContext";
import { getCategoryOptions } from "../../api/categories";
import api from "../../api/client";

const BUCKETS = [
  { value: "",        label: "All ages" },
  { value: "0_30",    label: "0–30 days" },
  { value: "31_60",   label: "31–60 days" },
  { value: "61_90",   label: "61–90 days" },
  { value: "90_plus", label: "90+ days" },
];

export default function StockAgePage() {
  const notify = useNotify();
  const { outletId } = useOutlet();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [rowCount, setRowCount] = useState(0);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [bucket, setBucket] = useState("");
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [recomputing, setRecomputing] = useState(false);

  // Debounce the search field so typing doesn't fire one request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQApplied(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getStockAge({
        q: qApplied || undefined,
        outletId: outletId || undefined,
        categoryId: categoryId || undefined,
        bucket: bucket || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });
      setRows(data.rows || []);
      setRowCount(data.count ?? 0);
    } catch {
      notify.error("Failed to load stock age.");
    } finally {
      setLoading(false);
    }
    // `notify` is a fresh object every render — excluding it prevents a render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qApplied, outletId, categoryId, bucket, paginationModel]);

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await getStockAgeSummary({
        outletId: outletId || undefined,
        categoryId: categoryId || undefined,
      });
      setSummary(data);
    } catch { /* ignore */ }
  }, [outletId, categoryId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    (async () => {
      try {
        const cs = await getCategoryOptions();
        setCategories(cs.data.categories || []);
      } catch { /* ignore */ }
    })();
  }, []);

  async function handleRecompute(scoped) {
    setRecomputing(true);
    try {
      const payload = scoped ? { outletId: outletId || undefined } : {};
      const { data } = await recomputeStockAge(payload);
      notify.success(`Rebuilt ${data.rebuilt_rows} rows in ${data.elapsed_ms} ms.`);
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Recompute failed.");
    } finally {
      setRecomputing(false);
    }
  }

  async function handleRecomputeRow(row) {
    setRecomputing(true);
    try {
      const { data } = await recomputeStockAge({
        outletId: row.outlet_id,
        itemCode: row.item_code,
      });
      notify.success(`Rebuilt ${data.rebuilt_rows} row(s) in ${data.elapsed_ms} ms.`);
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Recompute failed.");
    } finally {
      setRecomputing(false);
    }
  }

  async function handleExport() {
    try {
      const url = stockAgeExportUrl({
        outletId: outletId || undefined,
        bucket: bucket || undefined,
      });
      const resp = await api.get(url, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "stock_age.csv";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      notify.error("Export failed.");
    }
  }

  const needsBuild = summary && summary.rows === 0;

  const columns = [
    { field: "item_code", headerName: "Code", width: 110 },
    { field: "item_name", headerName: "Item", flex: 1, minWidth: 220 },
    { field: "outlet_name", headerName: "Outlet", width: 140 },
    {
      field: "on_hand_qty", headerName: "On Hand", type: "number", width: 100,
      valueFormatter: (v) => (typeof v === "number" ? v.toLocaleString() : v),
    },
    {
      field: "oldest_lot_age_days", headerName: "Oldest Age (d)", type: "number", width: 130,
      renderCell: (p) => {
        const v = p.value;
        let color = "default";
        if (v > 90) color = "error";
        else if (v > 60) color = "warning";
        else if (v > 30) color = "info";
        return <Chip size="small" label={`${v}d`} color={color} variant={v > 60 ? "filled" : "outlined"} />;
      },
    },
    { field: "oldest_lot_date", headerName: "Oldest Lot", width: 120 },
    {
      field: "weighted_avg_age_days", headerName: "Avg Age (d)", type: "number", width: 110,
      valueFormatter: (v) => (typeof v === "number" ? v.toFixed(1) : v),
    },
    { field: "bucket_0_30", headerName: "0–30", type: "number", width: 90 },
    { field: "bucket_31_60", headerName: "31–60", type: "number", width: 90 },
    { field: "bucket_61_90", headerName: "61–90", type: "number", width: 90 },
    { field: "bucket_90_plus", headerName: "90+", type: "number", width: 90 },
    {
      field: "unknown_age_qty", headerName: "Unknown", type: "number", width: 100,
      renderCell: (p) => p.value > 0
        ? <Tooltip title="Qty on POS that GRN history can't explain — oldest possible."><Chip size="small" label={p.value} color="warning" variant="outlined" /></Tooltip>
        : <span style={{ opacity: 0.4 }}>—</span>,
    },
    { field: "latest_pos_qty", headerName: "POS Qty", type: "number", width: 100 },
    { field: "category_name", headerName: "Category", width: 140 },
    {
      field: "actions", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => (
        <Tooltip title="Recompute this item">
          <span>
            <IconButton size="small" disabled={recomputing} onClick={() => handleRecomputeRow(p.row)}>
              <SyncIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Stock Age"
        subtitle="How long inventory has been sitting at each outlet (FIFO lot aging)"
        icon={<HourglassEmptyIcon />}
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined" size="small" startIcon={<RefreshIcon />}
              disabled={recomputing}
              onClick={() => handleRecompute(Boolean(outletId))}
            >
              Recompute {outletId ? "outlet" : "all"}
            </Button>
            <Button
              variant="contained" size="small" startIcon={<DownloadIcon />}
              onClick={handleExport}
            >
              Export CSV
            </Button>
          </Stack>
        }
      />

      {needsBuild && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No stock-age snapshot yet. Click <b>Recompute all</b> or run{" "}
          <code>python manage.py build_stock_age_snapshot</code> on the backend.
        </Alert>
      )}

      {summary && summary.rows > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={4} flexWrap="wrap">
            <Metric label="Rows" value={summary.rows.toLocaleString()} />
            <Metric label="On-hand Qty" value={summary.total_qty.toLocaleString()} />
            <Metric label="On-hand Value" value={summary.total_value.toLocaleString()} />
            <Metric label="% qty > 90d" value={`${summary.pct_over_90_by_qty}%`} />
            <Metric label="SKUs > 90d" value={summary.over_90_sku_count.toLocaleString()} />
            <Metric label="Unknown-age qty" value={summary.unknown_age_qty.toLocaleString()} />
            <Metric label="Last built" value={summary.last_built_at ? new Date(summary.last_built_at).toLocaleString() : "—"} />
          </Stack>
        </Paper>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
        <TextField
          size="small" placeholder="Search item code or name…"
          value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 280 }}
        />
        <TextField
          select size="small" sx={{ minWidth: 180 }} label="Category"
          value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
        >
          <MenuItem value="">All categories</MenuItem>
          {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" sx={{ minWidth: 160 }} label="Age Bucket"
          value={bucket} onChange={(e) => setBucket(e.target.value)}
        >
          {BUCKETS.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
        </TextField>
      </Stack>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText="No stock-age rows"
        paginationMode="server"
        rowCount={rowCount}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100, 200]}
      />
    </Layout>
  );
}

function Metric({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6">{value}</Typography>
    </Box>
  );
}
