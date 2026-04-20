import { useEffect, useState } from "react";
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  CircularProgress, Alert,
} from "@mui/material";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import ReportFilterBar from "../../components/operations/ReportFilterBar";
import { getDailySalesReport } from "../../api/reports";

function lkr(n) {
  return `LKR ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
}

export default function DailySalesReportPage() {
  const today = new Date().toLocaleDateString("en-CA");
  const [filter, setFilter] = useState({ fromDate: isoDaysAgo(29), toDate: today, outletId: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getDailySalesReport(filter);
      setData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const totals = data?.totals || {};
  const kpis = [
    { label: "Bills",         value: totals.bills ?? 0 },
    { label: "Gross sales",   value: lkr(totals.gross_sales) },
    { label: "Discount",      value: lkr(totals.discount), color: "warning.main" },
    { label: "Returns",       value: lkr(totals.returns_value), color: "error.main" },
    { label: "Net sales",     value: lkr(totals.net_sales), color: "success.main" },
  ];

  return (
    <Layout>
      <PageHeader
        title="Daily Sales Summary"
        subtitle="Super-admin report · bills / gross / returns / net per outlet per day"
        icon={<PointOfSaleIcon />}
      />

      <ReportFilterBar
        value={filter}
        onChange={setFilter}
        onApply={load}
        loading={loading}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {kpis.map((k) => (
          <Grid item key={k.label} xs={6} md={true}>
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
                {["Date", "Outlet", "Bills", "Items", "Gross", "Discount", "Returns", "Net", "Avg Bill"].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      textAlign: i >= 2 ? "right" : "left",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((r, i) => (
                <tr key={`${r.outlet_id}-${r.date}-${i}`} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td style={{ padding: "6px 12px" }}>{r.date}</td>
                  <td style={{ padding: "6px 12px" }}>{r.outlet_name || "—"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.bills}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(r.items || 0).toLocaleString()}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lkr(r.gross_sales)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: "#b45309", fontVariantNumeric: "tabular-nums" }}>{lkr(r.discount)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: r.returns_value < 0 ? "#b91c1c" : "inherit", fontVariantNumeric: "tabular-nums" }}>{lkr(r.returns_value)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{lkr(r.net_sales)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lkr(r.avg_bill_value)}</td>
                </tr>
              ))}
              {(data?.rows?.length ?? 0) === 0 && !loading && (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: "center", color: "rgba(0,0,0,0.5)" }}>
                    No sales data in this window.
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
