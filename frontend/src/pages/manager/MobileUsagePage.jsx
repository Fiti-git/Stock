import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Stack, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, CircularProgress, Alert, IconButton, Tooltip,
  MenuItem,
} from "@mui/material";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import AppleIcon from "@mui/icons-material/Apple";
import AndroidIcon from "@mui/icons-material/Android";
import DevicesIcon from "@mui/icons-material/Devices";
import BarChartIcon from "@mui/icons-material/BarChart";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { getMobileDevices } from "../../api/dashboard";
import { getOutlets } from "../../api/outlets";
import { useAuth } from "../../contexts/AuthContext";

function StatCard({ icon: Icon, label, value, color = "#6366f1", sub }) {
  return (
    <Card elevation={0} sx={{ flex: 1, minWidth: 160, p: 2.5, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 2 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: `${color}18`, color, flexShrink: 0 }}>
          <Icon sx={{ fontSize: 20 }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: "0.78rem", color: "rgba(15,23,42,0.55)", fontWeight: 500, lineHeight: 1.2 }}>{label}</Typography>
          <Typography sx={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value ?? "—"}</Typography>
          {sub && <Typography sx={{ fontSize: "0.72rem", color: "rgba(15,23,42,0.45)", mt: 0.25 }}>{sub}</Typography>}
        </Box>
      </Stack>
    </Card>
  );
}

function PlatformIcon({ platform }) {
  const p = (platform || "").toLowerCase();
  if (p === "ios") return <AppleIcon sx={{ fontSize: 16, color: "#64748b" }} />;
  if (p === "android") return <AndroidIcon sx={{ fontSize: 16, color: "#22c55e" }} />;
  return <DevicesIcon sx={{ fontSize: 16, color: "rgba(15,23,42,0.35)" }} />;
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function MobileUsagePage() {
  const { user } = useAuth();
  const isAdmin = ["admin", "super_admin"].includes(user?.role);

  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    getOutlets().then((r) => setOutlets(r.data || [])).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getMobileDevices({ q: search, outletId: outletId || null });
      setData(res.data);
    } catch {
      setError("Failed to load mobile usage data.");
    } finally {
      setLoading(false);
    }
  }, [search, outletId]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.results || [];
  const activeRecently = rows.filter((d) => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < THIRTY_DAYS_MS).length;
  const totalCounts = rows.reduce((s, d) => s + (d.total_counts || 0), 0);
  const mostActive = rows.reduce((best, d) => (!best || d.total_counts > best.total_counts ? d : best), null);

  return (
    <Layout>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <PageHeader title="Mobile Usage" subtitle="Activity across all registered mobile devices" />
        <Tooltip title="Refresh">
          <IconButton onClick={load} disabled={loading} size="small"><RefreshIcon /></IconButton>
        </Tooltip>
      </Box>

      {/* Filters */}
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
        <Box sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
            <TextField
              size="small"
              placeholder="Search device, user, outlet…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: "rgba(15,23,42,0.4)" }} /></InputAdornment> }}
              sx={{ minWidth: 240 }}
            />
            {isAdmin && (
              <TextField select size="small" label="Outlet" value={outletId} onChange={(e) => setOutletId(e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="">All outlets</MenuItem>
                {outlets.map((o) => <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>)}
              </TextField>
            )}
          </Stack>
        </Box>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stat cards */}
      <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
        <StatCard icon={PhoneAndroidIcon} label="Total Devices" value={rows.length} color="#6366f1" sub="all time" />
        <StatCard icon={DevicesIcon} label="Active (30d)" value={activeRecently} color="#22c55e" sub="seen in last 30 days" />
        <StatCard icon={QrCodeScannerIcon} label="Total Counts" value={totalCounts.toLocaleString()} color="#3b82f6" sub="via mobile app" />
        <StatCard
          icon={BarChartIcon}
          label="Most Active"
          value={mostActive?.last_user_username || "—"}
          color="#f59e0b"
          sub={mostActive ? `${mostActive.total_counts} counts` : "no data"}
        />
      </Stack>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "#6366f1" }} />
        </Box>
      ) : rows.length === 0 ? (
        <Card elevation={0} sx={{ border: "1px solid rgba(15,23,42,0.08)", borderRadius: 2, p: 4, textAlign: "center" }}>
          <PhoneAndroidIcon sx={{ fontSize: 40, color: "rgba(15,23,42,0.2)", mb: 1 }} />
          <Typography sx={{ color: "rgba(15,23,42,0.45)", fontSize: "0.9rem" }}>No mobile devices found.</Typography>
        </Card>
      ) : (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <TableContainer component={Paper} variant="outlined" sx={{ border: 0 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "#f8fafc" }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Device</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Platform</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>App Version</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Last User</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Last Outlet</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Counts</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Assigns</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>First Seen</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Last Seen</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((d) => {
                  const isActive = d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < THIRTY_DAYS_MS;
                  return (
                    <TableRow key={d.id} hover sx={{ "&:last-child td": { border: 0 } }}>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem", color: "rgba(15,23,42,0.55)" }}>
                        {(d.device_uuid || "").slice(0, 12)}…
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <PlatformIcon platform={d.platform} />
                          <Typography sx={{ fontSize: "0.82rem" }}>{d.platform || "—"}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.82rem" }}>{d.app_version || "—"}</TableCell>
                      <TableCell sx={{ fontSize: "0.82rem", fontWeight: 600 }}>{d.last_user_username || "—"}</TableCell>
                      <TableCell sx={{ fontSize: "0.82rem" }}>{d.last_outlet_name || "—"}</TableCell>
                      <TableCell align="right" sx={{ fontSize: "0.85rem", fontWeight: 700, color: "#6366f1" }}>
                        {(d.total_counts || 0).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: "0.85rem", color: "rgba(15,23,42,0.6)" }}>
                        {(d.total_assigns || 0).toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.78rem", color: "rgba(15,23,42,0.5)", whiteSpace: "nowrap" }}>
                        {d.first_seen_at ? new Date(d.first_seen_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", whiteSpace: "nowrap" }}>
                        {timeAgo(d.last_seen_at)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={isActive ? "Active" : "Inactive"}
                          color={isActive ? "success" : "default"}
                          variant={isActive ? "filled" : "outlined"}
                          sx={{ fontSize: "0.72rem" }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Layout>
  );
}
