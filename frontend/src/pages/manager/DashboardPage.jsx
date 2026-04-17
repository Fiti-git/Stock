import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Grid, Card, CardContent, Typography, Stack, TextField, LinearProgress,
  Alert, Chip, Box, InputAdornment,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SearchIcon from "@mui/icons-material/Search";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ChecklistIcon from "@mui/icons-material/Checklist";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, StatCard } from "../../components/ui";
import { getCountProgress, getVariances, getAlerts } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

function VarianceCell({ v }) {
  if (v === null || v === undefined) return <span style={{ opacity: 0.4 }}>—</span>;
  if (v < 0) return <Chip size="small" label={v} color="error" />;
  if (v > 0) return <Chip size="small" label={`+${v}`} color="success" />;
  return <Chip size="small" label="0" variant="outlined" />;
}

export default function DashboardPage() {
  const { outletId } = useOutlet();
  const [progress, setProgress] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [varData, setVarData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [varLoading, setVarLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([getCountProgress(outletId), getAlerts(outletId)])
      .then(([p, a]) => { setProgress(p.data); setAlerts(a.data); })
      .finally(() => setLoading(false));
  }, [outletId]);

  useEffect(() => {
    setVarLoading(true);
    getVariances(outletId, 1, 500).then((r) => setVarData(r.data)).finally(() => setVarLoading(false));
  }, [outletId]);

  const allRows = varData?.results ?? [];
  const filtered = allRows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.item_code?.toLowerCase().includes(q) || r.item_name?.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q);
  });

  const countPct = progress && progress.total_items > 0 ? Math.round((progress.counted / progress.total_items) * 100) : 0;

  const columns = [
    { field: "item_code", headerName: "Code", flex: 0.7, minWidth: 100 },
    {
      field: "item_name", headerName: "Name", flex: 1.4, minWidth: 200,
      renderCell: (p) => <Link to={`/items/${p.row.item_id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>{p.value}</Link>,
    },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 120, renderCell: (p) => p.value ? <Chip size="small" variant="outlined" label={p.value} /> : "—" },
    { field: "pos_qty", headerName: "POS Qty", type: "number", flex: 0.6, minWidth: 90 },
    { field: "actual_qty", headerName: "Counted", type: "number", flex: 0.6, minWidth: 90 },
    { field: "variance", headerName: "Variance", type: "number", flex: 0.7, minWidth: 100, renderCell: (p) => <VarianceCell v={p.value} /> },
    { field: "location_tag", headerName: "Location", flex: 0.7, minWidth: 100, valueGetter: (v) => v || "—" },
    { field: "last_counted", headerName: "Last Counted", flex: 0.9, minWidth: 130, valueGetter: (v) => v || "Never" },
  ];

  return (
    <Layout>
      <PageHeader title="Manager Dashboard" subtitle={progress?.today ?? "—"} icon={<DashboardIcon />} />

      {!loading && alerts && (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {!progress?.has_upload_today && (
            <Alert severity="warning" variant="outlined">
              Today's XLS has not been uploaded yet. <Link to="/upload" style={{ fontWeight: 600 }}>Upload now</Link>
            </Alert>
          )}
          {alerts.missing_uploads?.length > 0 && (
            <Alert severity="warning" variant="outlined">Missing uploads for: <b>{alerts.missing_uploads.join(", ")}</b></Alert>
          )}
          {alerts.pending_barcodes > 0 && (
            <Alert severity="info" variant="outlined">
              <b>{alerts.pending_barcodes}</b> item(s) need barcodes. <Link to="/dashboard/pending" style={{ fontWeight: 600 }}>Review now</Link>
            </Alert>
          )}
          {alerts.negative_items?.length > 0 && (
            <Alert severity="error" variant="outlined"><b>{alerts.negative_items.length}</b> item(s) have negative POS quantity today.</Alert>
          )}
          {progress?.has_upload_today && !alerts.missing_uploads?.length && !alerts.pending_barcodes && !alerts.negative_items?.length && (
            <Alert severity="success" variant="outlined">All good — upload complete, no alerts.</Alert>
          )}
        </Stack>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}><StatCard label="Items in System" value={(progress?.total_items ?? 0).toLocaleString()} icon={<Inventory2Icon />} color="primary" loading={loading} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Counted Today" value={progress?.counted ?? 0} icon={<ChecklistIcon />} color={countPct === 100 ? "success" : "info"} loading={loading} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Pending Barcodes" value={progress?.pending_barcodes ?? 0} icon={<QrCode2Icon />} color="warning" loading={loading} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Negative POS" value={alerts?.negative_items?.length ?? 0} icon={<ReportProblemIcon />} color="error" loading={loading} /></Grid>
      </Grid>

      {!loading && progress && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="overline" color="text.secondary">Today's Count Progress</Typography>
              <Typography variant="subtitle2" fontWeight={700}>{countPct}%</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={countPct} color={countPct === 100 ? "success" : "primary"} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              {progress.counted} of {progress.total_items} items counted
            </Typography>
          </CardContent>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent sx={{ pb: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={2}>
            <Box>
              <Typography variant="h4">Variance Report</Typography>
              {varData && <Typography variant="caption" color="text.secondary">Snapshot: <b>{varData.snapshot_date}</b> · {filtered.length} of {allRows.length} items</Typography>}
            </Box>
            <TextField size="small" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ minWidth: { sm: 260 } }} />
          </Stack>
        </CardContent>
        <Box sx={{ px: 2, pb: 2 }}>
          <DataTable rows={filtered} columns={columns} getRowId={(r) => r.item_id} loading={varLoading} toolbar={false} height={560} emptyText="No variance data yet" />
        </Box>
      </Card>
    </Layout>
  );
}
