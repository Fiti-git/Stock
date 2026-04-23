import { useState, useEffect, useCallback } from "react";
import { Stack, TextField, Button, Typography, Paper, Box } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, StatCard } from "../../components/ui";
import { getDailyPosSales } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosDailySalesPage() {
  const { notify } = useNotification();
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(week);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDailyPosSales({ date_from: dateFrom, date_to: dateTo });
      setData(res.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load.", "error");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, notify]);

  useEffect(() => { load(); }, [load]);

  const cols = [
    { field: "date", headerName: "Date", flex: 0.6, minWidth: 110 },
    { field: "bill_count", headerName: "Bills", flex: 0.4, minWidth: 70, type: "number" },
    { field: "cash", headerName: "Cash", flex: 0.6, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "card", headerName: "Card", flex: 0.6, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "lankaqr", headerName: "LankaQR", flex: 0.6, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "other", headerName: "Other", flex: 0.6, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "total", headerName: "Total", flex: 0.7, minWidth: 110,
      renderCell: (p) => <b>{Number(p.value).toFixed(2)}</b> },
  ];

  const t = data?.totals || {};

  return (
    <Layout>
      <PageHeader title="POS Daily Sales" subtitle="Sales summary by tender" icon={<TrendingUpIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 2, mb: 2 }}>
        <StatCard label="Bills" value={t.bill_count || 0} />
        <StatCard label="Total" value={Number(t.total || 0).toFixed(2)} />
        <StatCard label="Cash" value={Number(t.cash || 0).toFixed(2)} />
        <StatCard label="Card" value={Number(t.card || 0).toFixed(2)} />
        <StatCard label="LankaQR" value={Number(t.lankaqr || 0).toFixed(2)} />
      </Box>

      <DataTable rows={data?.results ?? []} columns={cols} loading={loading} getRowId={(r) => r.date} height={500} emptyText="No sales" />
    </Layout>
  );
}
