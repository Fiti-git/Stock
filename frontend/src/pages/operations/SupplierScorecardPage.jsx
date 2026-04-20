import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Paper, Chip, Stack, Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from "@mui/material";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import VisibilityIcon from "@mui/icons-material/Visibility";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import ReportFilterBar from "../../components/operations/ReportFilterBar";
import { getSupplierScorecard, getSupplierDetailScorecard } from "../../api/suppliers";

function lkr(n) {
  return `LKR ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
}

export default function SupplierScorecardPage() {
  const today = new Date().toLocaleDateString("en-CA");
  const [filter, setFilter] = useState({ fromDate: isoDaysAgo(89), toDate: today, outletId: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drill, setDrill] = useState(null);       // the supplier row clicked
  const [drillData, setDrillData] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getSupplierScorecard(filter);
      setData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load scorecard.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function openDrill(row) {
    setDrill(row);
    setDrillData(null);
    setDrillLoading(true);
    try {
      const { data } = await getSupplierDetailScorecard(row.code, {
        fromDate: filter.fromDate,
        toDate: filter.toDate,
      });
      setDrillData(data);
    } catch {
      setDrillData({ error: true });
    } finally {
      setDrillLoading(false);
    }
  }

  const rows = data?.suppliers || [];
  const totals = data?.totals || {};

  const kpis = [
    { label: "Suppliers", value: totals.suppliers ?? 0 },
    { label: "Purchases (GRN)", value: lkr(totals.grn_value), color: "success.main" },
    { label: "Returns to Supplier", value: lkr(totals.rts_value), color: "warning.main" },
    { label: "Net Purchases", value: lkr(totals.net_purchases), color: "text.primary" },
  ];

  return (
    <Layout>
      <PageHeader
        title="Supplier Scorecard"
        subtitle="Super-admin report · purchase value, returns rate, price drift per supplier"
        icon={<LeaderboardIcon />}
      />

      <ReportFilterBar value={filter} onChange={setFilter} onApply={load} loading={loading} />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {kpis.map((k) => (
          <Grid item xs={6} md={3} key={k.label}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{k.label}</Typography>
                <Typography variant="h4" sx={{ color: k.color || "text.primary", mt: 0.5 }}>
                  {k.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper variant="outlined" sx={{ overflow: "auto" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.04)", textAlign: "left" }}>
                <th style={{ padding: "8px 12px" }}>Code</th>
                <th style={{ padding: "8px 12px" }}>Name</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>GRN</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>RTS</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Net Purchases</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>RTS %</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Deliveries</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Items</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Avg / delivery</th>
                <th style={{ padding: "8px 12px" }}>Last delivery</th>
                <th style={{ padding: "8px 12px", width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td style={{ padding: "6px 12px", fontFamily: "monospace" }}>{r.code}</td>
                  <td style={{ padding: "6px 12px" }}>
                    {r.name || <span style={{ color: "rgba(0,0,0,0.4)" }}>— unnamed —</span>}
                    {r.is_active === false && (
                      <Chip size="small" label="inactive" sx={{ ml: 1 }} variant="outlined" />
                    )}
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lkr(r.grn_value)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.rts_value > 0 ? "#b45309" : "inherit" }}>{lkr(r.rts_value)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{lkr(r.net_purchases)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.rts_rate_pct == null ? "—" : (
                      <Chip
                        size="small"
                        label={`${r.rts_rate_pct}%`}
                        color={r.rts_rate_pct > 5 ? "error" : r.rts_rate_pct > 2 ? "warning" : "success"}
                        variant="outlined"
                      />
                    )}
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.deliveries}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.distinct_items}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lkr(r.avg_delivery_value)}</td>
                  <td style={{ padding: "6px 12px", color: "rgba(0,0,0,0.6)" }}>{r.last_delivery || "—"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right" }}>
                    <Button size="small" startIcon={<VisibilityIcon />} onClick={() => openDrill(r)}>
                      Drill
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={11} style={{ padding: 24, textAlign: "center", color: "rgba(0,0,0,0.5)" }}>
                    No supplier activity in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </Box>
        )}
      </Paper>

      {/* Supplier drill-down */}
      <Dialog open={!!drill} onClose={() => setDrill(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {drill?.code} · {drill?.name || "(unnamed)"}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {filter.fromDate} to {filter.toDate}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {drillLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : drillData?.error ? (
            <Alert severity="error">Failed to load supplier detail.</Alert>
          ) : drillData ? (
            <Stack spacing={3}>
              <Section title="Recent deliveries" empty="No deliveries in window.">
                {drillData.deliveries.length > 0 && (
                  <Table
                    headers={["DO#", "Date", "Invoice", "Outlet", "Value", "Lines"]}
                    rows={drillData.deliveries.map((d) => [
                      d.do_no, d.txn_date, d.invoice_no || "—",
                      d.outlet_name || "—",
                      { value: lkr(d.value), numeric: true },
                      { value: d.lines, numeric: true },
                    ])}
                  />
                )}
              </Section>

              <Section title="Top items supplied" empty="No items.">
                {drillData.top_items.length > 0 && (
                  <Table
                    headers={["Item Code", "Description", "Qty", "Value", "Deliveries"]}
                    rows={drillData.top_items.map((r) => [
                      { value: r.item_code, mono: true },
                      r.description,
                      { value: Number(r.qty).toLocaleString(), numeric: true },
                      { value: lkr(r.value), numeric: true },
                      { value: r.deliveries, numeric: true },
                    ])}
                  />
                )}
              </Section>

              <Section
                title="Cost-price drift (top 25)"
                empty="No price drift in this window."
              >
                {drillData.cost_drift.length > 0 && (
                  <Table
                    headers={["Item Code", "Description", "First Cost", "First Date", "Latest Cost", "Latest Date", "Drift %"]}
                    rows={drillData.cost_drift.map((r) => [
                      { value: r.item_code, mono: true },
                      r.description,
                      { value: lkr(r.first_cost), numeric: true },
                      r.first_date,
                      { value: lkr(r.latest_cost), numeric: true },
                      r.latest_date,
                      {
                        value: (
                          <Chip
                            size="small"
                            label={`${r.drift_pct > 0 ? "+" : ""}${r.drift_pct}%`}
                            color={r.drift_pct > 10 ? "error" : r.drift_pct > 2 ? "warning" : "default"}
                            variant="outlined"
                          />
                        ),
                      },
                    ])}
                  />
                )}
              </Section>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDrill(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}


function Section({ title, empty, children }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
      {children || (
        <Typography variant="body2" color="text.secondary">{empty}</Typography>
      )}
    </Box>
  );
}

function Table({ headers, rows }) {
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ background: "rgba(0,0,0,0.04)", textAlign: "left" }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: "6px 10px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              {r.map((cell, j) => {
                const o = typeof cell === "object" && cell !== null && !("props" in cell) ? cell : null;
                const content = o ? o.value : cell;
                return (
                  <td
                    key={j}
                    style={{
                      padding: "4px 10px",
                      textAlign: o?.numeric ? "right" : "left",
                      fontFamily: o?.mono ? "monospace" : "inherit",
                      fontVariantNumeric: o?.numeric ? "tabular-nums" : "normal",
                    }}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}
