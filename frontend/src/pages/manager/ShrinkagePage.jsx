import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Card, CardContent, Typography, Grid, Stack, TextField, Button,
  ToggleButton, ToggleButtonGroup, Alert, Box, Chip, useTheme,
} from "@mui/material";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, StatCard } from "../../components/ui";
import { getShrinkage } from "../../api/analytics";
import { useOutlet } from "../../contexts/OutletContext";

const todayStr = () => new Date().toLocaleDateString("en-CA");
const weeksAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n * 7); return d.toLocaleDateString("en-CA"); };

export default function ShrinkagePage() {
  const theme = useTheme();
  const { outletId } = useOutlet();
  const [period, setPeriod] = useState("weekly");
  const [from, setFrom] = useState(weeksAgo(4));
  const [to, setTo] = useState(todayStr());
  const [category, setCategory] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    getShrinkage({ outletId, period, from, to, category: category || undefined })
      .then(({ data }) => setData(data))
      .catch(() => setError("Failed to load shrinkage data."))
      .finally(() => setLoading(false));
  }, [outletId, period, from, to, category]);

  const periods = data?.periods ?? [];
  const summary = data?.summary;
  const topItemsMap = {};
  periods.forEach((p) => p.top_items?.forEach((item) => {
    if (!topItemsMap[item.item_code]) topItemsMap[item.item_code] = { ...item };
    else { topItemsMap[item.item_code].shrinkage_qty += item.shrinkage_qty; topItemsMap[item.item_code].shrinkage_value += item.shrinkage_value; }
  }));
  const topItems = Object.values(topItemsMap).sort((a, b) => b.shrinkage_qty - a.shrinkage_qty).slice(0, 10);

  const columns = [
    { field: "item_code", headerName: "Code", flex: 0.7, minWidth: 110 },
    { field: "item_name", headerName: "Name", flex: 1.6, minWidth: 200 },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 120, valueGetter: (v) => v || "—" },
    {
      field: "shrinkage_qty", headerName: "Shrinkage Qty", type: "number", flex: 0.7, minWidth: 120,
      renderCell: (p) => <Box sx={{ color: p.value > 0 ? "error.main" : "success.main", fontWeight: 600 }}>
        {p.value > 0 ? "+" : ""}{p.value.toFixed(2)}
      </Box>,
    },
    {
      field: "shrinkage_value", headerName: "Shrinkage Value", type: "number", flex: 0.8, minWidth: 140,
      renderCell: (p) => <Box sx={{ color: p.value > 0 ? "error.main" : "success.main" }}>
        Rs {Number(p.value).toLocaleString("en-LK", { maximumFractionDigits: 0 })}
      </Box>,
    },
  ];

  return (
    <Layout>
      <PageHeader title="Shrinkage Analytics" subtitle="Track missing inventory over time" icon={<TrendingDownIcon />} />

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-end" }} flexWrap="wrap">
            <ToggleButtonGroup value={period} exclusive size="small" onChange={(_, v) => v && setPeriod(v)}>
              <ToggleButton value="weekly">Weekly</ToggleButton>
              <ToggleButton value="monthly">Monthly</ToggleButton>
            </ToggleButtonGroup>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
            <TextField size="small" label="Category" placeholder="All" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ width: 160 }} />
            <Stack direction="row" spacing={0.5}>
              {[4, 8, 12].map((w) => (
                <Button key={w} size="small" variant="outlined" onClick={() => { setFrom(weeksAgo(w)); setTo(todayStr()); }}>{w}W</Button>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}><StatCard label="Total Shrinkage Qty" value={summary.total_shrinkage_qty.toFixed(2)} /></Grid>
          <Grid item xs={12} md={4}><StatCard label="Total Shrinkage Value" value={`Rs ${Number(summary.total_shrinkage_value).toLocaleString("en-LK", { maximumFractionDigits: 0 })}`} /></Grid>
          <Grid item xs={12} md={4}><StatCard label="Worst Category" value={summary.worst_category ?? "—"} /></Grid>
        </Grid>
      )}

      {!loading && periods.length === 0 ? (
        <Alert severity="info">No count data found for the selected range. Enter physical counts first.</Alert>
      ) : (
        <>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h4" gutterBottom>Shrinkage Quantity Over Time</Typography>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={periods} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} />
                  <YAxis tick={{ fontSize: 11, fill: theme.palette.text.secondary }} />
                  <Tooltip contentStyle={{ fontSize: 12, background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }} />
                  <Line type="monotone" dataKey="total_shrinkage_qty" stroke={theme.palette.primary.main} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h4" gutterBottom>Shrinkage Value Over Time (Rs)</Typography>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={periods} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} />
                  <YAxis tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ fontSize: 12, background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }} />
                  <Bar dataKey="total_shrinkage_value" fill={theme.palette.primary.dark} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {topItems.length > 0 && (
            <Card variant="outlined">
              <CardContent sx={{ pb: 1 }}>
                <Typography variant="h4">Top Shrinkage Items</Typography>
                <Typography variant="caption" color="text.secondary">Aggregated across selected period</Typography>
              </CardContent>
              <Box sx={{ px: 2, pb: 2 }}>
                <DataTable rows={topItems} columns={columns} getRowId={(r) => r.item_code} toolbar={false} height={480} initialPageSize={10} />
              </Box>
            </Card>
          )}
        </>
      )}
    </Layout>
  );
}
