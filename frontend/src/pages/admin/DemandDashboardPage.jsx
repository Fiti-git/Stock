import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, MenuItem, Typography, Paper, Alert,
} from "@mui/material";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getDemand, getDemandSummary } from "../../api/orgCatalog";
import { getOutlets } from "../../api/outlets";
import { getCategoryOptions } from "../../api/categories";

export default function DemandDashboardPage() {
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [rowCount, setRowCount] = useState(0);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [outletId, setOutletId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [summary, setSummary] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => setQApplied(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getDemand({
        q: qApplied || undefined,
        outletId: outletId || undefined,
        categoryId: categoryId || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });
      setRows((data.rows || []).map((r, idx) => ({ id: `${r.master_product_id}-${r.outlet_id}-${idx}`, ...r })));
      setRowCount(data.count ?? 0);
    } catch {
      notify.error("Failed to load demand snapshot.");
    } finally {
      setLoading(false);
    }
    // `notify` changes identity every render — excluding it prevents a refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qApplied, outletId, categoryId, paginationModel]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    (async () => {
      try {
        const [os, cs, s] = await Promise.all([
          getOutlets(), getCategoryOptions(), getDemandSummary(),
        ]);
        setOutlets(Array.isArray(os.data) ? os.data : os.data.outlets || []);
        setCategories(cs.data.categories || []);
        setSummary(s.data);
      } catch { /* ignore */ }
    })();
  }, []);

  const columns = [
    { field: "master_code", headerName: "Code", width: 140 },
    { field: "master_name", headerName: "Master Product", flex: 1, minWidth: 220 },
    { field: "outlet_name", headerName: "Outlet", width: 140 },
    { field: "avg_daily_qty_7d", headerName: "Avg/day (7d)", width: 120, type: "number" },
    { field: "avg_daily_qty_30d", headerName: "Avg/day (30d)", width: 130, type: "number" },
    { field: "avg_daily_qty_90d", headerName: "Avg/day (90d)", width: 130, type: "number" },
    { field: "total_qty_30d", headerName: "Sold (30d)", width: 120, type: "number" },
    { field: "last_sale_date", headerName: "Last Sale", width: 120 },
    { field: "category_name", headerName: "Category", width: 140 },
  ];

  const needsBuild = summary && summary.rows === 0;

  return (
    <Layout>
      <PageHeader
        title="Demand Dashboard"
        subtitle="Sales velocity per Master Product × Outlet (nightly snapshot)"
        icon={<QueryStatsIcon />}
      />

      {needsBuild && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No demand snapshot yet. Run{" "}
          <code>docker-compose exec backend python manage.py build_demand_snapshot</code>{" "}
          after mapping items, then refresh this page.
        </Alert>
      )}

      {summary && summary.last_built_at && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={4}>
            <Box label="Rows" value={summary.rows.toLocaleString()} />
            <Box label="30-day total qty" value={summary.total_qty_30d.toLocaleString()} />
            <Box label="Last built" value={new Date(summary.last_built_at).toLocaleString()} />
          </Stack>
        </Paper>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small" placeholder="Search master code or name…"
          value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 280 }}
        />
        <TextField
          select size="small" sx={{ minWidth: 180 }} label="Outlet"
          value={outletId} onChange={(e) => setOutletId(e.target.value)}
        >
          <MenuItem value="">All outlets</MenuItem>
          {outlets.map((o) => <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" sx={{ minWidth: 180 }} label="Category"
          value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
        >
          <MenuItem value="">All categories</MenuItem>
          {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
      </Stack>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText="No demand rows"
        paginationMode="server"
        rowCount={rowCount}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100, 200]}
      />
    </Layout>
  );
}

function Box({ label, value }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6">{value}</Typography>
    </div>
  );
}
