import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Stack,
  Chip, Paper, Alert, CircularProgress, Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DashboardIcon from "@mui/icons-material/Dashboard";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { getOperationsToday } from "../../api/operations";

/**
 * Super-admin-only snapshot of upload health across every outlet × report
 * type for a chosen date (defaults to today). Green means a SUCCESS batch
 * covers the date, amber means one is pending approval, red means no data
 * at all. The table is dense by design — when a date goes red across many
 * outlets, that's the signal something's wrong upstream.
 */
const STATUS_STYLES = {
  success: { bg: "#dcfce7", color: "#166534", label: "\u2713" },
  pending: { bg: "#fef3c7", color: "#92400e", label: "\u00b7" },
  missing: { bg: "#fee2e2", color: "#991b1b", label: "\u2715" },
};


function StatusCell({ cell }) {
  const st = STATUS_STYLES[cell?.status || "missing"];
  const title = cell?.status === "success"
    ? `Success${cell.rows ? ` · ${cell.rows} rows` : ""}${cell.amount ? ` · LKR ${Number(cell.amount).toLocaleString()}` : ""}`
    : cell?.status === "pending"
      ? "Pending admin approval"
      : "No data for this date";
  return (
    <Tooltip title={title} placement="top">
      <Box
        sx={{
          width: 28, height: 28, borderRadius: 1, mx: "auto",
          display: "grid", placeItems: "center",
          bgcolor: st.bg, color: st.color,
          fontWeight: 700, fontSize: "0.85rem",
        }}
      >
        {st.label}
      </Box>
    </Tooltip>
  );
}


export default function OperationsTodayPage() {
  const today = new Date().toLocaleDateString("en-CA");
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load(d = date) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getOperationsToday(d);
      setData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load operations snapshot.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(today); }, []); // eslint-disable-line

  const typeOrder = data?.type_order || [];
  const typeLabels = data?.type_labels || {};
  const totals = data?.totals || {};
  const coverage = totals?.type_coverage || {};

  return (
    <Layout>
      <PageHeader
        title="Operations — Today"
        subtitle="Super-admin snapshot · per-outlet upload coverage across every report type"
        icon={<DashboardIcon />}
        actions={
          <Stack direction="row" spacing={1}>
            <TextField
              type="date" size="small" label="Date"
              InputLabelProps={{ shrink: true }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => load(date)}
              disabled={loading}
            >
              Refresh
            </Button>
          </Stack>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Top KPIs */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: "Outlets", value: totals.outlets ?? "—", color: "text.primary" },
          { label: "Pending approvals", value: totals.pending_approvals ?? 0, color: totals.pending_approvals ? "warning.main" : "text.primary" },
          { label: "Sales today (LKR)", value: totals.today_sales_lkr != null ? Number(totals.today_sales_lkr).toLocaleString() : "—", color: "success.main" },
          { label: "Fully covered", value: data ? data.outlets.filter((o) => Object.values(o.types).every((c) => c.status === "success")).length : "—", color: "text.primary" },
        ].map((k) => (
          <Grid key={k.label} item xs={6} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{k.label}</Typography>
                <Typography variant="h3" sx={{ color: k.color, mt: 0.5 }}>{k.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Per-type coverage summary */}
      {data && (
        <Paper variant="outlined" sx={{ mb: 2, p: 1.5 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {typeOrder.map((t) => {
              const c = coverage[t] || { covered: 0, missing: 0, pending: 0 };
              const tone = c.missing === 0 ? "success" : c.covered === 0 ? "error" : "warning";
              return (
                <Chip
                  key={t}
                  size="small"
                  color={tone}
                  variant="outlined"
                  label={`${typeLabels[t] || t}: ${c.covered}/${totals.outlets || 0}${c.pending ? ` (+${c.pending} pending)` : ""}`}
                />
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* Main matrix */}
      <Paper variant="outlined" sx={{ overflow: "auto" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.04)", textAlign: "left" }}>
                <th style={{ padding: "8px 12px", position: "sticky", left: 0, background: "#fafafa" }}>Outlet</th>
                {typeOrder.map((t) => (
                  <th key={t} style={{ padding: "8px 6px", textAlign: "center", whiteSpace: "nowrap" }}>
                    {typeLabels[t] || t}
                  </th>
                ))}
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Sales today</th>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>Pending</th>
                <th style={{ padding: "8px 12px" }}>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {(data?.outlets || []).map((o) => (
                <tr key={o.outlet_id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td style={{ padding: "6px 12px", position: "sticky", left: 0, background: "white", fontWeight: 500 }}>
                    {o.outlet_name}
                    {o.short_code ? (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {o.short_code}
                      </Typography>
                    ) : null}
                  </td>
                  {typeOrder.map((t) => (
                    <td key={t} style={{ padding: "4px 6px", textAlign: "center" }}>
                      <StatusCell cell={o.types[t]} />
                    </td>
                  ))}
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {o.today_sales_lkr
                      ? `LKR ${Number(o.today_sales_lkr).toLocaleString()}`
                      : "—"}
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "center" }}>
                    {o.pending_approvals > 0 ? (
                      <Chip size="small" color="warning" label={o.pending_approvals} />
                    ) : "—"}
                  </td>
                  <td style={{ padding: "6px 12px", color: "rgba(0,0,0,0.6)" }}>
                    {o.last_activity_at ? new Date(o.last_activity_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {data?.outlets?.length === 0 && (
                <tr>
                  <td colSpan={typeOrder.length + 4} style={{ padding: "32px", textAlign: "center", color: "rgba(0,0,0,0.5)" }}>
                    No active outlets.
                  </td>
                </tr>
              )}
            </tbody>
          </Box>
        )}
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
        <Box component="span" sx={{ mr: 2 }}>
          <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, bgcolor: "#dcfce7", mr: 0.5, verticalAlign: "middle", borderRadius: 0.5 }} />
          success
        </Box>
        <Box component="span" sx={{ mr: 2 }}>
          <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, bgcolor: "#fef3c7", mr: 0.5, verticalAlign: "middle", borderRadius: 0.5 }} />
          pending approval
        </Box>
        <Box component="span" sx={{ mr: 2 }}>
          <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, bgcolor: "#fee2e2", mr: 0.5, verticalAlign: "middle", borderRadius: 0.5 }} />
          missing — no batch covers this date
        </Box>
      </Typography>
    </Layout>
  );
}
