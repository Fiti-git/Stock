import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box, Grid, Card, CardContent, Typography, Stack, Chip, Button, Alert,
  TextField, MenuItem, LinearProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Skeleton, Tooltip,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import ChecklistIcon from "@mui/icons-material/Checklist";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PaidIcon from "@mui/icons-material/Paid";
import CategoryIcon from "@mui/icons-material/Category";
import PeopleIcon from "@mui/icons-material/People";
import TodayIcon from "@mui/icons-material/Today";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip,
  BarChart, Bar, CartesianGrid, ReferenceLine,
} from "recharts";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useOutlet } from "../../contexts/OutletContext";
import {
  getManagerSummary, getSalesShrinkageTrend, getCategoryPerformance,
  getCoverageByDay, getCounterPerformance,
} from "../../api/dashboard";

const RANGES = [
  { key: "7d",  label: "Last 7 days",  days: 7 },
  { key: "14d", label: "Last 14 days", days: 14 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "mtd", label: "Month to date" },
];

const isoOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoMonthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};
function rangeToDates(rangeKey) {
  if (rangeKey === "mtd") return { from: isoMonthStart(), to: isoToday() };
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[1];
  return { from: isoOffset(r.days - 1), to: isoToday() };
}

const fmtRs = (n) => n == null ? "—" : `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtRs2 = (n) => n == null ? "—" : `Rs ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n) => n == null ? "—" : `${Number(n).toFixed(1)}%`;
const fmtNum = (n) => n == null ? "—" : Number(n).toLocaleString();

function KpiCard({ icon, label, value, caption, tone, to }) {
  const color = tone === "danger" ? "error.main" : tone === "warn" ? "warning.main" : tone === "success" ? "success.main" : "text.primary";
  return (
    <Card
      variant="outlined"
      component={to ? RouterLink : "div"}
      to={to}
      sx={{
        height: "100%", textDecoration: "none",
        transition: "all 120ms ease",
        "&:hover": to ? { boxShadow: 3, borderColor: "primary.main" } : {},
      }}
    >
      <CardContent sx={{ py: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          {icon}
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            {label}
          </Typography>
        </Stack>
        <Typography variant="h3" sx={{ mt: 0.5, color, fontWeight: 700 }}>{value}</Typography>
        {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
      </CardContent>
    </Card>
  );
}

function AlertRow({ tone, icon, label, count, to }) {
  const bd = tone === "danger" ? "error.main" : tone === "warn" ? "warning.main" : tone === "info" ? "info.main" : "success.main";
  const bg = tone === "danger" ? "error.50" : tone === "warn" ? "warning.50" : tone === "info" ? "info.50" : "success.50";
  const isEmpty = !count;
  return (
    <Stack
      direction="row" alignItems="center" spacing={1.5}
      sx={{
        px: 1.5, py: 1.25, borderRadius: 1.5, mb: 1,
        bgcolor: isEmpty ? "action.hover" : bg,
        borderLeft: "4px solid", borderColor: isEmpty ? "grey.400" : bd,
      }}
    >
      <Box sx={{ color: isEmpty ? "text.disabled" : bd, display: "flex" }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: isEmpty ? "text.secondary" : "text.primary" }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {isEmpty ? "All clear" : `${count.toLocaleString()} to address`}
        </Typography>
      </Box>
      {!isEmpty && to && (
        <Button size="small" component={RouterLink} to={to} endIcon={<ArrowForwardIcon fontSize="small" />}>
          Go
        </Button>
      )}
    </Stack>
  );
}

function TrendPanel({ title, subtitle, data, loading, children, height = 220 }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ pb: 1 }}>
        <Typography variant="h5">{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        <Box sx={{ mt: 1, height }}>
          {loading ? <Skeleton variant="rectangular" height={height - 10} /> :
           (data && data.length > 0) ? children :
           <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
             <Typography variant="body2" color="text.secondary">Not enough data yet</Typography>
           </Stack>
          }
        </Box>
      </CardContent>
    </Card>
  );
}

const shortDate = (iso) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
};

export default function DashboardPage() {
  const { outletId, selectedOutlet } = useOutlet();
  const currentOutletId = selectedOutlet?.id ?? null;
  const [rangeKey, setRangeKey] = useState("14d");
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [category, setCategory] = useState(null);
  const [counters, setCounters] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const { from, to } = useMemo(() => rangeToDates(rangeKey), [rangeKey]);
  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label || "Range";

  useEffect(() => {
    if (!currentOutletId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      getManagerSummary({ outletId }).catch(() => ({ data: null })),
      getSalesShrinkageTrend({ outletId, from, to }).catch(() => ({ data: { days: [] } })),
      getCoverageByDay(outletId, from, to).catch(() => ({ data: { days: [] } })),
      getCategoryPerformance({ outletId, from, to }).catch(() => ({ data: { results: [] } })),
      getCounterPerformance({ outletId, dateFrom: from, dateTo: to }).catch(() => ({ data: { results: [] } })),
    ]).then(([sumRes, trRes, covRes, catRes, cntRes]) => {
      setSummary(sumRes.data);
      setTrend(trRes.data);
      setCoverage(covRes.data);
      setCategory(catRes.data);
      setCounters(cntRes.data);
    }).finally(() => setLoading(false));
  }, [outletId, currentOutletId, from, to]);

  if (!currentOutletId) {
    return (
      <Layout>
        <PageHeader title="Manager Dashboard" subtitle="Outlet performance at a glance" icon={<DashboardIcon />} />
        <Alert severity="info">Pick an outlet from the header switcher to view the dashboard.</Alert>
      </Layout>
    );
  }

  const kpi = summary?.kpi || {};
  const alerts = summary?.alerts || {};
  const uploads = kpi.uploads_today || {};
  const salesTone = kpi.sales_today > 0 ? "success" : "warn";

  const salesData = (trend?.days || []).map((d) => ({ date: shortDate(d.date), value: d.sales }));
  const shrinkData = (trend?.days || []).map((d) => ({ date: shortDate(d.date), value: d.shrinkage }));
  const coverageData = (coverage?.days || []).map((d) => ({ date: shortDate(d.date), value: d.pct }));

  return (
    <Layout>
      <PageHeader
        title="Manager Dashboard"
        subtitle={`${selectedOutlet?.name || "Outlet"} · ${summary?.today || isoToday()}`}
        icon={<DashboardIcon />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small" select value={rangeKey}
              onChange={(e) => setRangeKey(e.target.value)}
              sx={{ minWidth: 170 }}
            >
              {RANGES.map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
            </TextField>
            <Button
              variant="outlined" size="small" startIcon={<TodayIcon />}
              onClick={() => navigate("/daily-ops")}
            >
              Daily Ops
            </Button>
          </Stack>
        }
      />

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* ─── Zone 1: KPI strip ─── */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            icon={<PaidIcon fontSize="small" color="primary" />}
            label="Sales today"
            value={fmtRs(kpi.sales_today)}
            caption={kpi.sales_today > 0 ? "Actual sales for today" : "Sales not uploaded yet"}
            tone={salesTone}
            to="/uploaded-sheets?pipeline=sales"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            icon={<TrendingUpIcon fontSize="small" color="primary" />}
            label="GP % today"
            value={fmtPct(kpi.gp_pct_today)}
            caption="Approx from today's snapshot mix"
            tone={kpi.gp_pct_today != null && kpi.gp_pct_today < 10 ? "warn" : undefined}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            icon={<ChecklistIcon fontSize="small" color="primary" />}
            label="Count coverage"
            value={fmtPct(kpi.coverage_pct_today)}
            caption="Items counted today / total"
            tone={kpi.coverage_pct_today >= 80 ? "success" : kpi.coverage_pct_today >= 40 ? "warn" : "danger"}
            to="/daily-ops"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            icon={<ReportProblemIcon fontSize="small" color="primary" />}
            label="Variance today"
            value={fmtRs(kpi.variance_today)}
            caption="Rs value for counted items"
            tone={kpi.variance_today < 0 ? "danger" : undefined}
            to="/variance-reconciliation"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ py: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <UploadFileIcon fontSize="small" color="primary" />
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                  Uploads today
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }} useFlexGap>
                {Object.entries(uploads).map(([k, done]) => (
                  <Tooltip key={k} title={k.replace("_", " ")}>
                    <Chip
                      size="small"
                      label={k.toUpperCase().replace("_", " ")}
                      icon={done ? <CheckCircleIcon fontSize="small" /> : <CancelIcon fontSize="small" />}
                      color={done ? "success" : "default"}
                      variant="outlined"
                      sx={done ? {} : { opacity: 0.4 }}
                    />
                  </Tooltip>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ─── Zone 2: Alerts + Daily Ops shortcut ─── */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={7}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h5" sx={{ mb: 1.5 }}>Needs your attention</Typography>
              <AlertRow
                tone="danger" icon={<ReportProblemIcon />}
                label="Items not counted in 7+ days"
                count={alerts.uncounted_over_7d}
                to="/daily-ops"
              />
              <AlertRow
                tone="warn" icon={<TrendingDownIcon />}
                label="High-value variances (Rs 5,000+)"
                count={alerts.high_value_variances}
                to="/variance-reconciliation"
              />
              <AlertRow
                tone="info" icon={<ChecklistIcon />}
                label="Pending item reviews"
                count={alerts.pending_reviews}
                to="/dashboard/pending"
              />
              <AlertRow
                tone="warn" icon={<FactCheckIcon />}
                label="Stale count sessions (>24h open)"
                count={alerts.stale_sessions}
                to="/count-sessions"
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card
            variant="outlined"
            component={RouterLink} to="/daily-ops"
            sx={{
              height: "100%", textDecoration: "none", display: "block",
              transition: "all 120ms ease",
              "&:hover": { boxShadow: 3, borderColor: "primary.main" },
            }}
          >
            <CardContent sx={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <TodayIcon color="primary" />
                  <Typography variant="h5">Today's operations</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  POS upload, count progress, live variance preview, and device activity — all for {summary?.today || isoToday()}.
                </Typography>
              </Box>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <Chip
                  icon={uploads.pos ? <CheckCircleIcon fontSize="small" /> : <CancelIcon fontSize="small" />}
                  label={uploads.pos ? "POS uploaded" : "POS missing"}
                  size="small"
                  color={uploads.pos ? "success" : "warning"}
                  variant="outlined"
                />
                <Chip
                  icon={<ChecklistIcon fontSize="small" />}
                  label={`${kpi.coverage_pct_today ?? 0}% counted`}
                  size="small" color="primary" variant="outlined"
                />
              </Stack>
              <Button
                variant="contained" fullWidth sx={{ mt: 2 }}
                endIcon={<ArrowForwardIcon />}
              >
                Open Daily Ops
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ─── Zone 3: Trend charts ─── */}
      <Typography variant="overline" sx={{ display: "block", color: "text.secondary", mt: 1, mb: 1 }}>
        Trends · {rangeLabel}
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <TrendPanel title="Sales" subtitle="Net sales per day (Rs)" data={salesData} loading={loading}>
            <ResponsiveContainer>
              <LineChart data={salesData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <ReTooltip formatter={(v) => fmtRs(v)} />
                <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </TrendPanel>
        </Grid>
        <Grid item xs={12} md={4}>
          <TrendPanel title="Count coverage" subtitle="% of active items counted" data={coverageData} loading={loading}>
            <ResponsiveContainer>
              <LineChart data={coverageData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <ReTooltip formatter={(v) => `${v}%`} />
                <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </TrendPanel>
        </Grid>
        <Grid item xs={12} md={4}>
          <TrendPanel title="Shrinkage" subtitle="Variance value per day (Rs)" data={shrinkData} loading={loading}>
            <ResponsiveContainer>
              <BarChart data={shrinkData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <ReTooltip formatter={(v) => fmtRs(v)} />
                <ReferenceLine y={0} stroke="#000" strokeOpacity={0.3} />
                <Bar dataKey="value" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </TrendPanel>
        </Grid>
      </Grid>

      {/* ─── Zone 4/5: Category + Counters ─── */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={7}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <CategoryIcon color="primary" />
                <Typography variant="h5">Top categories · {rangeLabel}</Typography>
              </Stack>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Sales (Rs)</TableCell>
                      <TableCell align="right">Cost (Rs)</TableCell>
                      <TableCell align="right">GP %</TableCell>
                      <TableCell align="right">Variance (Rs)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading && (
                      <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Skeleton width="100%" height={20} />
                      </TableCell></TableRow>
                    )}
                    {!loading && (category?.results || []).length === 0 && (
                      <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        No sales data for this range
                      </TableCell></TableRow>
                    )}
                    {!loading && (category?.results || []).map((r) => (
                      <TableRow key={r.category} hover>
                        <TableCell>{r.category}</TableCell>
                        <TableCell align="right">{fmtNum(r.sales)}</TableCell>
                        <TableCell align="right">{fmtNum(r.cost)}</TableCell>
                        <TableCell align="right">
                          <Chip
                            size="small" variant="outlined"
                            color={r.gp_pct == null ? "default" : r.gp_pct >= 20 ? "success" : r.gp_pct >= 10 ? "warning" : "error"}
                            label={fmtPct(r.gp_pct)}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ color: r.variance_value < 0 ? "error.main" : "text.primary" }}>
                          {fmtRs2(r.variance_value)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <PeopleIcon color="primary" />
                <Typography variant="h5">Counter performance · {rangeLabel}</Typography>
              </Stack>
              {loading && <Skeleton height={200} />}
              {!loading && (counters?.results || []).length === 0 && (
                <Typography variant="body2" color="text.secondary">No count activity in this range.</Typography>
              )}
              {!loading && (counters?.results || []).slice(0, 8).map((r) => {
                const total = r.total || (r.approved || 0) + (r.submitted || 0) + (r.rejected || 0);
                const rate = total > 0 ? (r.approved || 0) / total * 100 : 0;
                return (
                  <Box key={r.username || r.user_id} sx={{ mb: 1.25 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.username || "—"}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmtNum(r.approved || 0)} approved / {fmtNum(total)}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate" value={Math.min(100, rate)}
                      sx={{ height: 6, borderRadius: 3, mt: 0.25 }}
                      color={rate >= 80 ? "success" : rate >= 50 ? "primary" : "warning"}
                    />
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}
