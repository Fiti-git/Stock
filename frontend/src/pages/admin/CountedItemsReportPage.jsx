import { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, Typography, Tabs, Tab, Box, Alert, Chip,
} from "@mui/material";
import ChecklistIcon from "@mui/icons-material/Checklist";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useOutlet } from "../../contexts/OutletContext";
import { getCountedItemsReport } from "../../api/dashboard";

const fmtMoney = (v) => v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (v) => v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const isoToday = () => new Date().toISOString().slice(0, 10);

function daysBetween(fromISO, toRef) {
  if (!fromISO) return null;
  const a = new Date(fromISO);
  const b = new Date(toRef);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

export default function CountedItemsReportPage() {
  const { outletId } = useOutlet();
  const [fromDate, setFromDate] = useState(isoDaysAgo(7));
  const [toDate, setToDate] = useState(isoToday());
  const [tab, setTab] = useState(0);
  const [data, setData] = useState({ counted_items: [], uncounted_items: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!outletId) { setData({ counted_items: [], uncounted_items: [] }); return; }
    setLoading(true);
    setError(null);
    getCountedItemsReport({ outletId, fromDate, toDate })
      .then(({ data }) => setData(data))
      .catch(() => { setError("Could not load report."); setData({ counted_items: [], uncounted_items: [] }); })
      .finally(() => setLoading(false));
  }, [outletId, fromDate, toDate]);

  const countedRows = useMemo(
    () => (data.counted_items || []).map((r) => ({
      id: r.item_id,
      ...r,
      days_since_count: daysBetween(r.last_counted_date, toDate),
    })),
    [data.counted_items, toDate],
  );
  const uncountedRows = useMemo(
    () => (data.uncounted_items || []).map((r) => ({ id: r.item_id, ...r })),
    [data.uncounted_items],
  );

  const countedCols = useMemo(() => [
    { field: "item_code", headerName: "Code", width: 120 },
    { field: "item_name", headerName: "Item", flex: 1.6, minWidth: 220 },
    { field: "category", headerName: "Category", flex: 1, minWidth: 140 },
    { field: "last_counted_date", headerName: "Last Counted", width: 140 },
    {
      field: "days_since_count", headerName: "Days Ago", type: "number", width: 110,
      renderCell: (p) => {
        if (p.value == null) return "—";
        const color = p.value <= 1 ? "success" : p.value <= 7 ? "warning" : "error";
        return <Chip size="small" color={color} variant="outlined" label={p.value} />;
      },
    },
    { field: "total_counted_qty", headerName: "Counted Qty", type: "number", width: 130, valueFormatter: fmtQty },
    { field: "count_entries", headerName: "Entries", type: "number", width: 90 },
    { field: "cost_price", headerName: "Cost", type: "number", width: 100, valueFormatter: fmtMoney },
    { field: "selling_price", headerName: "Sell", type: "number", width: 100, valueFormatter: fmtMoney },
    { field: "pos_qty", headerName: "POS Qty", type: "number", width: 110, valueFormatter: fmtQty },
  ], []);

  const uncountedCols = useMemo(() => [
    { field: "item_code", headerName: "Code", width: 120 },
    { field: "item_name", headerName: "Item", flex: 1.8, minWidth: 240 },
    { field: "category", headerName: "Category", flex: 1, minWidth: 140 },
    { field: "cost_price", headerName: "Cost", type: "number", width: 110, valueFormatter: fmtMoney },
    { field: "selling_price", headerName: "Sell", type: "number", width: 110, valueFormatter: fmtMoney },
    { field: "pos_qty", headerName: "POS Qty", type: "number", width: 110, valueFormatter: fmtQty },
  ], []);

  return (
    <Layout>
      <PageHeader
        title="Counted vs Uncounted"
        subtitle="Per-outlet item coverage over a date range — counted items with last counted date, and items not counted at all"
        icon={<ChecklistIcon />}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small" type="date" label="From"
              InputLabelProps={{ shrink: true }}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <TextField
              size="small" type="date" label="To"
              InputLabelProps={{ shrink: true }}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </Stack>
        }
      />

      {!outletId && <Alert severity="info" sx={{ mb: 2 }}>Pick an outlet from the header switcher to view coverage.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label={
            <Stack direction="row" spacing={1} alignItems="center">
              <span>Counted</span>
              <Chip size="small" color="success" variant="outlined" label={countedRows.length} />
            </Stack>
          } />
          <Tab label={
            <Stack direction="row" spacing={1} alignItems="center">
              <span>Not Counted</span>
              <Chip size="small" color="error" variant="outlined" label={uncountedRows.length} />
            </Stack>
          } />
        </Tabs>
      </Box>

      {tab === 0 && (
        <DataTable
          rows={countedRows}
          columns={countedCols}
          loading={loading}
          emptyText={outletId ? "No items counted in this date range" : "Select an outlet"}
          height={620}
          initialPageSize={50}
          pageSizeOptions={[25, 50, 100]}
        />
      )}
      {tab === 1 && (
        <DataTable
          rows={uncountedRows}
          columns={uncountedCols}
          loading={loading}
          emptyText={outletId ? "All outlet items were counted in this range 🎉" : "Select an outlet"}
          height={620}
          initialPageSize={50}
          pageSizeOptions={[25, 50, 100]}
        />
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
        Cost and selling price come from the latest POS snapshot on or before the &ldquo;To&rdquo; date.
      </Typography>
    </Layout>
  );
}
