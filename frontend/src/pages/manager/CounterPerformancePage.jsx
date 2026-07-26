import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Stack, TextField, Box, Typography, Chip, Avatar,
} from "@mui/material";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import PersonIcon from "@mui/icons-material/Person";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { useOutlet } from "../../contexts/OutletContext";
import { useAuth } from "../../contexts/AuthContext";
import { getCounterPerformance } from "../../api/dashboard";

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function approvalColor(rate) {
  if (rate >= 90) return "success";
  if (rate >= 70) return "warning";
  return "error";
}

function initialsOf(username) {
  if (!username) return "?";
  return username
    .split(/[._\s-]/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || username[0].toUpperCase();
}

export default function CounterPerformancePage() {
  const notify = useNotify();
  const { outletId: ctxOutletId } = useOutlet();
  const { user } = useAuth();
  const outletId = ctxOutletId || user?.outlet_id || null;

  const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
  const [dateTo, setDateTo] = useState(todayIso());
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getCounterPerformance({
        outletId, dateFrom, dateTo,
      });
      setRows((data?.results || []).map((r) => ({ ...r, id: r.user_id })));
      setMeta({ date_from: data?.date_from, date_to: data?.date_to });
    } catch {
      notify.error("Failed to load counter performance.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [outletId, dateFrom, dateTo, notify]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const totals = useMemo(() => {
    const totalCounts = rows.reduce((s, r) => s + (r.total_counts || 0), 0);
    const avgApproval = rows.length
      ? Math.round(rows.reduce((s, r) => s + (r.approval_rate || 0), 0) / rows.length)
      : 0;
    const topCounter = rows.length ? rows[0] : null;
    return { totalCounts, avgApproval, topCounter };
  }, [rows]);

  const columns = useMemo(() => [
    {
      field: "username", headerName: "Counter", flex: 1.2, minWidth: 200,
      renderCell: (p) => (
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Avatar sx={{ width: 30, height: 30, fontSize: "0.75rem", fontWeight: 700, bgcolor: "primary.main" }}>
            {initialsOf(p.value)}
          </Avatar>
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: "0.88rem" }}>{p.value}</Typography>
            {p.row.__topCounter && (
              <Typography sx={{ fontSize: "0.68rem", color: "primary.main", fontWeight: 600 }}>
                Top counter
              </Typography>
            )}
          </Box>
        </Stack>
      ),
    },
    { field: "total_counts", headerName: "Counts", width: 100, type: "number",
      renderCell: (p) => (
        <Typography sx={{ fontWeight: 700 }}>{Number(p.value || 0).toLocaleString()}</Typography>
      ),
    },
    { field: "active_days", headerName: "Days", width: 80, type: "number" },
    { field: "avg_per_day", headerName: "Avg / day", width: 100, type: "number" },
    {
      field: "approved_counts", headerName: "Approved", width: 110, type: "number",
      renderCell: (p) => (
        <Typography sx={{ color: "success.main", fontWeight: 600 }}>
          {Number(p.value || 0).toLocaleString()}
        </Typography>
      ),
    },
    {
      field: "rejected_counts", headerName: "Rejected", width: 110, type: "number",
      renderCell: (p) => {
        const v = Number(p.value || 0);
        return (
          <Typography sx={{ color: v > 0 ? "error.main" : "text.disabled", fontWeight: v > 0 ? 600 : 400 }}>
            {v.toLocaleString()}
          </Typography>
        );
      },
    },
    {
      field: "pending_counts", headerName: "Pending", width: 100, type: "number",
      renderCell: (p) => {
        const v = Number(p.value || 0);
        return (
          <Typography sx={{ color: v > 0 ? "warning.main" : "text.disabled", fontWeight: v > 0 ? 600 : 400 }}>
            {v.toLocaleString()}
          </Typography>
        );
      },
    },
    {
      field: "approval_rate", headerName: "Approval", width: 110, type: "number",
      renderCell: (p) => (
        <Chip
          size="small"
          label={`${Number(p.value || 0)}%`}
          color={approvalColor(Number(p.value || 0))}
          sx={{ fontWeight: 700, minWidth: 56 }}
        />
      ),
    },
    { field: "last_active", headerName: "Last active", width: 130,
      renderCell: (p) => <Typography sx={{ color: "text.secondary", fontSize: "0.85rem" }}>{p.value || "—"}</Typography>,
    },
  ], []);

  // Mark the top counter for the badge shown in the Counter cell.
  const rowsForTable = useMemo(
    () => rows.map((r, i) => ({ ...r, __topCounter: i === 0 })),
    [rows]
  );

  return (
    <Layout>
      <PageHeader
        title="Counter Performance"
        subtitle="Per-user stock-count metrics across the date range"
        icon={<LeaderboardIcon />}
      />

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField
          size="small" type="date" label="From"
          InputLabelProps={{ shrink: true }}
          value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
        />
        <TextField
          size="small" type="date" label="To"
          InputLabelProps={{ shrink: true }}
          value={dateTo} onChange={(e) => setDateTo(e.target.value)}
        />
      </Stack>

      <Box sx={{ mb: 2, display: "flex", gap: 3, flexWrap: "wrap" }}>
        <Stat label="Active counters" value={rows.length} icon={<PersonIcon fontSize="small" />} />
        <Stat label="Total counts" value={totals.totalCounts.toLocaleString()} />
        <Stat
          label="Avg approval"
          value={rows.length ? `${totals.avgApproval}%` : "—"}
          color={totals.avgApproval >= 90 ? "success.main" : totals.avgApproval >= 70 ? "warning.main" : "error.main"}
        />
        <Stat
          label="Top counter"
          value={totals.topCounter?.username || "—"}
          sub={totals.topCounter ? `${totals.topCounter.total_counts} counts` : ""}
        />
        {meta?.date_from && (
          <Stat label="Range" value={`${meta.date_from} → ${meta.date_to}`} />
        )}
      </Box>

      <DataTable
        rows={rowsForTable}
        columns={columns}
        loading={loading}
        emptyText="No count activity in this range"
      />
    </Layout>
  );
}

function Stat({ label, value, sub, color, icon }) {
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.25 }}>
        {icon}
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="h6" sx={{ color: color || "text.primary", lineHeight: 1.2 }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  );
}
