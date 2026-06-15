import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box, Grid, Card, CardContent, CardActionArea, Typography, Stack, LinearProgress, Chip,
  TextField, InputAdornment, Skeleton, Button, Avatar, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SearchIcon from "@mui/icons-material/Search";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ChecklistIcon from "@mui/icons-material/Checklist";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import RuleIcon from "@mui/icons-material/Rule";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, StatCard } from "../../components/ui";
import {
  getCountProgress, getVariances, getAlerts,
  listCountSessions, listVarianceRecords,
  getCoverageByDay, getDailyCounts,
} from "../../api/dashboard";
import { getUploadedSheets } from "../../api/uploads";
import { useOutlet } from "../../contexts/OutletContext";

const TODAY = () => new Date().toISOString().slice(0, 10);

// Status palette used by step cards. "ok"/"warn"/"err"/"todo"/"prog".
const STATUS_PRESET = {
  ok:   { color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", Icon: CheckCircleIcon, label: "Done" },
  warn: { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", Icon: WarningAmberIcon, label: "Action" },
  err:  { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", Icon: ErrorOutlineIcon, label: "Missing" },
  todo: { color: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", Icon: HourglassEmptyIcon, label: "Not yet" },
  prog: { color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", Icon: ChecklistIcon, label: "In progress" },
};

function StepCard({ index, title, blurb, status, headline, sub, ctaLabel, ctaTo, ctaDisabled, loading, Icon }) {
  const preset = STATUS_PRESET[status] || STATUS_PRESET.todo;
  const StatusIcon = preset.Icon;
  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        border: `1px solid ${preset.border}`,
        borderRadius: 2.5,
        background: `linear-gradient(180deg, ${preset.bg} 0%, #fff 80%)`,
        transition: "transform 180ms ease, box-shadow 180ms ease",
        "&:hover": { transform: "translateY(-2px)", boxShadow: `0 16px 32px -16px ${preset.color}55` },
      }}
    >
      <Box sx={{ p: 2.25, display: "flex", flexDirection: "column", height: "100%" }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Avatar
            variant="rounded"
            sx={{
              width: 40, height: 40, flexShrink: 0,
              bgcolor: "#fff",
              color: preset.color,
              border: `1px solid ${preset.border}`,
              fontWeight: 800,
              fontSize: "0.9rem",
            }}
          >
            {index}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              {Icon && <Icon sx={{ fontSize: 16, color: preset.color }} />}
              <Typography sx={{ fontSize: "0.74rem", fontWeight: 700, color: "rgba(15,23,42,0.55)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {title}
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.75rem", color: "rgba(15,23,42,0.55)", mt: 0.25, lineHeight: 1.35 }}>
              {blurb}
            </Typography>
          </Box>
          <Chip
            size="small"
            icon={<StatusIcon sx={{ fontSize: 14, color: `${preset.color} !important` }} />}
            label={preset.label}
            sx={{
              height: 22, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em",
              bgcolor: "#fff", color: preset.color, border: `1px solid ${preset.border}`,
              flexShrink: 0,
            }}
          />
        </Stack>

        <Box sx={{ mt: 2, mb: 1.5 }}>
          {loading ? (
            <Skeleton variant="text" sx={{ width: "60%", height: 32 }} />
          ) : (
            <>
              <Typography sx={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
                {headline}
              </Typography>
              {sub && (
                <Typography sx={{ fontSize: "0.75rem", color: "rgba(15,23,42,0.5)", mt: 0.5 }}>
                  {sub}
                </Typography>
              )}
            </>
          )}
        </Box>

        <Box sx={{ flex: 1 }} />

        <Button
          fullWidth
          size="small"
          variant={status === "ok" ? "outlined" : "contained"}
          disabled={ctaDisabled}
          component={ctaDisabled ? "button" : RouterLink}
          to={ctaDisabled ? undefined : ctaTo}
          endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
          sx={{
            fontWeight: 700,
            fontSize: "0.78rem",
            ...(status === "ok"
              ? { color: preset.color, borderColor: preset.border, "&:hover": { borderColor: preset.color, bgcolor: preset.bg } }
              : { bgcolor: preset.color, boxShadow: "none", "&:hover": { bgcolor: preset.color, filter: "brightness(0.92)", boxShadow: "none" } }),
          }}
        >
          {ctaLabel}
        </Button>
      </Box>
    </Card>
  );
}

function VarianceCell({ v }) {
  if (v === null || v === undefined) return <span style={{ opacity: 0.4 }}>—</span>;
  if (v < 0) return <Chip size="small" label={v} color="error" />;
  if (v > 0) return <Chip size="small" label={`+${v}`} color="success" />;
  return <Chip size="small" label="0" variant="outlined" />;
}

function SectionHeader({ overline, title, action }) {
  return (
    <Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={{ mt: 4, mb: 1.5 }}>
      <Box>
        <Typography sx={{ fontSize: "0.7rem", fontWeight: 800, color: "rgba(15,23,42,0.5)", textTransform: "uppercase", letterSpacing: "0.16em" }}>
          {overline}
        </Typography>
        <Typography sx={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", mt: 0.5 }}>
          {title}
        </Typography>
      </Box>
      {action}
    </Stack>
  );
}

export default function DashboardPage() {
  const { outletId, selectedOutlet } = useOutlet();
  const navigate = useNavigate();

  const [progress, setProgress] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [lastSnapshot, setLastSnapshot] = useState(null);
  const [openCountSession, setOpenCountSession] = useState(null);
  const [openVariancesCount, setOpenVariancesCount] = useState(null);
  const [varData, setVarData] = useState(null);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [varLoading, setVarLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  // "Today's count progress" → drill-in dialog. Picks a date and shows the
  // items counted on that date for the active outlet.
  const [progressDlgOpen, setProgressDlgOpen] = useState(false);
  const [progressDate, setProgressDate] = useState(TODAY());
  const [progressSearch, setProgressSearch] = useState("");
  const [progressItems, setProgressItems] = useState({ results: [], count: 0 });
  const [progressItemsLoading, setProgressItemsLoading] = useState(false);

  useEffect(() => {
    if (!progressDlgOpen) return;
    setProgressItemsLoading(true);
    getDailyCounts({
      outletId,
      dateFrom: progressDate,
      dateTo: progressDate,
      search: progressSearch || undefined,
      page: 1,
      pageSize: 100,
    })
      .then((r) => setProgressItems(r.data || { results: [], count: 0 }))
      .catch(() => setProgressItems({ results: [], count: 0 }))
      .finally(() => setProgressItemsLoading(false));
  }, [progressDlgOpen, progressDate, progressSearch, outletId]);

  // Daily coverage panel — last 14 days. Independent of step data so a
  // slow query doesn't block the workflow cards.
  useEffect(() => {
    setCoverageLoading(true);
    getCoverageByDay(outletId)
      .then((r) => setCoverage(r.data))
      .catch(() => setCoverage(null))
      .finally(() => setCoverageLoading(false));
  }, [outletId]);

  // Step data — single Promise.all so the workflow cards animate in together.
  useEffect(() => {
    setStepsLoading(true);
    Promise.all([
      getCountProgress(outletId).then((r) => r.data).catch(() => null),
      getAlerts(outletId).then((r) => r.data).catch(() => null),
      getUploadedSheets({ pipeline: "pos", page: 1, page_size: 1, ...(outletId ? { outlet_id: outletId } : {}) })
        .then((r) => r.data?.results?.[0] ?? null).catch(() => null),
      listCountSessions({ ...(outletId ? { outlet: outletId } : {}), status: "open", page_size: 1 })
        .then((r) => r.data?.results?.[0] ?? r.data?.[0] ?? null).catch(() => null),
      listVarianceRecords({ ...(outletId ? { outlet: outletId } : {}), status: "open", page_size: 1 })
        .then((r) => r.data?.count ?? r.data?.results?.length ?? 0).catch(() => 0),
    ]).then(([p, a, snap, sess, vCount]) => {
      setProgress(p);
      setAlerts(a);
      setLastSnapshot(snap);
      setOpenCountSession(sess);
      setOpenVariancesCount(vCount);
    }).finally(() => setStepsLoading(false));
  }, [outletId]);

  // Variance report (table at the bottom).
  useEffect(() => {
    setVarLoading(true);
    getVariances(outletId, 1, 500)
      .then((r) => setVarData(r.data))
      .catch(() => setVarData(null))
      .finally(() => setVarLoading(false));
  }, [outletId]);

  // ─── Derive step states ───────────────────────────────────────────────────
  const today = TODAY();
  const snapshotIsToday = lastSnapshot?.business_date === today;

  const step1 = useMemo(() => {
    if (snapshotIsToday) {
      return {
        status: "ok",
        headline: "Uploaded today",
        sub: lastSnapshot?.uploaded_at
          ? `at ${new Date(lastSnapshot.uploaded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${lastSnapshot?.uploaded_by ?? "—"}`
          : "—",
        ctaLabel: "View uploads",
        ctaTo: "/uploaded-sheets?pipeline=pos",
      };
    }
    if (lastSnapshot) {
      return {
        status: "err",
        headline: "Not uploaded yet",
        sub: `Last upload was on ${lastSnapshot.business_date}`,
        ctaLabel: "Upload now",
        ctaTo: "/upload",
      };
    }
    return {
      status: "err",
      headline: "No POS upload yet",
      sub: "Upload today's stock-balance XLS to start the day.",
      ctaLabel: "Upload now",
      ctaTo: "/upload",
    };
  }, [snapshotIsToday, lastSnapshot]);

  const pendingCount = alerts?.pending_barcodes ?? 0;
  const step2 = useMemo(() => {
    if (pendingCount === 0) {
      return {
        status: "ok",
        headline: "Nothing pending",
        sub: "All new / changed items have been reviewed.",
        ctaLabel: "Open review",
        ctaTo: "/dashboard/pending",
      };
    }
    return {
      status: "warn",
      headline: `${pendingCount} item${pendingCount === 1 ? "" : "s"} to review`,
      sub: "New barcodes or product changes are waiting.",
      ctaLabel: "Review pending",
      ctaTo: "/dashboard/pending",
    };
  }, [pendingCount]);

  const counted = progress?.counted ?? 0;
  const totalItems = progress?.total_items ?? 0;
  const countPct = totalItems > 0 ? Math.round((counted / totalItems) * 100) : 0;
  const step3 = useMemo(() => {
    if (totalItems === 0) {
      return {
        status: "todo",
        headline: "No items to count",
        sub: "Upload a POS snapshot first.",
        ctaLabel: "Go to upload",
        ctaTo: "/transactions",
      };
    }
    if (countPct === 0) {
      return {
        status: "todo",
        headline: "Not started",
        sub: `${totalItems.toLocaleString()} items in this outlet`,
        ctaLabel: openCountSession ? "Open session" : "Start count",
        ctaTo: openCountSession ? `/count-sessions/${openCountSession.id}` : "/count-sessions",
      };
    }
    if (countPct === 100) {
      return {
        status: "ok",
        headline: "100% counted",
        sub: `${counted.toLocaleString()} of ${totalItems.toLocaleString()} items`,
        ctaLabel: "View sessions",
        ctaTo: "/count-sessions",
      };
    }
    return {
      status: "prog",
      headline: `${countPct}% counted`,
      sub: `${counted.toLocaleString()} of ${totalItems.toLocaleString()} items`,
      ctaLabel: openCountSession ? "Continue session" : "View sessions",
      ctaTo: openCountSession ? `/count-sessions/${openCountSession.id}` : "/count-sessions",
    };
  }, [totalItems, countPct, counted, openCountSession]);

  const step4 = useMemo(() => {
    if (openVariancesCount === null) {
      return { status: "todo", headline: "—", sub: "Loading…", ctaLabel: "Open sessions", ctaTo: "/count-sessions" };
    }
    if (openVariancesCount === 0) {
      return {
        status: "ok",
        headline: "Nothing to reconcile",
        sub: "No open variances right now.",
        ctaLabel: "Open sessions",
        ctaTo: "/count-sessions",
      };
    }
    return {
      status: "warn",
      headline: `${openVariancesCount} variance${openVariancesCount === 1 ? "" : "s"} open`,
      sub: "Explain, adjust or write off each line.",
      ctaLabel: "Review variances",
      ctaTo: "/count-sessions",
    };
  }, [openVariancesCount]);

  // Overall: everything green?
  const allDone =
    step1.status === "ok" && step2.status === "ok" &&
    step3.status === "ok" && step4.status === "ok";

  // ─── Variance table (existing) ────────────────────────────────────────────
  const allRows = varData?.results ?? [];
  const filtered = allRows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.item_code?.toLowerCase().includes(q) || r.item_name?.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q);
  });

  const negativePosCount = alerts?.negative_items?.length ?? 0;

  const columns = [
    { field: "item_code", headerName: "Code", flex: 0.7, minWidth: 100 },
    {
      field: "item_name", headerName: "Name", flex: 1.4, minWidth: 200,
      renderCell: (p) => <RouterLink to={`/items/${p.row.item_id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>{p.value}</RouterLink>,
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
      <PageHeader
        title="Manager Dashboard"
        subtitle={`${selectedOutlet?.name ?? ""}${selectedOutlet ? " · " : ""}${today}`}
        icon={<DashboardIcon />}
      />

      {/* ─── A. Workflow steps ─────────────────────────────────────────────── */}
      <SectionHeader
        overline="Today · A → Z"
        title="Daily workflow"
        action={
          allDone && !stepsLoading ? (
            <Chip
              icon={<CheckCircleIcon sx={{ color: "#22c55e !important" }} />}
              label="All steps complete"
              sx={{ fontWeight: 700, color: "#15803d", bgcolor: "#f0fdf4", border: "1px solid #bbf7d0" }}
            />
          ) : null
        }
      />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StepCard index={1} title="POS Snapshot" blurb="Today's stock-balance XLS"
            Icon={UploadFileIcon} loading={stepsLoading} {...step1} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StepCard index={2} title="New / Changed Items" blurb="Barcodes + product changes"
            Icon={QrCode2Icon} loading={stepsLoading} {...step2} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StepCard index={3} title="Stock Count" blurb="Physical counts vs POS"
            Icon={FactCheckIcon} loading={stepsLoading} {...step3} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StepCard index={4} title="Variances" blurb="Explain or write-off mismatches"
            Icon={RuleIcon} loading={stepsLoading} {...step4} />
        </Grid>
      </Grid>

      {/* Today's count progress — clickable. Tap to drill into the date and
          see which items were counted that day. */}
      {!stepsLoading && totalItems > 0 && (
        <Card variant="outlined" sx={{ mt: 3, borderRadius: 2 }}>
          <CardActionArea
            onClick={() => {
              setProgressDate(TODAY());
              setProgressSearch("");
              setProgressDlgOpen(true);
            }}
          >
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="overline" color="text.secondary">Today's count progress</Typography>
                  <VisibilityIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </Stack>
                <Typography variant="subtitle2" fontWeight={700}>{countPct}%</Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={countPct}
                color={countPct === 100 ? "success" : "primary"}
                sx={{ height: 8, borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                {counted.toLocaleString()} of {totalItems.toLocaleString()} items · tap to view items by date
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      )}

      {/* Items counted on a chosen date — popup */}
      <Dialog open={progressDlgOpen} onClose={() => setProgressDlgOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          Items counted
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
            {progressItems.count?.toLocaleString?.() || 0} count{progressItems.count === 1 ? "" : "s"} on {progressDate}
            {coverage?.outlet_name ? ` · ${coverage.outlet_name}` : ""}
          </Typography>
          <IconButton
            onClick={() => setProgressDlgOpen(false)}
            sx={{ position: "absolute", right: 8, top: 8 }}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
            <TextField
              size="small" type="date" label="Date"
              InputLabelProps={{ shrink: true }}
              value={progressDate}
              onChange={(e) => setProgressDate(e.target.value)}
              sx={{ width: 180 }}
            />
            <TextField
              size="small" fullWidth label="Search" placeholder="Item code or name…"
              value={progressSearch}
              onChange={(e) => setProgressSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          </Stack>
          {progressItemsLoading ? (
            <Skeleton variant="rectangular" height={240} />
          ) : progressItems.results.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary", py: 4, textAlign: "center" }}>
              No items counted on this date.
            </Typography>
          ) : (
            <TableContainer sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Item code</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Item name</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Counted</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>POS qty</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Counter</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.secondary" }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {progressItems.results.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ fontSize: "0.82rem", fontFamily: "monospace" }}>{r.item_code}</TableCell>
                      <TableCell sx={{ fontSize: "0.82rem" }}>{r.item_name}</TableCell>
                      <TableCell align="right" sx={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        {Number(r.actual_qty).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: "0.82rem", color: r.pos_qty_at_count == null ? "text.disabled" : "text.primary" }}>
                        {r.pos_qty_at_count == null ? "—" : Number(r.pos_qty_at_count).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.82rem" }}>{r.counted_by_username || "—"}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={r.approval_status}
                          color={r.approval_status === "approved" ? "success" : r.approval_status === "submitted" ? "warning" : r.approval_status === "rejected" ? "error" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressDlgOpen(false)} sx={{ textTransform: "none" }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Daily count coverage — last 14 days */}
      <Card variant="outlined" sx={{ mt: 3, borderRadius: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
                Daily count coverage · last 14 days
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                {coverage?.total_items?.toLocaleString() || "—"} items in this outlet
              </Typography>
            </Box>
            {coverage?.outlet_name && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{coverage.outlet_name}</Typography>
            )}
          </Stack>

          {coverageLoading ? (
            <Skeleton variant="rectangular" height={180} />
          ) : !coverage || coverage.days.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary", py: 2 }}>
              No coverage data yet.
            </Typography>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${coverage.days.length}, minmax(60px, 1fr))`, gap: 1 }}>
                {coverage.days.map((d) => {
                  const pct = Math.min(100, d.pct || 0);
                  const tone =
                    pct === 0 ? "#e2e8f0" :
                    pct < 25 ? "#fca5a5" :
                    pct < 60 ? "#fde68a" :
                    pct < 100 ? "#86efac" : "#22c55e";
                  return (
                    <Box
                      key={d.date}
                      sx={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5,
                      }}
                    >
                      <Box sx={{ width: "100%", height: 80, bgcolor: "#f1f5f9", borderRadius: 1, position: "relative", overflow: "hidden" }}>
                        <Box
                          sx={{
                            position: "absolute", bottom: 0, left: 0, right: 0,
                            height: `${pct}%`,
                            bgcolor: tone,
                            transition: "height 240ms ease",
                          }}
                        />
                      </Box>
                      <Typography sx={{ fontSize: "0.66rem", fontWeight: 700, color: "rgba(15,23,42,0.85)" }}>
                        {d.pct?.toFixed?.(0) ?? 0}%
                      </Typography>
                      <Typography sx={{ fontSize: "0.62rem", color: "rgba(15,23,42,0.5)", textAlign: "center", lineHeight: 1.2 }}>
                        {d.date.slice(5)}<br />
                        <Box component="span" sx={{ fontWeight: 700, color: "rgba(15,23,42,0.7)" }}>
                          {d.items_counted.toLocaleString()}
                        </Box>
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
              <Stack direction="row" spacing={2} justifyContent="space-between" sx={{ mt: 1.5, flexWrap: "wrap" }}>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Bars show distinct items counted that day · numbers under each bar are the day's item count.
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: "#fca5a5" }} />
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>&lt;25%</Typography>
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: "#fde68a" }} />
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>&lt;60%</Typography>
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: "#86efac" }} />
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>&lt;100%</Typography>
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: "#22c55e" }} />
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>100%</Typography>
                </Stack>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ─── B. At-a-glance metrics ───────────────────────────────────────── */}
      <SectionHeader overline="At a glance" title="Outlet health right now" />
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatCard label="Items in outlet" value={totalItems.toLocaleString()} icon={<Inventory2Icon />} color="primary" loading={stepsLoading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Counted today" value={counted.toLocaleString()} icon={<ChecklistIcon />} color={countPct === 100 ? "success" : "info"} loading={stepsLoading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Pending barcodes" value={pendingCount.toLocaleString()} icon={<QrCode2Icon />} color={pendingCount > 0 ? "warning" : "success"} loading={stepsLoading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Negative POS items" value={negativePosCount.toLocaleString()} icon={<ReportProblemIcon />} color={negativePosCount > 0 ? "error" : "success"} loading={stepsLoading} />
        </Grid>
      </Grid>

      {alerts?.missing_uploads?.length > 0 && (
        <Card variant="outlined" sx={{ mt: 3, borderColor: "#fde68a", bgcolor: "#fffbeb", borderRadius: 2 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <WarningAmberIcon sx={{ color: "#f59e0b" }} />
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: "0.88rem", color: "#92400e" }}>
                  Missing uploads in the last 7 days
                </Typography>
                <Typography sx={{ fontSize: "0.78rem", color: "rgba(146,64,14,0.85)" }}>
                  {alerts.missing_uploads.join(", ")}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

    </Layout>
  );
}
