import { useEffect, useState } from "react";
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, Chip,
} from "@mui/material";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import ReportFilterBar from "../../components/operations/ReportFilterBar";
import { getWastageReport } from "../../api/reports";

function lkr(n) {
  return `LKR ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
}

export default function WastageReportPage() {
  const today = new Date().toLocaleDateString("en-CA");
  const [filter, setFilter] = useState({ fromDate: isoDaysAgo(29), toDate: today, outletId: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getWastageReport(filter);
      setData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const rows = data?.rows || [];
  const totals = data?.totals || {};
  const pct = totals.wastage_pct_of_purchases;

  return (
    <Layout>
      <PageHeader
        title="Wastage Summary"
        subtitle="Super-admin report · Damage + Office + Verification losses per outlet"
        icon={<DeleteSweepIcon />}
      />

      <ReportFilterBar value={filter} onChange={setFilter} onApply={load} loading={loading} />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {[
          { label: "Damage",         value: lkr(totals.damage_value),       color: "error.main" },
          { label: "Office Use",     value: lkr(totals.office_value),       color: "info.main" },
          { label: "Verification",   value: lkr(totals.verification_value), color: "warning.main" },
          { label: "Total wastage",  value: lkr(totals.total_wastage),      color: "error.main", bold: true },
          { label: "Purchases (GRN)",value: lkr(totals.grn_value),          color: "text.secondary" },
          { label: "Wastage % of purchases", value: pct == null ? "—" : `${pct}%`, color: pct > 3 ? "error.main" : "success.main" },
        ].map((k) => (
          <Grid item xs={6} md={2} key={k.label}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{k.label}</Typography>
                <Typography
                  variant="h4"
                  sx={{ color: k.color, mt: 0.5, fontWeight: k.bold ? 700 : 500 }}
                >
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
                <th style={{ padding: "8px 12px" }}>Outlet</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Damage</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Office</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Verification</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Total Wastage</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Purchases (GRN)</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Wastage %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.outlet_id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td style={{ padding: "6px 12px" }}>
                    {r.outlet_name}
                    {r.short_code ? (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {r.short_code}
                      </Typography>
                    ) : null}
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lkr(r.damage_value)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lkr(r.office_value)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lkr(r.verification_value)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#b91c1c" }}>{lkr(r.total_wastage)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "rgba(0,0,0,0.6)" }}>{lkr(r.grn_value)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.wastage_pct_of_purchases == null ? (
                      "—"
                    ) : (
                      <Chip
                        size="small"
                        label={`${r.wastage_pct_of_purchases}%`}
                        color={r.wastage_pct_of_purchases > 3 ? "error" : r.wastage_pct_of_purchases > 1 ? "warning" : "success"}
                        variant="outlined"
                      />
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "rgba(0,0,0,0.5)" }}>
                    No wastage data in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </Box>
        )}
      </Paper>
    </Layout>
  );
}
