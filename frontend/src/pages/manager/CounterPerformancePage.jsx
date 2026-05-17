import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Stack, Card, TextField, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, CircularProgress, Alert, Avatar, Tooltip,
} from "@mui/material";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import PersonIcon from "@mui/icons-material/Person";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import RefreshIcon from "@mui/icons-material/Refresh";
import { getCounterPerformance } from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function StatCard({ icon: Icon, label, value, color = "#6366f1", sub }) {
  return (
    <Card
      elevation={0}
      sx={{
        flex: 1,
        minWidth: 160,
        p: 2.5,
        border: "1px solid rgba(15,23,42,0.08)",
        borderRadius: 2,
        bgcolor: "#fff",
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <Box
          sx={{
            width: 40, height: 40, borderRadius: 1.5,
            display: "grid", placeItems: "center",
            bgcolor: `${color}18`,
            color,
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 20 }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: "0.78rem", color: "rgba(15,23,42,0.55)", fontWeight: 500, lineHeight: 1.2 }}>
            {label}
          </Typography>
          <Typography sx={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
            {value ?? "—"}
          </Typography>
          {sub && (
            <Typography sx={{ fontSize: "0.72rem", color: "rgba(15,23,42,0.45)", mt: 0.25 }}>
              {sub}
            </Typography>
          )}
        </Box>
      </Stack>
    </Card>
  );
}

function approvalColor(rate) {
  if (rate >= 90) return "success";
  if (rate >= 70) return "warning";
  return "error";
}

function UserAvatar({ username }) {
  const initials = username
    .split(/[._\s-]/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <Avatar sx={{ width: 32, height: 32, fontSize: "0.75rem", fontWeight: 700, bgcolor: "#6366f1", color: "#fff" }}>
      {initials || <PersonIcon sx={{ fontSize: 16 }} />}
    </Avatar>
  );
}

export default function CounterPerformancePage() {
  const { selectedOutlet } = useOutlet();
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getCounterPerformance({
        outletId: selectedOutlet?.id,
        dateFrom,
        dateTo,
      });
      setData(res.data);
    } catch {
      setError("Failed to load counter performance data.");
    } finally {
      setLoading(false);
    }
  }, [selectedOutlet, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.results || [];
  const totalCounts = rows.reduce((s, r) => s + r.total_counts, 0);
  const avgApproval = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.approval_rate, 0) / rows.length)
    : 0;
  const mostActive = rows[0];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }} flexWrap="wrap" gap={2}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 42, height: 42, borderRadius: 2,
              display: "grid", placeItems: "center",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 8px 20px rgba(99,102,241,0.35)",
            }}
          >
            <LeaderboardIcon sx={{ color: "#fff", fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: "1.25rem", color: "#0f172a", lineHeight: 1.1 }}>
              Counter Performance
            </Typography>
            <Typography sx={{ fontSize: "0.8rem", color: "rgba(15,23,42,0.55)" }}>
              Per-user stock count metrics
            </Typography>
          </Box>
        </Stack>

        {/* Date filters */}
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" gap={1}>
          <TextField
            label="From"
            type="date"
            size="small"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={load}
            sx={{
              textTransform: "none",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
              "&:hover": { background: "linear-gradient(135deg, #4f46e5, #7c3aed)" },
            }}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary cards */}
      <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
        <StatCard
          icon={PersonIcon}
          label="Active Counters"
          value={rows.length}
          color="#6366f1"
          sub={`${data?.date_from || ""} → ${data?.date_to || ""}`}
        />
        <StatCard
          icon={TrendingUpIcon}
          label="Total Counts"
          value={totalCounts.toLocaleString()}
          color="#22c55e"
          sub="across all users"
        />
        <StatCard
          icon={CheckCircleOutlineIcon}
          label="Avg Approval Rate"
          value={rows.length ? `${avgApproval}%` : "—"}
          color={avgApproval >= 90 ? "#22c55e" : avgApproval >= 70 ? "#f59e0b" : "#ef4444"}
        />
        <StatCard
          icon={CalendarTodayIcon}
          label="Top Counter"
          value={mostActive?.username || "—"}
          color="#3b82f6"
          sub={mostActive ? `${mostActive.total_counts} counts` : "no data"}
        />
      </Stack>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "#6366f1" }} />
        </Box>
      ) : rows.length === 0 ? (
        <Card
          elevation={0}
          sx={{ border: "1px solid rgba(15,23,42,0.08)", borderRadius: 2, bgcolor: "#fff", p: 4, textAlign: "center" }}
        >
          <LeaderboardIcon sx={{ fontSize: 40, color: "rgba(15,23,42,0.2)", mb: 1 }} />
          <Typography sx={{ color: "rgba(15,23,42,0.45)", fontSize: "0.9rem" }}>
            No count data for this period.
          </Typography>
        </Card>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: "1px solid rgba(15,23,42,0.08)", borderRadius: 2 }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "#f8fafc" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Counter
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Total Counts
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Active Days
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Avg / Day
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Approved
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Rejected
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Pending
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Approval Rate
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.78rem", color: "rgba(15,23,42,0.6)", py: 1.5 }}>
                  Last Active
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow
                  key={row.user_id}
                  sx={{
                    "&:last-child td": { border: 0 },
                    bgcolor: idx % 2 === 0 ? "#fff" : "#fafafa",
                    "&:hover": { bgcolor: "#f1f5f9" },
                  }}
                >
                  <TableCell sx={{ py: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1.25}>
                      <UserAvatar username={row.username} />
                      <Box>
                        <Typography sx={{ fontWeight: 600, fontSize: "0.85rem", color: "#0f172a" }}>
                          {row.username}
                        </Typography>
                        {idx === 0 && (
                          <Typography sx={{ fontSize: "0.68rem", color: "#6366f1", fontWeight: 600 }}>
                            Top counter
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>
                      {row.total_counts.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: "0.85rem", color: "#0f172a" }}>
                      {row.active_days}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: "0.85rem", color: "#0f172a" }}>
                      {row.avg_per_day}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: "0.85rem", color: "#22c55e", fontWeight: 600 }}>
                      {row.approved_counts.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: "0.85rem", color: row.rejected_counts > 0 ? "#ef4444" : "rgba(15,23,42,0.4)", fontWeight: row.rejected_counts > 0 ? 600 : 400 }}>
                      {row.rejected_counts.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: "0.85rem", color: row.pending_counts > 0 ? "#f59e0b" : "rgba(15,23,42,0.4)", fontWeight: row.pending_counts > 0 ? 600 : 400 }}>
                      {row.pending_counts.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={`${row.approval_rate}%`}>
                      <Chip
                        label={`${row.approval_rate}%`}
                        size="small"
                        color={approvalColor(row.approval_rate)}
                        sx={{ fontWeight: 700, fontSize: "0.78rem", minWidth: 56 }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: "0.82rem", color: "rgba(15,23,42,0.6)" }}>
                      {row.last_active || "—"}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
