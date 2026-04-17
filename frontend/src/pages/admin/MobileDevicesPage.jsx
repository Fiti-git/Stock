import { useEffect, useMemo, useRef, useState } from "react";
import {
  Stack, TextField, MenuItem, InputAdornment, Typography, Chip, Box,
} from "@mui/material";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import SearchIcon from "@mui/icons-material/Search";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getOutlets } from "../../api/outlets";
import { getMobileDevices } from "../../api/dashboard";

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
      field: "last_seen_at", headerName: "Last Seen", width: 140,
      valueGetter: (v) => formatRelative(v),
    },
    {
      field: "first_seen_at", headerName: "First Seen", width: 170,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—",
    },
  ], []);

  const totals = useMemo(() => ({
    devices: rows.length,
    counts: rows.reduce((a, r) => a + (r.total_counts || 0), 0),
    assigns: rows.reduce((a, r) => a + (r.total_assigns || 0), 0),
  }), [rows]);

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

      <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">Devices</Typography>
          <Typography variant="h6">{totals.devices}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Total counts</Typography>
          <Typography variant="h6">{totals.counts}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Total barcode assigns</Typography>
          <Typography variant="h6">{totals.assigns}</Typography>
        </Box>
      </Stack>

      <TextField
        fullWidth size="small"
        placeholder="Search UUID, user, or outlet…"
        value={query} onChange={onSearchChange}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        sx={{ mb: 2 }}
      />

      <DataTable
        rows={rows}
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
