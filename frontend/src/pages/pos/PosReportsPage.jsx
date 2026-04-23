import { useState, useEffect, useCallback } from "react";
import { Stack, TextField, MenuItem, Button, Typography, Tabs, Tab, Box } from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, StatCard } from "../../components/ui";
import { getTopSelling, getProfitReport, getTaxSummary } from "../../api/pos";

function useDateRange(days = 30) {
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return useState({ date_from: past, date_to: today });
}

function TopSelling() {
  const [range, setRange] = useDateRange(30);
  const [direction, setDirection] = useState("top");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getTopSelling({ ...range, direction, limit: 50 }); setRows(r.data.results || []); }
    finally { setLoading(false); }
  }, [range, direction]);
  useEffect(() => { load(); }, [load]);
  const cols = [
    { field: "item_code", headerName: "Code", flex: 0.6, minWidth: 100 },
    { field: "item_name", headerName: "Name", flex: 1.6, minWidth: 220 },
    { field: "qty_sold", headerName: "Qty Sold", flex: 0.5, minWidth: 90, valueGetter: (v) => Number(v).toFixed(3).replace(/\.?0+$/, "") },
    { field: "revenue", headerName: "Revenue", flex: 0.7, minWidth: 110, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "txn_count", headerName: "Bills", flex: 0.4, minWidth: 70, type: "number" },
  ];
  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={range.date_from} onChange={(e) => setRange({ ...range, date_from: e.target.value })} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={range.date_to} onChange={(e) => setRange({ ...range, date_to: e.target.value })} />
        <TextField size="small" select label="Show" value={direction} onChange={(e) => setDirection(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="top">Top selling</MenuItem>
          <MenuItem value="slow">Slow moving</MenuItem>
        </TextField>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <DataTable rows={rows} columns={cols} loading={loading} getRowId={(r) => r.item_id} height={500} emptyText="No sales in this range" />
    </Box>
  );
}

function Profit() {
  const [range, setRange] = useDateRange(7);
  const [groupBy, setGroupBy] = useState("day");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getProfitReport({ ...range, group_by: groupBy }); setData(r.data); }
    finally { setLoading(false); }
  }, [range, groupBy]);
  useEffect(() => { load(); }, [load]);
  const cols = [
    { field: "key", headerName: groupBy === "day" ? "Date" : groupBy === "item" ? "Item" : "Category", flex: 1.2, minWidth: 180 },
    { field: "revenue", headerName: "Revenue", flex: 0.7, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "cost", headerName: "Cost", flex: 0.7, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "profit", headerName: "Profit", flex: 0.7, minWidth: 100,
      renderCell: (p) => <b style={{ color: Number(p.value) >= 0 ? "#2e7d32" : "#d32f2f" }}>{Number(p.value).toFixed(2)}</b> },
    { field: "margin", headerName: "Margin %", flex: 0.5, minWidth: 90,
      valueGetter: (_, r) => Number(r.revenue) > 0 ? (Number(r.profit) / Number(r.revenue) * 100).toFixed(1) : "—" },
  ];
  const t = data?.totals || { revenue: 0, cost: 0, profit: 0 };
  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={range.date_from} onChange={(e) => setRange({ ...range, date_from: e.target.value })} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={range.date_to} onChange={(e) => setRange({ ...range, date_to: e.target.value })} />
        <TextField size="small" select label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} sx={{ minWidth: 130 }}>
          <MenuItem value="day">Day</MenuItem>
          <MenuItem value="item">Item</MenuItem>
          <MenuItem value="category">Category</MenuItem>
        </TextField>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 2, mb: 2 }}>
        <StatCard label="Revenue" value={Number(t.revenue).toFixed(2)} />
        <StatCard label="Cost" value={Number(t.cost).toFixed(2)} />
        <StatCard label="Profit" value={Number(t.profit).toFixed(2)} />
      </Box>
      <DataTable rows={data?.results ?? []} columns={cols} loading={loading} getRowId={(r) => r.key} height={500} emptyText="No data" />
    </Box>
  );
}

function Tax() {
  const [range, setRange] = useDateRange(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getTaxSummary(range); setData(r.data); }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => { load(); }, [load]);
  const cols = [
    { field: "tax_rate_pct", headerName: "Tax %", flex: 0.5, minWidth: 90, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "taxable_base", headerName: "Taxable Base", flex: 1, minWidth: 140, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "tax_amount", headerName: "Tax Amount", flex: 1, minWidth: 140, valueGetter: (v) => Number(v).toFixed(2) },
  ];
  const t = data?.totals || {};
  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={range.date_from} onChange={(e) => setRange({ ...range, date_from: e.target.value })} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={range.date_to} onChange={(e) => setRange({ ...range, date_to: e.target.value })} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2, mb: 2 }}>
        <StatCard label="Taxable base" value={Number(t.taxable_base || 0).toFixed(2)} />
        <StatCard label="Tax collected" value={Number(t.tax_amount || 0).toFixed(2)} />
      </Box>
      <DataTable rows={data?.results ?? []} columns={cols} loading={loading} getRowId={(r) => r.tax_rate_pct} height={400} emptyText="No tax activity" />
    </Box>
  );
}

export default function PosReportsPage() {
  const [tab, setTab] = useState(0);
  return (
    <Layout>
      <PageHeader title="POS Reports" subtitle="Top-selling · Profit · Tax" icon={<AssessmentIcon />} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Top / Slow" />
        <Tab label="Profit" />
        <Tab label="Tax summary" />
      </Tabs>
      {tab === 0 && <TopSelling />}
      {tab === 1 && <Profit />}
      {tab === 2 && <Tax />}
    </Layout>
  );
}
