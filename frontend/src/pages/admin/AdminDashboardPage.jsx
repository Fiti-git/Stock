import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Box, Grid, Card, CardContent, Typography, Stack, LinearProgress, Chip,
  Button, TextField, Skeleton, InputAdornment,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SearchIcon from "@mui/icons-material/Search";
import StorefrontIcon from "@mui/icons-material/Storefront";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import HubIcon from "@mui/icons-material/Hub";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, StatCard } from "../../components/ui";
import { getAdminSummary, getVariances, getAlerts, getCountProgress } from "../../api/dashboard";
import { getMappingStats } from "../../api/orgCatalog";
import { getStockAgeSummary } from "../../api/stockAge";
import { useOutlet } from "../../contexts/OutletContext";

function VarianceCell({ v }) {
  if (v === null || v === undefined) return <span style={{ opacity: 0.4 }}>—</span>;
  if (v < 0) return <Chip size="small" label={v} color="error" />;
  if (v > 0) return <Chip size="small" label={`+${v}`} color="success" />;
  return <Chip size="small" label="0" variant="outlined" />;
}

export default function AdminDashboardPage() {
  const { outletId, selectedOutlet } = useOutlet();
  const [summary, setSummary] = useState(null);
  const [summaryLoad, setSummaryLoad] = useState(true);
  const [varData, setVarData] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [progress, setProgress] = useState(null);
  const [outletLoading, setOutletLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [mapping, setMapping] = useState(null);
  const [ageSummary, setAgeSummary] = useState(null);

  useEffect(() => {
    setSummaryLoad(true);
    getAdminSummary().then((r) => setSummary(r.data)).catch(() => {}).finally(() => setSummaryLoad(false));
    getMappingStats().then((r) => setMapping(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    getStockAgeSummary({ outletId: outletId || undefined })
      .then((r) => setAgeSummary(r.data))
      .catch(() => setAgeSummary(null));
  }, [outletId]);

  useEffect(() => {
    if (!outletId) return;
    setOutletLoading(true);
    Promise.all([getVariances(outletId, 1, 500), getAlerts(outletId), getCountProgress(outletId)])
      .then(([v, a, p]) => { setVarData(v.data); setAlerts(a.data); setProgress(p.data); })
      .catch(() => {})
      .finally(() => setOutletLoading(false));
  }, [outletId]);

  const allRows = varData?.results ?? [];
  const filtered = allRows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.item_code?.toLowerCase().includes(q) || r.item_name?.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q);
  });

  const countPct = progress && progress.total_items > 0 ? Math.round((progress.counted / progress.total_items) * 100) : 0;

  const outletColumns = [
    { field: "outlet_name", headerName: "Outlet", flex: 1.2, minWidth: 140 },
    { field: "item_count", headerName: "Items", type: "number", flex: 0.6, minWidth: 90 },
    {
      field: "uploaded_today", headerName: "Uploaded Today", flex: 0.9, minWidth: 140,
      renderCell: (p) => p.value
        ? <Chip size="small" icon={<CheckCircleIcon />} label="Yes" color="success" variant="outlined" />
        : <Chip size="small" icon={<CancelIcon />} label="No" color="error" variant="outlined" />,
    },
    { field: "counted_today", headerName: "Counted Today", type: "number", flex: 0.8, minWidth: 120 },
    {
      field: "pending_barcodes", headerName: "Pending Barcodes", type: "number", flex: 0.9, minWidth: 140,
      renderCell: (p) => p.value > 0 ? <Chip size="small" label={p.value} color="warning" /> : <span style={{ opacity: 0.4 }}>—</span>,
    },
    {
      field: "negative_items", headerName: "Negative POS", type: "number", flex: 0.8, minWidth: 120,
      renderCell: (p) => p.value > 0 ? <Chip size="small" label={p.value} color="error" /> : <span style={{ opacity: 0.4 }}>—</span>,
    },
  ];

  const varianceColumns = [
    { field: "item_code", headerName: "Code", flex: 0.7, minWidth: 100 },
    {
      field: "item_name", headerName: "Name", flex: 1.4, minWidth: 200,
      renderCell: (p) => <Link to={`/items/${p.row.item_id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>{p.value}</Link>,
    },
    {
      field: "category", headerName: "Category", flex: 0.8, minWidth: 120,
      renderCell: (p) => p.value ? <Chip size="small" variant="outlined" label={p.value} /> : <span style={{ opacity: 0.4 }}>—</span>,
    },
    { field: "pos_qty", headerName: "POS Qty", type: "number", flex: 0.6, minWidth: 90 },
    { field: "actual_qty", headerName: "Counted", type: "number", flex: 0.6, minWidth: 90, valueGetter: (v) => v ?? null },
    {
      field: "variance", headerName: "Variance", type: "number", flex: 0.7, minWidth: 100,
      renderCell: (p) => <VarianceCell v={p.value} />,
    },
    { field: "location_tag", headerName: "Location", flex: 0.7, minWidth: 100, valueGetter: (v) => v || "—" },
    { field: "last_counted", headerName: "Last Counted", flex: 0.9, minWidth: 140, valueGetter: (v) => v || "Never" },
  ];

  return (
    <Layout>
      <PageHeader
        title="Admin Dashboard"
        subtitle={summary?.today ?? "System-wide overview"}
        icon={<DashboardIcon />}
      />

      {/* KPI cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: "Outlets", value: summary?.outlet_count ?? 0, icon: <StorefrontIcon />, color: "primary" },
          { label: "Total Items", value: (summary?.total_items ?? 0).toLocaleString(), icon: <Inventory2Icon />, color: "info" },
          { label: "Pending Barcodes", value: (summary?.total_pending_barcodes ?? 0).toLocaleString(), icon: <QrCode2Icon />, color: "warning" },
          { label: "Negative POS Today", value: (summary?.total_negative_today ?? 0).toLocaleString(), icon: <ReportProblemIcon />, color: "error" },
          { label: "Mapping Coverage", value: mapping ? `${mapping.mapped_pct}%` : "—", icon: <HubIcon />, color: "success" },
        ].map((c) => (
          <Grid key={c.label} item xs={6} md={3}>
            <StatCard label={c.label} value={c.value} icon={c.icon} color={c.color} loading={summaryLoad} />
          </Grid>
        ))}
      </Grid>

      {/* Quick links */}
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {[
          { to: "/admin/upload-approvals", label: "Upload Approvals" },
          { to: "/admin/negative-pos", label: "Negative POS Report" },
          { to: "/admin/users", label: "Manage Users" },
          { to: "/admin/audit-log", label: "Audit Log" },
        ].map((l) => (
          <Grid key={l.to} item xs={6} md={3}>
            <Button component={Link} to={l.to} variant="outlined" fullWidth>{l.label}</Button>
          </Grid>
        ))}
      </Grid>

      {/* Aging Inventory widget */}
      {ageSummary && ageSummary.rows > 0 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={2}>
              <Box>
                <Typography variant="overline" color="text.secondary">Aging Inventory (FIFO)</Typography>
                <Typography variant="h5" sx={{ mt: 0.5 }}>
                  {ageSummary.pct_over_90_by_qty}% of on-hand stock is over 90 days old
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {ageSummary.over_90_sku_count.toLocaleString()} SKU(s) with oldest lot &gt; 90d ·
                  Value on hand: {ageSummary.total_value.toLocaleString()} ·
                  {ageSummary.last_built_at
                    ? ` Last built ${new Date(ageSummary.last_built_at).toLocaleString()}`
                    : ""}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip size="small" label={`0–30d: ${ageSummary.buckets["0_30"].toLocaleString()}`} />
                <Chip size="small" label={`31–60d: ${ageSummary.buckets["31_60"].toLocaleString()}`} color="info" variant="outlined" />
                <Chip size="small" label={`61–90d: ${ageSummary.buckets["61_90"].toLocaleString()}`} color="warning" variant="outlined" />
                <Chip size="small" label={`90+d: ${ageSummary.buckets["90_plus"].toLocaleString()}`} color="error" variant="outlined" />
                <Button component={Link} to="/admin/stock-age" variant="outlined" size="small">View</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Outlet status table */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="h4" gutterBottom>Outlet Status — Today</Typography>
          <Typography variant="caption" color="text.secondary">{summary?.outlet_count ?? 0} outlets</Typography>
        </CardContent>
        <Box sx={{ px: 2, pb: 2 }}>
          {summaryLoad ? (
            <Stack spacing={1} sx={{ p: 2 }}>{[...Array(4)].map((_, i) => <Skeleton key={i} height={40} />)}</Stack>
          ) : (
            <DataTable
              rows={summary?.outlets ?? []}
              columns={outletColumns}
              getRowId={(r) => r.outlet_id}
              toolbar={false}
              height={340}
              initialPageSize={10}
              pageSizeOptions={[10, 25, 50]}
              emptyText="No outlet data."
            />
          )}
        </Box>
      </Card>

      {/* Selected outlet detail */}
      <Typography variant="h4" sx={{ mb: 0.5 }}>{selectedOutlet?.name ?? "—"} · Outlet Detail</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        Switch outlet using the selector in the top bar.
      </Typography>

      {outletLoading ? (
        <Skeleton height={80} sx={{ mb: 2 }} />
      ) : progress && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="overline" color="text.secondary">Count Progress</Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{countPct}%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={countPct} color={countPct === 100 ? "success" : "primary"} />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                  {progress.counted} of {progress.total_items} items
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Stack spacing={1}>
              {alerts && !progress.has_upload_today && <Chip icon={<ReportProblemIcon />} label="No XLS uploaded today" color="warning" variant="outlined" />}
              {alerts?.missing_uploads?.length > 0 && <Chip label={`${alerts.missing_uploads.length} missing upload day(s)`} color="warning" variant="outlined" />}
              {alerts?.pending_barcodes > 0 && <Chip label={`${alerts.pending_barcodes} pending barcode(s)`} color="info" variant="outlined" />}
              {alerts?.negative_items?.length > 0 && <Chip label={`${alerts.negative_items.length} negative POS item(s)`} color="error" variant="outlined" />}
              {alerts && progress.has_upload_today && !alerts.missing_uploads?.length && !alerts.pending_barcodes && !alerts.negative_items?.length && (
                <Chip icon={<CheckCircleIcon />} label="All good — no alerts" color="success" variant="outlined" />
              )}
            </Stack>
          </Grid>
        </Grid>
      )}

      <Card variant="outlined">
        <CardContent sx={{ pb: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={2}>
            <Box>
              <Typography variant="h4">Variance Report</Typography>
              {varData && (
                <Typography variant="caption" color="text.secondary">
                  Snapshot: <b>{varData.snapshot_date}</b> · {filtered.length} of {allRows.length} items{search ? " (filtered)" : ""}
                </Typography>
              )}
            </Box>
            <TextField
              placeholder="Search item…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ minWidth: { sm: 260 } }}
            />
          </Stack>
        </CardContent>
        <Box sx={{ px: 2, pb: 2 }}>
          <DataTable
            rows={filtered}
            columns={varianceColumns}
            getRowId={(r) => r.item_id}
            loading={outletLoading}
            emptyText={!outletId ? "Select an outlet to view variances." : "No variance data yet."}
            toolbar={false}
            height={520}
          />
        </Box>
      </Card>
    </Layout>
  );
}
