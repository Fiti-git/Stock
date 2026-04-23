import { useEffect, useMemo, useRef, useState } from "react";
import {
  Stack, TextField, MenuItem, InputAdornment, Typography, Chip, Box, Paper,
  Divider, Grid,
} from "@mui/material";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import SearchIcon from "@mui/icons-material/Search";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getOutlets } from "../../api/outlets";
import { getMobileDevices } from "../../api/dashboard";

const DAY = 24 * 60 * 60 * 1000;

function formatRelative(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY));
}

function shortUuid(u) {
  if (!u) return "—";
  return u.length > 14 ? `${u.slice(0, 6)}…${u.slice(-4)}` : u;
}

export default function MobileDevicesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [query, setQuery] = useState("");
  const searchTimer = useRef(null);

  useEffect(() => {
    getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
  }, []);

  const fetch = (q, o) => {
    setLoading(true);
    getMobileDevices({ q, outletId: o || null })
      .then(({ data }) => setRows(data.results || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch("", ""); }, []);
  useEffect(() => { fetch(query.trim(), outletId); /* eslint-disable-next-line */ }, [outletId]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetch(v.trim(), outletId), 300);
  };

  const enrichedRows = useMemo(() => rows.map((r) => {
    const firstDays = daysSince(r.first_seen_at);
    const lastDays = daysSince(r.last_seen_at);
    const age = firstDays != null ? Math.max(1, firstDays) : null;
    const countsPerDay = age && r.total_counts ? r.total_counts / age : 0;
    let status = "inactive";
    if (lastDays != null) {
      if (lastDays <= 1) status = "active";
      else if (lastDays <= 7) status = "recent";
      else if (lastDays <= 30) status = "idle";
    }
    return {
      id: r.id,
      ...r,
      days_since_last_seen: lastDays,
      counts_per_day: countsPerDay,
      status,
    };
  }), [rows]);

  const columns = useMemo(() => [
    {
      field: "device_uuid", headerName: "Device UUID", flex: 1.3, minWidth: 280,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>{p.value}</Typography>
      ),
    },
    {
      field: "platform", headerName: "Platform", width: 100,
      renderCell: (p) => p.value
        ? <Chip size="small" label={p.value} variant="outlined" />
        : "—",
    },
    { field: "app_version", headerName: "App", width: 90, valueGetter: (v) => v || "—" },
    { field: "last_user_username", headerName: "Last User", width: 140, valueGetter: (v) => v || "—" },
    { field: "last_outlet_name", headerName: "Last Outlet", flex: 0.8, minWidth: 140, valueGetter: (v) => v || "—" },
    { field: "total_counts", headerName: "Counts", type: "number", width: 100 },
    { field: "total_assigns", headerName: "Barcode Assigns", type: "number", width: 140 },
    {
      field: "counts_per_day", headerName: "Counts / day", type: "number", width: 120,
      valueFormatter: (v) => v == null || v === 0 ? "—" : Number(v).toFixed(2),
    },
    {
      field: "status", headerName: "Status", width: 100,
      renderCell: (p) => {
        const map = {
          active: { color: "success", label: "Active" },
          recent: { color: "info", label: "Recent" },
          idle: { color: "warning", label: "Idle" },
          inactive: { color: "error", label: "Stale" },
        };
        const cfg = map[p.value] || map.inactive;
        return <Chip size="small" color={cfg.color} variant="outlined" label={cfg.label} />;
      },
    },
    {
      field: "days_since_last_seen", headerName: "Days Since", type: "number", width: 110,
      valueFormatter: (v) => v == null ? "—" : v,
    },
    {
      field: "last_seen_at", headerName: "Last Seen", width: 140,
      valueGetter: (v) => formatRelative(v),
    },
    {
      field: "first_seen_at", headerName: "First Seen", width: 170,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—",
    },
  ], []);

  const summary = useMemo(() => {
    const n = enrichedRows.length;
    const active = enrichedRows.filter((r) => r.status === "active").length;
    const recent = enrichedRows.filter((r) => r.status === "recent").length;
    const idle = enrichedRows.filter((r) => r.status === "idle").length;
    const stale = enrichedRows.filter((r) => r.status === "inactive").length;
    const counts = enrichedRows.reduce((a, r) => a + (r.total_counts || 0), 0);
    const assigns = enrichedRows.reduce((a, r) => a + (r.total_assigns || 0), 0);
    const avgCounts = n ? counts / n : 0;

    const top = [...enrichedRows]
      .filter((r) => r.total_counts > 0)
      .sort((a, b) => b.total_counts - a.total_counts)
      .slice(0, 5);

    const byUser = {};
    for (const r of enrichedRows) {
      const k = r.last_user_username || "—";
      byUser[k] = (byUser[k] || 0) + (r.total_counts || 0);
    }
    const topUsers = Object.entries(byUser)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { n, active, recent, idle, stale, counts, assigns, avgCounts, top, topUsers };
  }, [enrichedRows]);

  return (
    <Layout>
      <PageHeader
        title="Mobile Devices"
        subtitle="Every mobile-app install that has interacted with the system"
        icon={<PhoneAndroidIcon />}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small" select label="Outlet" value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All outlets</MenuItem>
              {outlets.map((o) => (
                <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
              ))}
            </TextField>
          </Stack>
        }
      />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">Activity</Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              <KpiCell label="Devices" value={summary.n} />
              <KpiCell label="Active (≤1d)" value={summary.active} color="success.main" />
              <KpiCell label="Recent (≤7d)" value={summary.recent} color="info.main" />
              <KpiCell label="Idle (≤30d)" value={summary.idle} color="warning.main" />
              <KpiCell label="Stale (>30d)" value={summary.stale} color="error.main" />
              <KpiCell label="Avg counts/device" value={summary.avgCounts.toFixed(1)} />
              <KpiCell label="Total counts" value={summary.counts} />
              <KpiCell label="Total assigns" value={summary.assigns} />
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">Top devices (counts)</Typography>
            <Divider sx={{ my: 1 }} />
            {summary.top.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No counts yet.</Typography>
            ) : summary.top.map((d) => (
              <Stack key={d.id} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {shortUuid(d.device_uuid)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {d.last_user_username || "—"} · {d.last_outlet_name || "—"}
                  </Typography>
                </Box>
                <Chip size="small" color="primary" variant="outlined" label={d.total_counts} />
              </Stack>
            ))}
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">Top users (counts)</Typography>
            <Divider sx={{ my: 1 }} />
            {summary.topUsers.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No counts yet.</Typography>
            ) : summary.topUsers.map(([u, c]) => (
              <Stack key={u} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                <Typography variant="body2">{u}</Typography>
                <Chip size="small" color="success" variant="outlined" label={c} />
              </Stack>
            ))}
          </Paper>
        </Grid>
      </Grid>

      <TextField
        fullWidth size="small"
        placeholder="Search UUID, user, or outlet…"
        value={query} onChange={onSearchChange}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        sx={{ mb: 2 }}
      />

      <DataTable
        rows={enrichedRows}
        columns={columns}
        loading={loading}
        emptyText="No mobile devices yet"
        height={600}
        initialPageSize={50}
        pageSizeOptions={[25, 50, 100]}
      />
    </Layout>
  );
}

function KpiCell({ label, value, color = "text.primary" }) {
  return (
    <Grid item xs={6} sm={3}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>
      <Typography variant="h6" color={color}>{value}</Typography>
    </Grid>
  );
}
