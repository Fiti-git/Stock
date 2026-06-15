import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Grid, Card, CardContent, CardActionArea, Typography, TextField, Stack, Chip,
  Alert, LinearProgress, Skeleton, Divider, Tooltip,
} from "@mui/material";
import GridViewIcon from "@mui/icons-material/GridView";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import StorefrontIcon from "@mui/icons-material/Storefront";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { getAllOutletsOverview } from "../../api/uploads";
import { useOutlet } from "../../contexts/OutletContext";
import { useAuth } from "../../contexts/AuthContext";

const todayStr = () => new Date().toLocaleDateString("en-CA");

function relativeTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Severity score — higher = needs more attention.
// 4 = missing POS, 3 = no session at all (despite POS), 2 = pending counts, 1 = open variances, 0 = healthy.
function scoreOutlet(o) {
  if (!o.uploaded) return 4;
  if (!o.session_status) return 3;
  if (o.counts_submitted > 0) return 2;
  if (o.open_variances > 0) return 1;
  return 0;
}

const SEVERITY_TONE = {
  4: { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", label: "POS missing" },
  3: { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", label: "No session" },
  2: { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", label: "Pending counts" },
  1: { color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", label: "Open variances" },
  0: { color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", label: "Healthy" },
};

function OutletCard({ outlet, onClick, loading }) {
  if (loading) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
        <CardContent>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="rectangular" height={6} sx={{ my: 1.5 }} />
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="40%" />
        </CardContent>
      </Card>
    );
  }
  const sev = scoreOutlet(outlet);
  const tone = SEVERITY_TONE[sev];
  const pct = outlet.count_pct ?? 0;
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        height: "100%",
        borderLeft: `4px solid ${tone.color}`,
        bgcolor: tone.bg,
        transition: "transform 160ms ease, box-shadow 160ms ease",
        "&:hover": { transform: "translateY(-2px)", boxShadow: `0 12px 28px -12px ${tone.color}55` },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ height: "100%", display: "block" }}>
        <CardContent sx={{ p: 2 }}>
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2, color: "#0f172a" }} noWrap>
                {outlet.outlet_name}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace" }}>
                {outlet.short_code}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={tone.label}
              sx={{
                bgcolor: "#fff", color: tone.color, border: `1px solid ${tone.border}`,
                fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.04em",
                height: 22, flexShrink: 0,
              }}
            />
          </Stack>

          {/* POS row */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
            {outlet.uploaded ? (
              <CheckCircleIcon sx={{ fontSize: 18, color: "#22c55e" }} />
            ) : (
              <CancelIcon sx={{ fontSize: 18, color: "#ef4444" }} />
            )}
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              POS {outlet.uploaded ? "uploaded" : "missing"}
            </Typography>
            {outlet.uploaded && (
              <Typography variant="caption" sx={{ color: "text.secondary", ml: "auto" }}>
                {outlet.total_rows?.toLocaleString?.()} rows · {new Date(outlet.uploaded_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </Typography>
            )}
          </Stack>

          <Divider sx={{ mb: 1.25 }} />

          {/* Count progress */}
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: "0.06em" }}>
              STOCK COUNT
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "#0f172a" }}>
              {pct}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, pct)}
            color={pct >= 100 ? "success" : pct > 0 ? "primary" : "inherit"}
            sx={{ height: 6, borderRadius: 1, mb: 0.75, bgcolor: "rgba(15,23,42,0.08)" }}
          />
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
            {outlet.items_counted_today.toLocaleString()} of {outlet.total_items?.toLocaleString?.() || 0} items
            {outlet.session_status && (
              <Box component="span" sx={{ ml: 0.75, color: outlet.session_status === "open" ? "#f59e0b" : "#22c55e", fontWeight: 700 }}>
                · session {outlet.session_status}
              </Box>
            )}
          </Typography>

          {/* Bottom row: pending + variances + last activity */}
          <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, flexWrap: "wrap" }}>
            {outlet.counts_submitted > 0 && (
              <Tooltip title="Counts awaiting manager approval">
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <HourglassBottomIcon sx={{ fontSize: 14, color: "#f59e0b" }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "#f59e0b" }}>
                    {outlet.counts_submitted} pending
                  </Typography>
                </Stack>
              </Tooltip>
            )}
            {outlet.open_variances > 0 && (
              <Tooltip title="Unresolved variance records (across all sessions)">
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <WarningAmberIcon sx={{ fontSize: 14, color: "#ef4444" }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "#ef4444" }}>
                    {outlet.open_variances} variances
                  </Typography>
                </Stack>
              </Tooltip>
            )}
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: "auto" }}>
              <AccessTimeIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {relativeTime(outlet.last_activity)}
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function OutletsOverviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setSelectedOutlet } = useOutlet();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    getAllOutletsOverview(date)
      .then((r) => setData(r.data))
      .catch(() => setError("Failed to load overview."))
      .finally(() => setLoading(false));
  }, [date]);

  const sorted = useMemo(() => {
    if (!data?.outlets) return [];
    return [...data.outlets].sort((a, b) => {
      const sa = scoreOutlet(a);
      const sb = scoreOutlet(b);
      if (sa !== sb) return sb - sa;
      return (a.outlet_name || "").localeCompare(b.outlet_name || "");
    });
  }, [data]);

  const openOutlet = (o) => {
    setSelectedOutlet({ id: o.outlet_id, name: o.outlet_name });
    const role = user?.role;
    if (role === "admin" || role === "super_admin") navigate("/admin/dashboard");
    else navigate("/dashboard");
  };

  return (
    <Layout>
      <PageHeader
        title="Outlets Overview"
        subtitle="Cross-outlet operational snapshot — POS uploads, count progress and variances at a glance"
        icon={<GridViewIcon />}
        actions={
          <TextField
            size="small" type="date" label="Date"
            InputLabelProps={{ shrink: true }}
            value={date}
            inputProps={{ max: todayStr() }}
            onChange={(e) => setDate(e.target.value)}
          />
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary strip */}
      <Card variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
        <CardContent sx={{ py: 1.5 }}>
          <Stack direction="row" spacing={{ xs: 2, md: 4 }} flexWrap="wrap" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <StorefrontIcon sx={{ fontSize: 18, color: "text.secondary" }} />
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1, letterSpacing: "0.08em" }}>OUTLETS</Typography>
                <Typography sx={{ fontWeight: 800 }}>{data?.total_outlets ?? "—"}</Typography>
              </Box>
            </Stack>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1, letterSpacing: "0.08em" }}>POS UPLOADED</Typography>
              <Typography sx={{ fontWeight: 800, color: "#22c55e" }}>{data?.uploaded_count ?? "—"}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1, letterSpacing: "0.08em" }}>MISSING</Typography>
              <Typography sx={{ fontWeight: 800, color: "#ef4444" }}>{data?.missing_count ?? "—"}</Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1, letterSpacing: "0.08em" }}>PENDING COUNTS</Typography>
              <Typography sx={{ fontWeight: 800, color: "#f59e0b" }}>{data?.outlets_with_pending_counts ?? "—"} outlets</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1, letterSpacing: "0.08em" }}>OPEN VARIANCES</Typography>
              <Typography sx={{ fontWeight: 800, color: "#ef4444" }}>{data?.outlets_with_open_variances ?? "—"} outlets</Typography>
            </Box>
            <Box sx={{ ml: "auto" }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Sorted by needs attention first · click a card to open that outlet
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Cards */}
      <Grid container spacing={2}>
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Grid key={i} item xs={12} sm={6} md={4} lg={3}>
                <OutletCard loading />
              </Grid>
            ))
          : sorted.map((o) => (
              <Grid key={o.outlet_id} item xs={12} sm={6} md={4} lg={3}>
                <OutletCard outlet={o} onClick={() => openOutlet(o)} />
              </Grid>
            ))}
      </Grid>
    </Layout>
  );
}
